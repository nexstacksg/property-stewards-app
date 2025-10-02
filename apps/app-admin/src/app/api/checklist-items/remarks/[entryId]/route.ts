import { NextRequest, NextResponse } from 'next/server'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import prisma from '@/lib/prisma'
import { s3Client, BUCKET_NAME, PUBLIC_URL } from '@/lib/s3-client'

const ALLOWED_CONDITIONS = ['GOOD', 'FAIR', 'UNSATISFACTORY', 'NOT_APPLICABLE', 'UNOBSERVABLE']

function normalizeCondition(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.toUpperCase().replace(/\s|-/g, '_')
}

const entryInclude = {
  inspector: { select: { id: true, name: true } },
  user: { select: { id: true, username: true, email: true } },
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
    const normalizedCondition = normalizeCondition(body.condition)

    if (!remark && typeof normalizedCondition === 'undefined') {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    if (normalizedCondition && !ALLOWED_CONDITIONS.includes(normalizedCondition)) {
      return NextResponse.json({ error: 'Invalid condition value' }, { status: 400 })
    }

    const updateData: any = {}
    if (typeof remark === 'string') {
      updateData.remarks = remark.length > 0 ? remark : null
    }
    if (typeof normalizedCondition !== 'undefined') {
      updateData.condition = normalizedCondition ?? null
    }

    const updatedEntry = await prisma.itemEntry.update({
      where: { id: entryId },
      data: updateData,
      include: entryInclude,
    })

    if (typeof normalizedCondition !== 'undefined' && updatedEntry.task) {
      await prisma.checklistTask.update({
        where: { id: updatedEntry.task.id },
        data: { condition: normalizedCondition ?? null }
      })
      updatedEntry.task.condition = normalizedCondition ?? null
    }

    return NextResponse.json(updatedEntry)
  } catch (error) {
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
