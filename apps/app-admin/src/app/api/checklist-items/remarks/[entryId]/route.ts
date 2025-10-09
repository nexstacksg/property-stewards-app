import { NextRequest, NextResponse } from 'next/server'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import prisma from '@/lib/prisma'
import { s3Client, BUCKET_NAME, PUBLIC_URL } from '@/lib/s3-client'

const ALLOWED_CONDITIONS = ['GOOD', 'FAIR', 'UNSATISFACTORY', 'UN_OBSERVABLE', 'NOT_APPLICABLE']

function normalizeCondition(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.toUpperCase().replace(/\s|-/g, '_')
}

const entryInclude = {
  inspector: { select: { id: true, name: true } },
  user: { select: { id: true, username: true, email: true } },
  media: {
    orderBy: { order: 'asc' },
  },
  task: {
    select: {
      id: true,
      name: true,
      status: true,
      photos: true,
      videos: true,
      condition: true,
    },
  },
} as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { entryId } = await params
    const body = await request.json()
    const remark = typeof body.remark === 'string' ? body.remark.trim() : undefined
    const causeValue = typeof body.cause === 'string' ? body.cause.trim() : undefined
    const resolutionValue = typeof body.resolution === 'string' ? body.resolution.trim() : undefined
    const normalizedCondition = normalizeCondition(body.condition)

    const rawMediaUpdates = Array.isArray(body.mediaUpdates) ? body.mediaUpdates : []
    const mediaUpdates = rawMediaUpdates
      .map((entry: any) => {
        if (!entry || typeof entry !== 'object') return null
        const id = typeof entry.id === 'string' ? entry.id : null
        if (!id) return null
        if (entry.caption === null) {
          return { id, caption: null }
        }
        if (typeof entry.caption === 'string') {
          const trimmed = entry.caption.trim()
          return { id, caption: trimmed.length > 0 ? trimmed : null }
        }
        return { id, caption: null }
      })
      .filter((entry: any): entry is { id: string; caption: string | null } => Boolean(entry))

    if (
      !remark
      && typeof normalizedCondition === 'undefined'
      && typeof causeValue === 'undefined'
      && typeof resolutionValue === 'undefined'
      && mediaUpdates.length === 0
    ) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    if (normalizedCondition && !ALLOWED_CONDITIONS.includes(normalizedCondition)) {
      return NextResponse.json({ error: 'Invalid condition value' }, { status: 400 })
    }

    const updatedEntry = await prisma.$transaction(async (tx) => {
      const existing = await tx.itemEntry.findUnique({ where: { id: entryId }, select: { id: true, taskId: true } })
      if (!existing) {
        throw new Error('NOT_FOUND')
      }

      const updateData: any = {}
      if (typeof remark === 'string') {
        updateData.remarks = remark.length > 0 ? remark : null
      }
      if (typeof causeValue === 'string') {
        updateData.cause = causeValue.length > 0 ? causeValue : null
      }
      if (typeof resolutionValue === 'string') {
        updateData.resolution = resolutionValue.length > 0 ? resolutionValue : null
      }
      if (typeof normalizedCondition !== 'undefined') {
        updateData.condition = normalizedCondition ?? null
      }

      if (Object.keys(updateData).length > 0) {
        await tx.itemEntry.update({ where: { id: entryId }, data: updateData })
      }

      if (mediaUpdates.length > 0) {
        const mediaIds = mediaUpdates.map((entry) => entry.id)
        const existingMedia = await tx.itemEntryMedia.findMany({
          where: { entryId, id: { in: mediaIds } },
          select: { id: true },
        })
        const existingSet = new Set(existingMedia.map((item) => item.id))
        const missing = mediaIds.filter((id) => !existingSet.has(id))
        if (missing.length > 0) {
          throw new Error('MEDIA_NOT_FOUND')
        }

        await Promise.all(
          mediaUpdates.map((update) =>
            tx.itemEntryMedia.update({ where: { id: update.id }, data: { caption: update.caption } })
          )
        )
      }

      const entry = await tx.itemEntry.findUnique({
        where: { id: entryId },
        include: entryInclude,
      })

      if (!entry) {
        throw new Error('NOT_FOUND')
      }

      if (typeof normalizedCondition !== 'undefined' && entry.task) {
        const updatedTask = await tx.checklistTask.update({
          where: { id: entry.task.id },
          data: { condition: normalizedCondition ?? null }
        })
        entry.task = {
          ...entry.task,
          condition: updatedTask.condition,
        }
      }

      return entry
    })

    return NextResponse.json(updatedEntry)
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Remark not found' }, { status: 404 })
    }
    if (error instanceof Error && error.message === 'MEDIA_NOT_FOUND') {
      return NextResponse.json({ error: 'Media item not found for this remark' }, { status: 400 })
    }
    console.error('Error updating remark:', error)
    return NextResponse.json({ error: 'Failed to update remark' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { entryId } = await params
    const entry = await prisma.itemEntry.findUnique({
      where: { id: entryId },
      include: {
        task: {
          select: {
            id: true,
            photos: true,
            videos: true,
          }
        }
      }
    })

    if (!entry) {
      return NextResponse.json({ error: 'Remark not found' }, { status: 404 })
    }

    const photosToRemove = (entry.task?.photos || []).filter((url) => url.includes(`/entries/${entryId}/`))
    const videosToRemove = (entry.task?.videos || []).filter((url) => url.includes(`/entries/${entryId}/`))

    if (entry.task && (photosToRemove.length > 0 || videosToRemove.length > 0)) {
      const remainingPhotos = entry.task.photos.filter((url) => !url.includes(`/entries/${entryId}/`))
      const remainingVideos = entry.task.videos.filter((url) => !url.includes(`/entries/${entryId}/`))

      await prisma.checklistTask.update({
        where: { id: entry.task.id },
        data: {
          photos: remainingPhotos,
          videos: remainingVideos,
        }
      })

      const urlsToRemove = [...photosToRemove, ...videosToRemove]
      const prefix = `${PUBLIC_URL}/`
      await Promise.all(urlsToRemove.map(async (url) => {
        if (!url.startsWith(prefix)) return
        const key = url.slice(prefix.length)
        try {
          await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key } as any))
        } catch (err) {
          console.error('Failed to delete media from storage:', err)
        }
      }))
    }

    await prisma.itemEntry.delete({ where: { id: entryId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting remark:', error)
    return NextResponse.json({ error: 'Failed to delete remark' }, { status: 500 })
  }
}
