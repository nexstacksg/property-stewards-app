import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import prisma from '@/lib/prisma'
import { s3Client, BUCKET_NAME, PUBLIC_URL, SPACE_DIRECTORY } from '@/lib/s3-client'

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
  findings: true,
} as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const { entryId } = await params
    const contentType = request.headers.get('content-type') || ''

    // Staged change holders
    let remark: string | undefined
    let causeValue: string | undefined
    let resolutionValue: string | undefined
    let conditionRaw: string | undefined
    let findings: Array<{ taskId: string; condition: string; cause?: string; resolution?: string }> = []
    let mediaUpdates: Array<{ id: string; caption: string | null }> = []
    let deleteMediaIds: string[] = []
    // Additions
    let addEntryPhotoFiles: File[] = []
    let addEntryPhotoCaptions: string[] = []
    let addEntryVideoFiles: File[] = []
    let addEntryVideoCaptions: string[] = []
    let addTaskPhotoUploads: Array<{ taskId: string; file: File; caption: string | null }> = []
    let addTaskVideoUploads: Array<{ taskId: string; file: File; caption: string | null }> = []

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const toStringValue = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : undefined)
      remark = toStringValue(form.get('remark'))
      causeValue = toStringValue(form.get('cause'))
      resolutionValue = toStringValue(form.get('resolution'))
      conditionRaw = toStringValue(form.get('condition'))
      const findingsJson = toStringValue(form.get('findings'))
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
      const mediaUpdatesJson = toStringValue(form.get('mediaUpdates'))
      if (mediaUpdatesJson) {
        try {
          const parsed = JSON.parse(mediaUpdatesJson)
          if (Array.isArray(parsed)) {
            mediaUpdates = parsed
              .map((entry: any) => {
                if (!entry || typeof entry !== 'object') return null
                const id = typeof entry.id === 'string' ? entry.id : null
                if (!id) return null
                if (entry.caption === null) return { id, caption: null }
                if (typeof entry.caption === 'string') {
                  const trimmed = entry.caption.trim()
                  return { id, caption: trimmed.length > 0 ? trimmed : null }
                }
                return { id, caption: null }
              })
              .filter((e: any): e is { id: string; caption: string | null } => Boolean(e))
          }
        } catch {}
      }
      // Deletions
      const rawDeleteIds = form.getAll('deleteMediaIds')
      deleteMediaIds = rawDeleteIds.map((v) => (typeof v === 'string' ? v : '')).filter(Boolean)
      // Entry-level add
      addEntryPhotoFiles = form.getAll('photos').filter((v): v is File => v instanceof File && v.size > 0)
      addEntryPhotoCaptions = form.getAll('photoCaptions').map((v) => (typeof v === 'string' ? v.trim() : ''))
      addEntryVideoFiles = form.getAll('videos').filter((v): v is File => v instanceof File && v.size > 0)
      addEntryVideoCaptions = form.getAll('videoCaptions').map((v) => (typeof v === 'string' ? v.trim() : ''))
      // Task-level add
      const rawTaskPhotoFiles = form.getAll('taskPhotos').filter((v): v is File => v instanceof File && v.size > 0)
      const rawTaskPhotoTaskIds = form.getAll('taskPhotoTaskIds').map((v) => (typeof v === 'string' ? v : '')).filter(Boolean)
      const rawTaskPhotoCaptions = form.getAll('taskPhotoCaptions').map((v) => (typeof v === 'string' ? v.trim() : ''))
      for (let i = 0; i < rawTaskPhotoFiles.length; i++) {
        const file = rawTaskPhotoFiles[i]
        const tid = rawTaskPhotoTaskIds[i] || rawTaskPhotoTaskIds[rawTaskPhotoTaskIds.length - 1]
        const cap = rawTaskPhotoCaptions[i] || ''
        addTaskPhotoUploads.push({ taskId: tid, file, caption: cap ? cap : null })
      }
      const rawTaskVideoFiles = form.getAll('taskVideos').filter((v): v is File => v instanceof File && v.size > 0)
      const rawTaskVideoTaskIds = form.getAll('taskVideoTaskIds').map((v) => (typeof v === 'string' ? v : '')).filter(Boolean)
      const rawTaskVideoCaptions = form.getAll('taskVideoCaptions').map((v) => (typeof v === 'string' ? v.trim() : ''))
      for (let i = 0; i < rawTaskVideoFiles.length; i++) {
        const file = rawTaskVideoFiles[i]
        const tid = rawTaskVideoTaskIds[i] || rawTaskVideoTaskIds[rawTaskVideoTaskIds.length - 1]
        const cap = rawTaskVideoCaptions[i] || ''
        addTaskVideoUploads.push({ taskId: tid, file, caption: cap ? cap : null })
      }
    } else {
      const body = await request.json()
      remark = typeof body.remark === 'string' ? body.remark.trim() : undefined
      causeValue = typeof body.cause === 'string' ? body.cause.trim() : undefined
      resolutionValue = typeof body.resolution === 'string' ? body.resolution.trim() : undefined
      conditionRaw = typeof body.condition === 'string' ? body.condition : undefined
      const rawFindings = Array.isArray(body.findings) ? body.findings : []
      findings = rawFindings
        .map((e: any) => ({
          taskId: typeof e?.taskId === 'string' ? e.taskId : '',
          condition: typeof e?.condition === 'string' ? e.condition.trim().toUpperCase().replace(/\s|-/g, '_') : '',
          cause: typeof e?.cause === 'string' ? e.cause.trim() : undefined,
          resolution: typeof e?.resolution === 'string' ? e.resolution.trim() : undefined,
        }))
        .filter((e) => e.taskId && e.condition && ALLOWED_CONDITIONS.includes(e.condition))

      const rawMediaUpdates = Array.isArray(body.mediaUpdates) ? body.mediaUpdates : []
      mediaUpdates = rawMediaUpdates
        .map((entry: any) => {
          if (!entry || typeof entry !== 'object') return null
          const id = typeof entry.id === 'string' ? entry.id : null
          if (!id) return null
          if (entry.caption === null) return { id, caption: null }
          if (typeof entry.caption === 'string') {
            const trimmed = entry.caption.trim()
            return { id, caption: trimmed.length > 0 ? trimmed : null }
          }
          return { id, caption: null }
        })
        .filter((e: any): e is { id: string; caption: string | null } => Boolean(e))
      deleteMediaIds = Array.isArray(body.deleteMediaIds) ? body.deleteMediaIds.filter((v: any) => typeof v === 'string') : []
    }

    const normalizedCondition = normalizeCondition(conditionRaw)

    if (normalizedCondition && !ALLOWED_CONDITIONS.includes(normalizedCondition)) {
      return NextResponse.json({ error: 'Invalid condition value' }, { status: 400 })
    }

    const hasAnyUpdates = Boolean(
      remark !== undefined ||
      typeof normalizedCondition !== 'undefined' ||
      typeof causeValue !== 'undefined' ||
      typeof resolutionValue !== 'undefined' ||
      mediaUpdates.length > 0 ||
      deleteMediaIds.length > 0 ||
      findings.length > 0 ||
      addEntryPhotoFiles.length > 0 ||
      addEntryVideoFiles.length > 0 ||
      addTaskPhotoUploads.length > 0 ||
      addTaskVideoUploads.length > 0
    )
    if (!hasAnyUpdates) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    const txResult = await prisma.$transaction(async (tx) => {
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
        include: { ...entryInclude, item: { select: { id: true, workOrderId: true } } },
      })

      if (!entry) {
        throw new Error('NOT_FOUND')
      }

      // Defer checklist task condition syncs to post-transaction to avoid timeouts
      const tasksToUpdate: Array<{ taskId: string; condition: string | null }> = []
      if (typeof normalizedCondition !== 'undefined' && entry.task) {
        tasksToUpdate.push({ taskId: entry.task.id, condition: normalizedCondition ?? null })
      }

      // Update per-task findings (upsert) and cascade condition to ChecklistTask
      if (findings.length > 0) {
        const upserts = findings.map((f) => {
          const details: any = { condition: f.condition }
          if (typeof f.cause === 'string') details.cause = f.cause
          if (typeof f.resolution === 'string') details.resolution = f.resolution
          return tx.checklistTaskFinding.upsert({
            where: { entryId_taskId: { entryId, taskId: f.taskId } },
            update: { details },
            create: { entryId, taskId: f.taskId, details },
          })
        })
        await Promise.all(upserts)
        // Queue checklist task condition syncs for post-transaction
        findings.forEach((f) => {
          tasksToUpdate.push({ taskId: f.taskId, condition: f.condition })
        })
      }
      // Collect rows to delete if requested
      let rowsToDelete: Array<{ id: string; url: string; type: 'PHOTO'|'VIDEO'; taskId: string | null }> = []
      if (deleteMediaIds.length > 0) {
        rowsToDelete = await tx.itemEntryMedia.findMany({ where: { entryId, id: { in: deleteMediaIds } }, select: { id: true, url: true, type: true, taskId: true } }) as any
        if (rowsToDelete.length !== deleteMediaIds.length) {
          throw new Error('MEDIA_NOT_FOUND')
        }
        // Clean legacy arrays on tasks
        const tasks = Array.from(new Set(rowsToDelete.map((r) => r.taskId).filter(Boolean) as string[]))
        for (const tid of tasks) {
          const task = await tx.checklistTask.findUnique({ where: { id: tid }, select: { id: true, photos: true, videos: true } })
          if (task) {
            const removePhotos = rowsToDelete.filter((r) => r.taskId === tid && r.type === 'PHOTO').map((r) => r.url)
            const removeVideos = rowsToDelete.filter((r) => r.taskId === tid && r.type === 'VIDEO').map((r) => r.url)
            const nextPhotos = (task.photos || []).filter((u) => !removePhotos.includes(u))
            const nextVideos = (task.videos || []).filter((u) => !removeVideos.includes(u))
            await tx.checklistTask.update({ where: { id: tid }, data: { photos: nextPhotos, videos: nextVideos } })
          }
        }
        await tx.itemEntryMedia.deleteMany({ where: { id: { in: deleteMediaIds } } })
      }

      return { entry, rowsToDelete, tasksToUpdate }
    }, { timeout: 15000, maxWait: 15000 })

    // Perform S3 deletes outside transaction
    if (txResult.rowsToDelete && txResult.rowsToDelete.length > 0) {
      const prefix = `${PUBLIC_URL}/`
      await Promise.all(txResult.rowsToDelete.map(async (r) => {
        if (r.url && r.url.startsWith(prefix)) {
          const key = r.url.slice(prefix.length)
          try { await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key } as any)) } catch (err) { console.error('Failed to delete media from storage:', err) }
        }
      }))
    }

    // Handle new media outside transaction
    const workOrderIdOut = (txResult.entry as any)?.item?.workOrderId || 'unknown'
    for (let i = 0; i < addEntryPhotoFiles.length; i++) {
      const file = addEntryPhotoFiles[i]
      const cap = (addEntryPhotoCaptions[i] || '').trim()
      const url = await uploadFile(file, workOrderIdOut, entryId, 'photos')
      await prisma.itemEntryMedia.create({ data: { entryId, url, caption: cap || null, type: 'PHOTO', order: 0 } })
    }
    for (let i = 0; i < addEntryVideoFiles.length; i++) {
      const file = addEntryVideoFiles[i]
      const cap = (addEntryVideoCaptions[i] || '').trim()
      const url = await uploadFile(file, workOrderIdOut, entryId, 'videos')
      await prisma.itemEntryMedia.create({ data: { entryId, url, caption: cap || null, type: 'VIDEO', order: 0 } })
    }
    for (const u of addTaskPhotoUploads) {
      const url = await uploadFile(u.file, workOrderIdOut, entryId, 'photos')
      await prisma.itemEntryMedia.create({ data: { entryId, taskId: u.taskId, url, caption: u.caption, type: 'PHOTO', order: 0 } })
      await prisma.checklistTask.update({ where: { id: u.taskId }, data: { photos: { push: [url] } } })
    }
    for (const u of addTaskVideoUploads) {
      const url = await uploadFile(u.file, workOrderIdOut, entryId, 'videos')
      await prisma.itemEntryMedia.create({ data: { entryId, taskId: u.taskId, url, caption: u.caption, type: 'VIDEO', order: 0 } })
      await prisma.checklistTask.update({ where: { id: u.taskId }, data: { videos: { push: [url] } } })
    }

    // Return fresh entry
    // Post-transaction: apply queued checklistTask.condition updates
    if (txResult.tasksToUpdate && txResult.tasksToUpdate.length > 0) {
      const latestByTask = new Map<string, string | null>()
      txResult.tasksToUpdate.forEach((t) => latestByTask.set(t.taskId, t.condition))
      const updates = Array.from(latestByTask.entries()).map(([taskId, condition]) =>
        prisma.checklistTask.update({ where: { id: taskId }, data: { condition: condition as any } })
      )
      // Run sequentially to avoid overload/timeouts
      for (const u of updates) { await u }
    }

    const refreshed = await prisma.itemEntry.findUnique({ where: { id: entryId }, include: entryInclude })
    if (!refreshed) return NextResponse.json({ error: 'Remark not found' }, { status: 404 })
    return NextResponse.json(refreshed)
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
  await s3Client.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key, Body: buffer, ContentType: contentType, ACL: 'public-read' } as any))
  return `${PUBLIC_URL}/${key}`
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
        },
        findings: { select: { id: true, taskId: true } },
        media: { select: { id: true, url: true, type: true } },
      }
    })

    if (!entry) {
      return NextResponse.json({ error: 'Remark not found' }, { status: 404 })
    }

    const photosToRemove = (entry.task?.photos || []).filter((url) => url.includes(`/entries/${entryId}/`) || url.includes(`/findings/`))
    const videosToRemove = (entry.task?.videos || []).filter((url) => url.includes(`/entries/${entryId}/`) || url.includes(`/findings/`))

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

    // Delete captioned media tied to this entry (both location-level and per-task linked by entryId)
    const mediaRows = await prisma.itemEntryMedia.findMany({ where: { entryId }, select: { id: true, url: true, type: true, taskId: true } })
    if (mediaRows.length > 0) {
      // Remove URLs from legacy task arrays for tasks involved
      const taskIds = Array.from(new Set(mediaRows.map((m) => m.taskId).filter(Boolean) as string[]))
      if (taskIds.length > 0) {
        const tasks = await prisma.checklistTask.findMany({ where: { id: { in: taskIds } }, select: { id: true, photos: true, videos: true } })
        const urlsByType = (tid: string, type: 'PHOTO' | 'VIDEO') => mediaRows.filter((m) => m.taskId === tid && m.type === type).map((m) => m.url)
        for (const t of tasks) {
          const removePhotos = urlsByType(t.id, 'PHOTO')
          const removeVideos = urlsByType(t.id, 'VIDEO')
          const nextPhotos = (t.photos || []).filter((u) => !removePhotos.includes(u))
          const nextVideos = (t.videos || []).filter((u) => !removeVideos.includes(u))
          if (nextPhotos.length !== (t.photos || []).length || nextVideos.length !== (t.videos || []).length) {
            await prisma.checklistTask.update({ where: { id: t.id }, data: { photos: nextPhotos, videos: nextVideos } })
          }
        }
      }

      await prisma.itemEntryMedia.deleteMany({ where: { entryId } })
      const prefix = `${PUBLIC_URL}/`
      await Promise.all(mediaRows.map(async (m) => {
        if (m.url && m.url.startsWith(prefix)) {
          const key = m.url.slice(prefix.length)
          try { await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key } as any)) } catch (err) { console.error('Failed to delete media from storage:', err) }
        }
      }))
    }

    // Delete findings under this entry
    await prisma.checklistTaskFinding.deleteMany({ where: { entryId } })

    await prisma.itemEntry.delete({ where: { id: entryId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting remark:', error)
    return NextResponse.json({ error: 'Failed to delete remark' }, { status: 500 })
  }
}
