import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3Client, BUCKET_NAME, SPACE_DIRECTORY, PUBLIC_URL } from '@/lib/s3-client'
import { randomUUID } from 'crypto'
import prisma from '@/lib/prisma'
import { getSessionState, updateSessionState, PendingMediaUpload, type ChatSessionState } from '@/lib/chat-session'
import { buildLocationsFormatted, resolveChecklistItemIdForLocation, resolveInspectorIdForSession, saveMediaForItem, saveMediaToItemEntry } from './utils'

const debugLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args)
}

export async function handleMediaMessage(data: any, phoneNumber: string): Promise<string | null> {
  try {
    debugLog('🔄 Processing WhatsApp media message for phone:', phoneNumber)

    // Get session state for context
    const metadata: any = await getSessionState(phoneNumber)
    debugLog('📋 Session state for media upload:', metadata)

    const workOrderId = metadata.workOrderId
    const primaryLocationName = metadata.currentLocation
    let currentLocation = metadata.currentSubLocationName || primaryLocationName || metadata.currentTaskLocationName
    const currentLocationId = metadata.currentLocationId
    const currentSubLocationId = metadata.currentSubLocationId
    const currentSubLocationName = metadata.currentSubLocationName
    const taskFlowStage = metadata.taskFlowStage
    const isTaskFlowMedia = taskFlowStage === 'media' || taskFlowStage === 'remarks'
    const activeTaskName = metadata.currentTaskName
    const activeTaskId = metadata.currentTaskId
    const activeTaskItemId = metadata.currentTaskItemId
    let activeTaskEntryId = metadata.currentTaskEntryId
    const activeTaskLocationId = metadata.currentTaskLocationId
    const activeTaskLocationName = metadata.currentTaskLocationName
    debugLog('🔍 Media upload context check:', { workOrderId, currentLocation, hasWorkOrder: !!workOrderId, hasLocation: !!currentLocation })

    if (!workOrderId) {
      debugLog('⚠️ No work order context - media upload without job context')
      return 'Please select a job first before uploading media. Try saying "What are my jobs today?" to get started.'
    }

    if (!currentLocation) {
      debugLog('❌ No location selected for media upload')
      const optionsArr = await buildLocationsFormatted(workOrderId)
      const options = optionsArr.join('\n')
      return `📍 Which location should I attach this photo to?\n\n${options}\n\nReply with the number (e.g., 5).`
    }

    // Extract media URL
    let mediaUrl: string | undefined
    let mediaType: 'photo' | 'video' = 'photo'
    const mediaDownloadPath = data.media?.file?.download || data.media?.links?.download || data.links?.download

    if (data.type === 'image' || data.message?.imageMessage?.url) {
      mediaUrl = data.url || data.message?.imageMessage?.url
      mediaType = 'photo'
      debugLog('📎 Found image via type=image:', { url: mediaUrl, type: 'image' })
    } else if (data.type === 'video' || data.message?.videoMessage?.url) {
      mediaUrl = data.url || data.message?.videoMessage?.url
      mediaType = 'video'
      debugLog('📎 Found video via type=video:', { url: mediaUrl, type: 'video' })
    } else if (data.url) {
      mediaUrl = data.url
      mediaType = (data.mimetype || data.mimeType)?.startsWith('video/') ? 'video' : 'photo'
      debugLog('📎 Found media in data.url:', { url: mediaUrl, mimetype: data.mimetype || data.mimeType })
    } else if (data.fileUrl) {
      mediaUrl = data.fileUrl
      mediaType = (data.mimetype || data.mimeType)?.startsWith('video/') ? 'video' : 'photo'
      debugLog('📎 Found media in data.fileUrl:', { url: mediaUrl, mimetype: data.mimetype || data.mimeType })
    } else if (mediaDownloadPath && data.media?.mime) {
      mediaType = data.media.mime.startsWith('video/') ? 'video' : 'photo'
      debugLog('📎 Media type inferred from mime:', { mime: data.media.mime, mediaType })
    }

    let response: Response
    if (mediaUrl) {
      response = await fetch(mediaUrl, { method: 'GET', headers: { 'User-Agent': 'Property-Stewards-Bot/1.0', 'Accept': 'image/*,video/*,*/*' } })
    } else if (mediaDownloadPath) {
      const base = process.env.WASSENGER_API_BASE || 'https://api.wassenger.com'
      const downloadUrl = mediaDownloadPath.startsWith('http') ? mediaDownloadPath : `${base}${mediaDownloadPath}`
      debugLog('📎 Using Wassenger download endpoint:', downloadUrl)
      response = await fetch(downloadUrl, { method: 'GET', headers: { Token: process.env.WASSENGER_API_KEY || '', Accept: 'image/*,video/*,*/*', 'User-Agent': 'Property-Stewards-Bot/1.0' } })
    } else {
      debugLog('❌ No media URL or download link found in WhatsApp message')
      return 'Media upload failed - could not find media URL.'
    }

    debugLog('📡 Media download response:', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    })
    if (!response.ok) throw new Error(`Failed to download media: ${response.status} ${response.statusText}`)

    const buffer = await response.arrayBuffer()
    const uint8Array = new Uint8Array(buffer)
    debugLog('📦 Downloaded media buffer size:', buffer.byteLength, 'bytes')

    const normalizedCondition = (metadata.currentTaskCondition || metadata.currentLocationCondition || '').toUpperCase()
    const requiresRemarkForPhoto = mediaType === 'photo'

    // Generate storage key
    let customerName = (metadata.customerName || 'unknown').toLowerCase().replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '-').substring(0, 50)
    const postalCode = metadata.postalCode || 'unknown'
    let roomName = (currentSubLocationName || currentLocation || 'general').toLowerCase().replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '-')
    const filename = `${randomUUID()}-${Date.now()}.${mediaType === 'video' ? 'mp4' : 'jpeg'}`
    const key = `${SPACE_DIRECTORY}/data/${customerName}-${postalCode}/${roomName}/${mediaType === 'photo' ? 'photos' : 'videos'}/${filename}`
    debugLog('📤 Uploading to DigitalOcean Spaces:', key)

    // Upload to DO Spaces
    const uploadParams = { Bucket: BUCKET_NAME, Key: key, Body: uint8Array, ContentType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg', ACL: 'public-read' as const, Metadata: { workOrderId, location: roomName, mediaType, originalName: filename, uploadedAt: new Date().toISOString(), source: 'whatsapp' } }
    await s3Client.send(new PutObjectCommand(uploadParams))
    const publicUrl = `${PUBLIC_URL}/${key}`
    debugLog('✅ Uploaded to DigitalOcean Spaces:', publicUrl)

    // Possible remarks bundled with the media
    const rawRemarkCandidates: unknown[] = [
      data.caption,
      data.text,
      data.body,
      data.message?.text?.body,
      data.message?.caption,
      data.message?.imageMessage?.caption,
      data.message?.imageMessage?.text,
      data.media?.caption,
      data.media?.text
    ]
    const mediaRemarkRaw = rawRemarkCandidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0) || ''
    const mediaRemark = mediaRemarkRaw.trim()

    if (requiresRemarkForPhoto && !mediaRemark) {
      const pendingUploads = Array.isArray(metadata.pendingMediaUploads) ? metadata.pendingMediaUploads : []
      const pendingEntry: PendingMediaUpload = {
        url: publicUrl,
        key,
        mediaType,
        workOrderId,
        location: currentLocation,
        locationId: currentLocationId,
        subLocation: currentSubLocationName,
        subLocationId: currentSubLocationId,
        isTaskFlow: isTaskFlowMedia,
        taskId: activeTaskId || null,
        taskItemId: activeTaskItemId || null,
        taskEntryId: activeTaskEntryId || null,
        taskName: activeTaskName || null,
        uploadedAt: new Date().toISOString(),
        condition: normalizedCondition || null
      }
      const nextPending = [...pendingUploads.filter((entry: PendingMediaUpload) => entry.url !== publicUrl), pendingEntry]
      await updateSessionState(phoneNumber, { pendingMediaUploads: nextPending })
      return 'Please add a quick remark describing this photo so I can log it properly—I’ll save it once I have your note.'
    }

    return persistMediaForContext({
      metadata,
      phoneNumber,
      workOrderId,
      currentLocation,
      currentLocationId,
      currentSubLocationId,
      currentSubLocationName,
      primaryLocationName,
      isTaskFlowMedia,
      activeTaskId,
      activeTaskItemId,
      activeTaskEntryId,
      activeTaskName,
      mediaType,
      mediaRemark,
      publicUrl
    })
  } catch (error) {
    console.error('❌ Error handling WhatsApp media:', error)
    return 'Failed to upload media. Please try again.'
  }
}

type PersistMediaParams = {
  metadata: any
  phoneNumber: string
  workOrderId?: string
  currentLocation?: string
  currentLocationId?: string
  currentSubLocationId?: string | null
  currentSubLocationName?: string | null
  primaryLocationName?: string | null
  isTaskFlowMedia: boolean
  activeTaskId?: string | null
  activeTaskItemId?: string | null
  activeTaskEntryId?: string | null
  activeTaskName?: string | null
  mediaType: 'photo' | 'video'
  mediaRemark: string
  publicUrl: string
}

async function persistMediaForContext(params: PersistMediaParams): Promise<string> {
  const {
    metadata,
    phoneNumber,
    workOrderId,
    currentLocation,
    currentLocationId,
    currentSubLocationId,
    currentSubLocationName,
    primaryLocationName,
    isTaskFlowMedia,
    activeTaskId,
    activeTaskItemId,
    activeTaskEntryId,
    activeTaskName,
    mediaType,
    mediaRemark,
    publicUrl
  } = params

  let handledByTaskFlow = false
  let currentTaskEntryId = activeTaskEntryId || null
  const resolvedInspectorId = await resolveInspectorIdForSession(phoneNumber, metadata, workOrderId, metadata?.inspectorPhone || phoneNumber)

  if (isTaskFlowMedia && activeTaskId) {
    try {
      if (!currentTaskEntryId && activeTaskItemId) {
        if (resolvedInspectorId) {
          const orphan = await prisma.itemEntry.findFirst({ where: { itemId: activeTaskItemId, inspectorId: resolvedInspectorId, taskId: null }, orderBy: { createdOn: 'desc' } })
          if (orphan) {
            await prisma.itemEntry.update({ where: { id: orphan.id }, data: { taskId: activeTaskId, condition: (metadata.currentTaskCondition as any) || undefined, remarks: mediaRemark || undefined } })
            currentTaskEntryId = orphan.id
          }
        }
        if (!currentTaskEntryId) {
          const created = await prisma.itemEntry.create({ data: { taskId: activeTaskId, itemId: activeTaskItemId, inspectorId: resolvedInspectorId, condition: (metadata.currentTaskCondition as any) || undefined, remarks: mediaRemark || undefined } })
          currentTaskEntryId = created.id
        }
        await updateSessionState(phoneNumber, { currentTaskEntryId })
      }
      if (currentTaskEntryId) {
        // Save media and persist caption as ItemEntryMedia caption; do not merge into entry.remarks
        const effectiveCaption = mediaRemark || (metadata.pendingTaskRemarks || undefined)
        await saveMediaToItemEntry(currentTaskEntryId, publicUrl, mediaType, effectiveCaption)
        handledByTaskFlow = true
        // Prepare confirmation line for cause/resolution when applicable
        let crLine = ''
        try {
          const cond = (metadata.currentTaskCondition || '').toUpperCase()
          if (cond === 'FAIR' || cond === 'UNSATISFACTORY') {
            const entry = await prisma.itemEntry.findUnique({ where: { id: currentTaskEntryId }, select: { cause: true, resolution: true } })
            const cause = (entry?.cause || metadata.pendingTaskCause || '').trim()
            const resolution = (entry?.resolution || metadata.pendingTaskResolution || '').trim()
            if (cause || resolution) crLine = `\n📝 Cause: ${cause || '-'} | Resolution: ${resolution || '-'}`
          }
        } catch {}

        await updateSessionState(phoneNumber, { taskFlowStage: 'confirm', currentTaskEntryId, pendingTaskRemarks: metadata.pendingTaskRemarks })
        return `✅ ${mediaType === 'photo' ? 'Photo' : 'Video'} saved successfully for ${activeTaskName || 'this task'}.${crLine}\n\nNext: reply [1] if this task is complete, [2] if you still have more to do for it.`
      }
    } catch (error) {
      console.error('❌ Failed to save media to task entry, falling back to item storage', error)
    }
  }

  if (!handledByTaskFlow) {
    if (workOrderId && currentLocation) {
      debugLog('💾 Saving media to database for location:', currentLocation)
      const targetItemId = currentLocationId || await resolveChecklistItemIdForLocation(workOrderId, primaryLocationName || currentLocation)
      if (targetItemId) {
        try { await updateSessionState(phoneNumber, { currentItemId: targetItemId }) } catch {}
        await saveMediaForItem(targetItemId, resolvedInspectorId, publicUrl, mediaType)
      } else {
        debugLog('❌ Could not resolve a ContractChecklistItem ID for location:', currentLocation)
      }
    } else {
      debugLog('⚠️ Skipping database save - missing workOrderId or currentLocation')
    }

    const locationName = currentSubLocationName || currentLocation || 'your current job'
    return `✅ ${mediaType === 'photo' ? 'Photo' : 'Video'} uploaded successfully for ${locationName}!\n\nNext: reply [1] if this task is complete, [2] if you still have more to do for it.`
  }

  return `✅ ${mediaType === 'photo' ? 'Photo' : 'Video'} saved successfully.\n\nNext: reply [1] if this task is complete, [2] if you still have more to do for it.`
}

type FinalizePendingResult = {
  message: string
  mediaType: 'photo' | 'video'
}

export async function finalizePendingMediaWithRemark(phoneNumber: string, remark: string, existingMetadata?: ChatSessionState): Promise<FinalizePendingResult | null> {
  const trimmed = remark.trim()
  if (!trimmed) return null

  const metadata = existingMetadata ?? await getSessionState(phoneNumber)
  const pendingUploads = Array.isArray(metadata.pendingMediaUploads) ? metadata.pendingMediaUploads : []
  if (pendingUploads.length === 0) return null

  const target = pendingUploads[pendingUploads.length - 1]
  const metadataForSave: ChatSessionState = { ...metadata }
  if (target.workOrderId) metadataForSave.workOrderId = target.workOrderId
  if (target.location) metadataForSave.currentLocation = target.location
  if (target.locationId) metadataForSave.currentLocationId = target.locationId
  if (target.subLocation) metadataForSave.currentSubLocationName = target.subLocation
  if (target.subLocationId) metadataForSave.currentSubLocationId = target.subLocationId
  if (target.taskId) metadataForSave.currentTaskId = target.taskId
  if (target.taskItemId) metadataForSave.currentTaskItemId = target.taskItemId
  if (target.taskEntryId) metadataForSave.currentTaskEntryId = target.taskEntryId
  if (target.taskName) metadataForSave.currentTaskName = target.taskName
  if (target.condition) {
    metadataForSave.currentTaskCondition = target.condition
    metadataForSave.currentLocationCondition = target.condition
  }

  const message = await persistMediaForContext({
    metadata: metadataForSave,
    phoneNumber,
    workOrderId: target.workOrderId,
    currentLocation: target.subLocation || target.location,
    currentLocationId: target.locationId,
    currentSubLocationId: target.subLocationId,
    currentSubLocationName: target.subLocation,
    primaryLocationName: target.location,
    isTaskFlowMedia: Boolean(target.isTaskFlow),
    activeTaskId: target.taskId,
    activeTaskItemId: target.taskItemId,
    activeTaskEntryId: target.taskEntryId,
    activeTaskName: target.taskName,
    mediaType: target.mediaType,
    mediaRemark: trimmed,
    publicUrl: target.url
  })

  const remaining = pendingUploads.slice(0, -1)
  await updateSessionState(phoneNumber, { pendingMediaUploads: remaining.length > 0 ? remaining : undefined })

  return { message, mediaType: target.mediaType }
}
