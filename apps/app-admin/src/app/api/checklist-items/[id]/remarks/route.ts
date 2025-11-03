import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthSecret } from '@/lib/auth-secret'
import { verifyJwt } from '@/lib/jwt'
import { s3Client, BUCKET_NAME, PUBLIC_URL, SPACE_DIRECTORY } from '@/lib/s3-client'
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'

const ALLOWED_CONDITIONS = ['GOOD', 'FAIR', 'UNSATISFACTORY', 'UN_OBSERVABLE', 'NOT_APPLICABLE']

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
    let cause: string | undefined
    let resolution: string | undefined
    let taskId: string | undefined
    let locationId: string | undefined
    let conditionsByTaskJson: string | undefined
    let findingsJson: string | undefined
    let condition: string | undefined
    let workOrderId = 'unknown'
    let photoFiles: File[] = []
    let videoFiles: File[] = []
    let photoCaptions: string[] = []
    let videoCaptions: string[] = []

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      remark = toStringValue(form.get('remark'))
      cause = toStringValue(form.get('cause'))
      resolution = toStringValue(form.get('resolution'))
      taskId = toStringValue(form.get('taskId'))
      locationId = toStringValue(form.get('locationId'))
      conditionsByTaskJson = toStringValue(form.get('conditionsByTask'))
      findingsJson = toStringValue(form.get('findings'))
      condition = toStringValue(form.get('condition'))
      const rawWorkOrderId = toStringValue(form.get('workOrderId'))
      if (rawWorkOrderId) workOrderId = rawWorkOrderId
      photoFiles = form
        .getAll('photos')
        .filter((value): value is File => value instanceof File && value.size > 0)
      const rawPhotoCaptions = form.getAll('photoCaptions')
      photoCaptions = rawPhotoCaptions
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
      videoFiles = form
        .getAll('videos')
        .filter((value): value is File => value instanceof File && value.size > 0)
      const rawVideoCaptions = form.getAll('videoCaptions')
      videoCaptions = rawVideoCaptions
        .map((value) => (typeof value === 'string' ? value.trim() : ''))

      // Per-task media arrays (aligned by index)
      // taskPhotos[], taskPhotoTaskIds[], taskPhotoCaptions[]
      // taskVideos[], taskVideoTaskIds[], taskVideoCaptions[]
      const rawTaskPhotoFiles = form.getAll('taskPhotos').filter((v): v is File => v instanceof File && v.size > 0)
      const rawTaskPhotoTaskIds = form.getAll('taskPhotoTaskIds').map((v) => (typeof v === 'string' ? v : '')).filter(Boolean)
      const rawTaskPhotoCaptions = form.getAll('taskPhotoCaptions').map((v) => (typeof v === 'string' ? v.trim() : ''))
      const rawTaskVideoFiles = form.getAll('taskVideos').filter((v): v is File => v instanceof File && v.size > 0)
      const rawTaskVideoTaskIds = form.getAll('taskVideoTaskIds').map((v) => (typeof v === 'string' ? v : '')).filter(Boolean)
      const rawTaskVideoCaptions = form.getAll('taskVideoCaptions').map((v) => (typeof v === 'string' ? v.trim() : ''))

      // Compose them into arrays of tuples [{ taskId, file, caption }]
      var taskPhotoUploads: Array<{ taskId: string; file: File; caption: string | null }> = []
      var taskVideoUploads: Array<{ taskId: string; file: File; caption: string | null }> = []
      for (let i = 0; i < rawTaskPhotoFiles.length; i++) {
        const file = rawTaskPhotoFiles[i]
        const tid = rawTaskPhotoTaskIds[i] || rawTaskPhotoTaskIds[rawTaskPhotoTaskIds.length - 1]
        const capRaw = rawTaskPhotoCaptions[i] || ''
        taskPhotoUploads.push({ taskId: tid, file, caption: capRaw.trim().length > 0 ? capRaw.trim() : null })
      }
      for (let i = 0; i < rawTaskVideoFiles.length; i++) {
        const file = rawTaskVideoFiles[i]
        const tid = rawTaskVideoTaskIds[i] || rawTaskVideoTaskIds[rawTaskVideoTaskIds.length - 1]
        const capRaw = rawTaskVideoCaptions[i] || ''
        taskVideoUploads.push({ taskId: tid, file, caption: capRaw.trim().length > 0 ? capRaw.trim() : null })
      }

      ;(request as any)._taskPhotoUploads = taskPhotoUploads
      ;(request as any)._taskVideoUploads = taskVideoUploads
    } else {
      const body = await request.json()
      remark = typeof body.remark === 'string' ? body.remark.trim() : undefined
      cause = typeof body.cause === 'string' ? body.cause.trim() : undefined
      resolution = typeof body.resolution === 'string' ? body.resolution.trim() : undefined
      taskId = typeof body.taskId === 'string' ? body.taskId : undefined
      locationId = typeof body.locationId === 'string' ? body.locationId : undefined
      if (Array.isArray(body.conditionsByTask)) {
        conditionsByTaskJson = JSON.stringify(body.conditionsByTask)
      } else if (typeof body.conditionsByTask === 'string') {
        conditionsByTaskJson = body.conditionsByTask
      }
      if (Array.isArray(body.findings)) {
        findingsJson = JSON.stringify(body.findings)
      } else if (typeof body.findings === 'string') {
        findingsJson = body.findings
      }
      condition = typeof body.condition === 'string' ? body.condition : undefined
      if (typeof body.workOrderId === 'string' && body.workOrderId.trim().length > 0) {
        workOrderId = body.workOrderId.trim()
      }
      if (Array.isArray(body.photoCaptions)) {
        photoCaptions = body.photoCaptions
          .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
      }
      if (Array.isArray(body.videoCaptions)) {
        videoCaptions = body.videoCaptions
          .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
      }
    }

    const normalizedTaskId = taskId && taskId.trim().length > 0 ? taskId.trim() : null
    const normalizedLocationId = locationId && locationId.trim().length > 0 ? locationId.trim() : null

    // Parse findings when provided (preferred)
    type Finding = { taskId: string; condition: string; cause?: string; resolution?: string }
    let findings: Finding[] = []
    if (findingsJson) {
      try {
        const parsed = JSON.parse(findingsJson)
        if (Array.isArray(parsed)) {
          findings = parsed
            .map((e: any) => ({
              taskId: typeof e?.taskId === 'string' ? e.taskId : '',
              condition: typeof e?.condition === 'string' ? e.condition.trim().toUpperCase().replace(/\s|-/g, '_') : '',
              cause: typeof e?.cause === 'string' ? e.cause.trim() : undefined,
              resolution: typeof e?.resolution === 'string' ? e.resolution.trim() : undefined,
            }))
            .filter((e) => e.taskId && e.condition && ALLOWED_CONDITIONS.includes(e.condition))
        }
      } catch {}
    }

    // Parse legacy bulk conditions (location-level update)
    let conditionsByTask: Array<{ taskId: string; condition: string }> = []
    if (conditionsByTaskJson) {
      try {
        const parsed = JSON.parse(conditionsByTaskJson)
        if (Array.isArray(parsed)) {
          conditionsByTask = parsed
            .map((e: any) => ({
              taskId: typeof e?.taskId === 'string' ? e.taskId : '',
              condition: typeof e?.condition === 'string' ? e.condition.trim().toUpperCase().replace(/\s|-/g, '_') : ''
            }))
            .filter((e) => e.taskId && e.condition && ALLOWED_CONDITIONS.includes(e.condition))
        }
      } catch {}
    }
    const isLocationMode = !normalizedTaskId && normalizedLocationId
    const isBulkLocationMode = isLocationMode && (findings.length > 0 || conditionsByTask.length > 0)

    if (!normalizedTaskId && !isLocationMode) {
      return NextResponse.json({ error: 'Subtask is required (or provide locationId for location-level remark).'}, { status: 400 })
    }

    const normalizedCondition = condition && condition.trim().length > 0
      ? condition.trim().toUpperCase().replace(/\s|-/g, '_')
      : undefined

    if (normalizedCondition && !ALLOWED_CONDITIONS.includes(normalizedCondition)) {
      return NextResponse.json({ error: 'Invalid condition value' }, { status: 400 })
    }

    const trimmedRemark = remark ? remark.trim() : ''
    let requiresRemark = Boolean(normalizedCondition && normalizedCondition !== 'GOOD')
    let requiresPhoto = Boolean(normalizedCondition && normalizedCondition !== 'NOT_APPLICABLE' && normalizedCondition !== 'UN_OBSERVABLE')
    const hasPhotos = photoFiles.length > 0
    if (isBulkLocationMode) {
      const conds = (findings.length > 0 ? findings.map((e) => e.condition) : conditionsByTask.map((e) => e.condition))
      // UI requires all conditions to have media; keep remark gating minimal
      requiresRemark = conds.some((c) => c !== 'GOOD' && c !== 'NOT_APPLICABLE' && c !== 'UN_OBSERVABLE')
      requiresPhoto = false // task-level media will be validated per finding below
    }

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

    let targetTask: { id: string; itemId: string; photos: string[]; videos: string[] } | null = null
    if (normalizedTaskId) {
      targetTask = await prisma.checklistTask.findUnique({
        where: { id: normalizedTaskId },
        select: { id: true, itemId: true, photos: true, videos: true },
      }) as any
      if (!targetTask || targetTask.itemId !== id) {
        return NextResponse.json({ error: 'Selected subtask was not found for this checklist item' }, { status: 400 })
      }
    } else if (isBulkLocationMode) {
      // Validate location belongs to this item and tasks belong to this location or item
      const location = await prisma.contractChecklistLocation.findUnique({ where: { id: normalizedLocationId }, select: { id: true, itemId: true } })
      if (!location || location.itemId !== id) {
        return NextResponse.json({ error: 'Location not found for this checklist item' }, { status: 400 })
      }
      const taskIds = (findings.length > 0 ? findings.map((e) => e.taskId) : conditionsByTask.map((e) => e.taskId))
      const tasks = await prisma.checklistTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, itemId: true, locationId: true } })
      const taskSet = new Set(tasks.filter((t) => t.itemId === id).map((t) => t.id))
      const missing = taskIds.filter((tid) => !taskSet.has(tid))
      if (missing.length > 0) {
        return NextResponse.json({ error: 'One or more subtasks are invalid for this checklist item' }, { status: 400 })
      }
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
      taskId: isBulkLocationMode ? null : targetTask!.id,
      locationId: isBulkLocationMode ? normalizedLocationId : (targetTask as any)?.locationId ?? null,
      remarks: trimmedRemark.length > 0 ? trimmedRemark : null,
    }

    if (typeof cause === 'string') {
      const trimmedCause = cause.trim()
      entryData.cause = trimmedCause.length > 0 ? trimmedCause : null
    }

    if (typeof resolution === 'string') {
      const trimmedResolution = resolution.trim()
      entryData.resolution = trimmedResolution.length > 0 ? trimmedResolution : null
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
      const mediaCreateData: Array<{ entryId: string; url: string; caption: string | null; type: 'PHOTO' | 'VIDEO'; order: number }> = []

      if (photoUrls.length > 0) {
        const existingPhotoCount = await prisma.itemEntryMedia.count({ where: { entryId: entry.id, type: 'PHOTO' } })
        photoUrls.forEach((url, index) => {
          const rawCaption = photoCaptions[index] || ''
          const caption = rawCaption.trim().length > 0 ? rawCaption.trim() : null
          mediaCreateData.push({ entryId: entry.id, url, caption, type: 'PHOTO', order: existingPhotoCount + index })
        })
      }

      if (videoUrls.length > 0) {
        const existingVideoCount = await prisma.itemEntryMedia.count({ where: { entryId: entry.id, type: 'VIDEO' } })
        videoUrls.forEach((url, index) => {
          const rawCaption = videoCaptions[index] || ''
          const caption = rawCaption.trim().length > 0 ? rawCaption.trim() : null
          mediaCreateData.push({ entryId: entry.id, url, caption, type: 'VIDEO', order: existingVideoCount + index })
        })
      }

      if (mediaCreateData.length > 0) {
        await prisma.itemEntryMedia.createMany({ data: mediaCreateData })
      }

      // Maintain legacy arrays for compatibility
      await prisma.itemEntry.update({
        where: { id: entry.id },
        data: {
          ...(photoUrls.length > 0 ? { photos: { push: photoUrls } } : {}),
          ...(videoUrls.length > 0 ? { videos: { push: videoUrls } } : {}),
        },
      })
    }

    if (!isBulkLocationMode) {
      if (typeof normalizedCondition !== 'undefined') {
        await prisma.checklistTask.update({ where: { id: targetTask!.id }, data: { condition: normalizedCondition ?? null } })
      }
    } else {
      // Build findings from legacy conditions if not provided
      if (findings.length === 0) {
        findings = conditionsByTask.map((e) => ({ taskId: e.taskId, condition: e.condition }))
      }

      // Validate task-level requirements: media per finding; cause/resolution for FAIR or UNSATISFACTORY
      const ALLOW_EMPTY_CR = ['GOOD', 'UN_OBSERVABLE', 'NOT_APPLICABLE']
      const taskPhotoUploads = ((request as any)._taskPhotoUploads || []) as Array<{ taskId: string; file: File; caption: string | null }>
      const taskVideoUploads = ((request as any)._taskVideoUploads || []) as Array<{ taskId: string; file: File; caption: string | null }>
      const uploadsByTask = new Map<string, { photos: typeof taskPhotoUploads; videos: typeof taskVideoUploads }>()
      findings.forEach((f) => {
        uploadsByTask.set(f.taskId, { photos: [], videos: [] } as any)
      })
      taskPhotoUploads.forEach((u) => { if (uploadsByTask.has(u.taskId)) (uploadsByTask.get(u.taskId) as any).photos.push(u) })
      taskVideoUploads.forEach((u) => { if (uploadsByTask.has(u.taskId)) (uploadsByTask.get(u.taskId) as any).videos.push(u) })

      for (const f of findings) {
        const pack = uploadsByTask.get(f.taskId)
        const total = (pack?.photos?.length || 0) + (pack?.videos?.length || 0)
        if (total === 0) {
          return NextResponse.json({ error: 'Each subtask condition requires at least one media file.' }, { status: 400 })
        }
        if (!ALLOW_EMPTY_CR.includes(f.condition)) {
          if (!f.cause || !f.resolution) {
            return NextResponse.json({ error: 'Cause and resolution are required for FAIR or UNSATISFACTORY conditions.' }, { status: 400 })
          }
        }
      }

      // Create findings and upload task media
      const findingRows = await Promise.all(findings.map((f) => prisma.checklistTaskFinding.create({ data: { entryId: entry.id, taskId: f.taskId, details: { condition: f.condition, ...(f.cause ? { cause: f.cause } : {}), ...(f.resolution ? { resolution: f.resolution } : {}) } as any } })))
      const findingByTask = new Map<string, string>()
      findingRows.forEach((row) => findingByTask.set(row.taskId, row.id))

      // Upload task-level media and link to both entry and task for clean delete, and push into legacy arrays
      const createdMedia: Array<{ taskId: string; type: 'PHOTO' | 'VIDEO'; url: string; caption: string | null }> = []
      for (const u of ((request as any)._taskPhotoUploads || []) as Array<{ taskId: string; file: File; caption: string | null }>) {
        const url = await uploadFile(u.file, workOrderId, entry.id, 'photos')
        await prisma.itemEntryMedia.create({ data: { entryId: entry.id, taskId: u.taskId, url, caption: u.caption, type: 'PHOTO', order: 0 } })
        createdMedia.push({ taskId: u.taskId, type: 'PHOTO', url, caption: u.caption })
      }
      for (const u of ((request as any)._taskVideoUploads || []) as Array<{ taskId: string; file: File; caption: string | null }>) {
        const url = await uploadFile(u.file, workOrderId, entry.id, 'videos')
        await prisma.itemEntryMedia.create({ data: { entryId: entry.id, taskId: u.taskId, url, caption: u.caption, type: 'VIDEO', order: 0 } })
        createdMedia.push({ taskId: u.taskId, type: 'VIDEO', url, caption: u.caption })
      }

      // Maintain legacy arrays for task to make existing UI display media
      if (createdMedia.length > 0) {
        const mediaByTask = new Map<string, { photos: string[]; videos: string[] }>()
        createdMedia.forEach((m) => {
          const bucket = mediaByTask.get(m.taskId) || { photos: [], videos: [] }
          if (m.type === 'PHOTO') bucket.photos.push(m.url)
          else bucket.videos.push(m.url)
          mediaByTask.set(m.taskId, bucket)
        })
        for (const [taskIdKey, pack] of mediaByTask.entries()) {
          await prisma.checklistTask.update({ where: { id: taskIdKey }, data: { ...(pack.photos.length ? { photos: { push: pack.photos } } : {}), ...(pack.videos.length ? { videos: { push: pack.videos } } : {}) } })
        }
      }

      // Update each subtask condition to latest
      const updates = findings.map((f) => prisma.checklistTask.update({ where: { id: f.taskId }, data: { condition: f.condition } }))
      await Promise.all(updates)
    }

    const responseEntry = await prisma.itemEntry.findUnique({
      where: { id: entry.id },
      include: {
        inspector: { select: { id: true, name: true } },
        user: { select: { id: true, username: true, email: true } },
        media: {
          orderBy: { order: 'asc' }
        },
        task: {
          select: {
            id: true,
            name: true,
            status: true,
            photos: true,
            videos: true,
            condition: true,
            location: true,
          },
        },
        location: true,
        findings: true,
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
    const causeValue = typeof body.cause === 'string' ? body.cause.trim() : undefined
    const resolutionValue = typeof body.resolution === 'string' ? body.resolution.trim() : undefined
    const conditionValue = normalizeCondition(body.condition)
    const rawConditionsByTask = Array.isArray(body.conditionsByTask) ? body.conditionsByTask : []
    const conditionsByTask = rawConditionsByTask
      .map((e: any) => ({
        taskId: typeof e?.taskId === 'string' ? e.taskId : '',
        condition: typeof e?.condition === 'string' ? e.condition.trim().toUpperCase().replace(/\s|-/g, '_') : ''
      }))
      .filter((e) => e.taskId && e.condition && ALLOWED_CONDITIONS.includes(e.condition))

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
      .filter((entry:any): entry is { id: string; caption: string | null } => Boolean(entry))

    if (!remark && typeof conditionValue === 'undefined' && mediaUpdates.length === 0 && typeof causeValue === 'undefined' && typeof resolutionValue === 'undefined' && conditionsByTask.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    if (typeof conditionValue !== 'undefined' && conditionValue && !ALLOWED_CONDITIONS.includes(conditionValue)) {
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
      if (typeof conditionValue !== 'undefined') {
        updateData.condition = conditionValue ?? null
      }

      if (Object.keys(updateData).length > 0) {
        await tx.itemEntry.update({
          where: { id: entryId },
          data: updateData,
        })
      }

      if (mediaUpdates.length > 0) {
        const mediaIds = mediaUpdates.map((entry:any) => entry.id)
        const existingMedia = await tx.itemEntryMedia.findMany({
          where: { entryId, id: { in: mediaIds } },
          select: { id: true },
        })
        const existingSet = new Set(existingMedia.map((item) => item.id))
        const missing = mediaIds.filter((id:any) => !existingSet.has(id))
        if (missing.length > 0) {
          throw new Error('MEDIA_NOT_FOUND')
        }

        await Promise.all(
          mediaUpdates.map((update:any) =>
            tx.itemEntryMedia.update({ where: { id: update.id }, data: { caption: update.caption } })
          )
        )
      }

      const entry = await tx.itemEntry.findUnique({
        where: { id: entryId },
        include: {
          inspector: { select: { id: true, name: true } },
          user: { select: { id: true, username: true, email: true } },
          media: {
            orderBy: { order: 'asc' }
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
        },
      })

      if (!entry) {
        throw new Error('NOT_FOUND')
      }

      if (typeof conditionValue !== 'undefined' && entry.task) {
        await tx.checklistTask.update({
          where: { id: entry.task.id },
          data: { condition: conditionValue ?? null }
        })
        entry.task.condition = conditionValue ?? null
      }

      if (conditionsByTask.length > 0) {
        const updates = conditionsByTask.map((e: any) => tx.checklistTask.update({ where: { id: e.taskId }, data: { condition: e.condition } }))
        await Promise.all(updates)
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
