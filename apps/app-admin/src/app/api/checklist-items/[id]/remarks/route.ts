import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthSecret } from '@/lib/auth-secret'
import { verifyJwt } from '@/lib/jwt'
import { s3Client, BUCKET_NAME, PUBLIC_URL, SPACE_DIRECTORY } from '@/lib/s3-client'
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

const ALLOWED_CONDITIONS = ['GOOD', 'FAIR', 'UNSATISFACTORY', 'NOT_APPLICABLE', 'UNOBSERVABLE']

function toStringValue(value: FormDataEntryValue | null | undefined): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  return undefined
}

function normalizeCondition(value: unknown) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.toUpperCase().replace(/\s|-/g, '_')
}

async function uploadFile(
  file: File,
  workOrderId: string,
  entryId: string,
  type: 'photos' | 'videos'
) {
  const contentType = file.type || 'application/octet-stream'
  const extensionFromType = contentType.includes('/') ? contentType.split('/')[1] : ''
  const originalName = typeof (file as any).name === 'string' ? (file as any).name : ''
  const extensionFromName = originalName.includes('.') ? originalName.split('.').pop() || '' : ''
  const extension = extensionFromType || extensionFromName || (type === 'videos' ? 'mp4' : 'jpeg')

  const filename = `${randomUUID()}.${extension}`
  const key = `${SPACE_DIRECTORY}/work-orders/${workOrderId || 'unknown'}/entries/${entryId}/${type}/${filename}`

  const buffer = Buffer.from(await file.arrayBuffer())
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read'
  } as any))

  return `${PUBLIC_URL}/${key}`
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const contentType = request.headers.get('content-type') || ''

    let remark: string | undefined
    let taskId: string | undefined
    let condition: string | undefined
    let workOrderId = 'unknown'
    let photoFiles: File[] = []
    let videoFiles: File[] = []

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      remark = toStringValue(form.get('remark'))
      taskId = toStringValue(form.get('taskId'))
      condition = toStringValue(form.get('condition'))
      const rawWorkOrderId = toStringValue(form.get('workOrderId'))
      if (rawWorkOrderId) workOrderId = rawWorkOrderId
      photoFiles = form
        .getAll('photos')
        .filter((value): value is File => value instanceof File && value.size > 0)
      videoFiles = form
        .getAll('videos')
        .filter((value): value is File => value instanceof File && value.size > 0)
    } else {
      const body = await request.json()
      remark = typeof body.remark === 'string' ? body.remark.trim() : undefined
      taskId = typeof body.taskId === 'string' ? body.taskId : undefined
      condition = typeof body.condition === 'string' ? body.condition : undefined
      if (typeof body.workOrderId === 'string' && body.workOrderId.trim().length > 0) {
        workOrderId = body.workOrderId.trim()
      }
    }

    const normalizedTaskId = taskId && taskId.trim().length > 0 ? taskId.trim() : null

    if (!normalizedTaskId) {
      return NextResponse.json({ error: 'Subtask is required' }, { status: 400 })
    }

    const normalizedCondition = condition && condition.trim().length > 0
      ? condition.trim().toUpperCase().replace(/\s|-/g, '_')
      : undefined

    if (normalizedCondition && !ALLOWED_CONDITIONS.includes(normalizedCondition)) {
      return NextResponse.json({ error: 'Invalid condition value' }, { status: 400 })
    }

    const trimmedRemark = remark ? remark.trim() : ''
    const requiresRemark = normalizedCondition && normalizedCondition !== 'GOOD'
    const requiresPhoto = normalizedCondition
      && normalizedCondition !== 'NOT_APPLICABLE'
      && normalizedCondition !== 'UNOBSERVABLE'
    const hasPhotos = photoFiles.length > 0

    if (requiresRemark && trimmedRemark.length === 0) {
      return NextResponse.json({ error: 'Remarks are required for this status.' }, { status: 400 })
    }

    if (hasPhotos && trimmedRemark.length === 0) {
      return NextResponse.json({ error: 'Please provide remarks when uploading photos.' }, { status: 400 })
    }

    if (requiresPhoto && !hasPhotos) {
      return NextResponse.json({ error: 'Please attach at least one photo for this status.' }, { status: 400 })
    }

    const invalidPhoto = photoFiles.find((file) => !(file.type || '').startsWith('image/'))
    if (invalidPhoto) {
      return NextResponse.json({ error: 'Only image files can be attached as photos' }, { status: 400 })
    }

    const invalidVideo = videoFiles.find((file) => !(file.type || '').startsWith('video/'))
    if (invalidVideo) {
      return NextResponse.json({ error: 'Only video files can be attached as videos' }, { status: 400 })
    }

    const targetTask = await prisma.checklistTask.findUnique({
      where: { id: normalizedTaskId },
      select: {
        id: true,
        itemId: true,
        photos: true,
        videos: true,
      },
    })

    if (!targetTask || targetTask.itemId !== id) {
      return NextResponse.json({ error: 'Selected subtask was not found for this checklist item' }, { status: 400 })
    }

    const sessionToken = request.cookies.get('session')?.value
    let sessionUserId: string | null = null
    if (sessionToken) {
      const secret = getAuthSecret()
      if (secret) {
        try {
          const payload = await verifyJwt<{ sub?: string }>(sessionToken, secret)
          if (payload?.sub) sessionUserId = payload.sub
        } catch (err) {
          console.debug('Skipping user link for remark; session verification failed', err)
        }
      }
    }

    let sessionUserExists = false
    if (sessionUserId) {
      try {
        sessionUserExists = Boolean(await prisma.user.findUnique({ where: { id: sessionUserId }, select: { id: true } }))
      } catch (err) {
        console.debug('Failed to resolve session user while saving remark', err)
      }
    }

    const entryData: any = {
      itemId: id,
      taskId: targetTask.id,
      remarks: trimmedRemark.length > 0 ? trimmedRemark : null,
    }

    if (typeof normalizedCondition !== 'undefined') {
      entryData.condition = normalizedCondition ?? null
    }

    if (sessionUserId && sessionUserExists) {
      entryData.userId = sessionUserId
    }

    const entry = await prisma.itemEntry.create({ data: entryData })

    const photoUrls = await Promise.all(photoFiles.map((file) => uploadFile(file, workOrderId, entry.id, 'photos')))
    const videoUrls = await Promise.all(videoFiles.map((file) => uploadFile(file, workOrderId, entry.id, 'videos')))

    if (photoUrls.length > 0 || videoUrls.length > 0) {
      await prisma.itemEntry.update({
        where: { id: entry.id },
        data: {
          ...(photoUrls.length > 0 ? { photos: { push: photoUrls } } : {}),
          ...(videoUrls.length > 0 ? { videos: { push: videoUrls } } : {}),
        },
      })
    }

    if (typeof normalizedCondition !== 'undefined') {
      await prisma.checklistTask.update({
        where: { id: targetTask.id },
        data: { condition: normalizedCondition ?? null },
      })
    }

    const responseEntry = await prisma.itemEntry.findUnique({
      where: { id: entry.id },
      include: {
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
      },
    })

    return NextResponse.json(responseEntry)
  } catch (error) {
    console.error('Error saving checklist item remark:', error)
    return NextResponse.json({ error: 'Failed to save remark' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { entryId } = await params
    const body = await request.json()
    const remark = typeof body.remark === 'string' ? body.remark.trim() : undefined
    const conditionValue = normalizeCondition(body.condition)

    if (!remark && typeof conditionValue === 'undefined') {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    const updateData: any = {}
    if (typeof remark === 'string') {
      updateData.remarks = remark.length > 0 ? remark : null
    }
    if (typeof conditionValue !== 'undefined') {
      if (conditionValue && !ALLOWED_CONDITIONS.includes(conditionValue)) {
        return NextResponse.json({ error: 'Invalid condition value' }, { status: 400 })
      }
      updateData.condition = conditionValue ?? null
    }

    const updatedEntry = await prisma.itemEntry.update({
      where: { id: entryId },
      data: updateData,
      include: {
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
      },
    })

    if (typeof conditionValue !== 'undefined' && updatedEntry.task) {
      await prisma.checklistTask.update({
        where: { id: updatedEntry.task.id },
        data: { condition: conditionValue ?? null }
      })
      updatedEntry.task.condition = conditionValue ?? null
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
      await Promise.all(urlsToRemove.map(async (url) => {
        const prefix = `${PUBLIC_URL}/`
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
