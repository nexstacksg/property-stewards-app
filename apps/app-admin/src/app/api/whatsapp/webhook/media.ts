import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3Client, BUCKET_NAME, SPACE_DIRECTORY, PUBLIC_URL } from '@/lib/s3-client'
import { randomUUID } from 'crypto'
import prisma from '@/lib/prisma'
import { getSessionState, updateSessionState } from '@/lib/chat-session'
import { buildLocationsFormatted, resolveChecklistItemIdForLocation, resolveInspectorIdForSession, saveMediaForItem, saveMediaToItemEntry } from './utils'

export async function handleMediaMessage(data: any, phoneNumber: string): Promise<string | null> {
  try {
    console.log('🔄 Processing WhatsApp media message for phone:', phoneNumber)

    // Get session state for context
    const metadata: any = await getSessionState(phoneNumber)
    console.log('📋 Session state for media upload:', metadata)

    const workOrderId = metadata.workOrderId
    let currentLocation = metadata.currentLocation
    const taskFlowStage = metadata.taskFlowStage
    const isTaskFlowMedia = taskFlowStage === 'media' || taskFlowStage === 'remarks'
    const activeTaskName = metadata.currentTaskName
    const activeTaskId = metadata.currentTaskId
    const activeTaskItemId = metadata.currentTaskItemId
    let activeTaskEntryId = metadata.currentTaskEntryId
    console.log('🔍 Media upload context check:', { workOrderId, currentLocation, hasWorkOrder: !!workOrderId, hasLocation: !!currentLocation })

    if (!workOrderId) {
      console.log('⚠️ No work order context - media upload without job context')
      return 'Please select a job first before uploading media. Try saying "What are my jobs today?" to get started.'
    }

    if (!currentLocation) {
      console.log('❌ No location selected for media upload')
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
      console.log('📎 Found image via type=image:', { url: mediaUrl, type: 'image' })
    } else if (data.type === 'video' || data.message?.videoMessage?.url) {
      mediaUrl = data.url || data.message?.videoMessage?.url
      mediaType = 'video'
      console.log('📎 Found video via type=video:', { url: mediaUrl, type: 'video' })
    } else if (data.url) {
      mediaUrl = data.url
      mediaType = (data.mimetype || data.mimeType)?.startsWith('video/') ? 'video' : 'photo'
      console.log('📎 Found media in data.url:', { url: mediaUrl, mimetype: data.mimetype || data.mimeType })
    } else if (data.fileUrl) {
      mediaUrl = data.fileUrl
      mediaType = (data.mimetype || data.mimeType)?.startsWith('video/') ? 'video' : 'photo'
      console.log('📎 Found media in data.fileUrl:', { url: mediaUrl, mimetype: data.mimetype || data.mimeType })
    } else if (mediaDownloadPath && data.media?.mime) {
      mediaType = data.media.mime.startsWith('video/') ? 'video' : 'photo'
      console.log('📎 Media type inferred from mime:', { mime: data.media.mime, mediaType })
    }

    let response: Response
    if (mediaUrl) {
      response = await fetch(mediaUrl, { method: 'GET', headers: { 'User-Agent': 'Property-Stewards-Bot/1.0', 'Accept': 'image/*,video/*,*/*' } })
    } else if (mediaDownloadPath) {
      const base = process.env.WASSENGER_API_BASE || 'https://api.wassenger.com'
      const downloadUrl = mediaDownloadPath.startsWith('http') ? mediaDownloadPath : `${base}${mediaDownloadPath}`
      console.log('📎 Using Wassenger download endpoint:', downloadUrl)
      response = await fetch(downloadUrl, { method: 'GET', headers: { Token: process.env.WASSENGER_API_KEY || '', Accept: 'image/*,video/*,*/*', 'User-Agent': 'Property-Stewards-Bot/1.0' } })
    } else {
      console.log('❌ No media URL or download link found in WhatsApp message')
      return 'Media upload failed - could not find media URL.'
    }

    console.log('📡 Media download response:', {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    })
    if (!response.ok) throw new Error(`Failed to download media: ${response.status} ${response.statusText}`)

    const buffer = await response.arrayBuffer()
    const uint8Array = new Uint8Array(buffer)
    console.log('📦 Downloaded media buffer size:', buffer.byteLength, 'bytes')

    // Generate storage key
    let customerName = (metadata.customerName || 'unknown').toLowerCase().replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '-').substring(0, 50)
    const postalCode = metadata.postalCode || 'unknown'
    let roomName = (currentLocation || 'general').toLowerCase().replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '-')
    const filename = `${randomUUID()}-${Date.now()}.${mediaType === 'video' ? 'mp4' : 'jpeg'}`
    const key = `${SPACE_DIRECTORY}/data/${customerName}-${postalCode}/${roomName}/${mediaType === 'photo' ? 'photos' : 'videos'}/${filename}`
    console.log('📤 Uploading to DigitalOcean Spaces:', key)

    // Upload to DO Spaces
    const uploadParams = { Bucket: BUCKET_NAME, Key: key, Body: uint8Array, ContentType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg', ACL: 'public-read' as const, Metadata: { workOrderId, location: roomName, mediaType, originalName: filename, uploadedAt: new Date().toISOString(), source: 'whatsapp' } }
    await s3Client.send(new PutObjectCommand(uploadParams))
    const publicUrl = `${PUBLIC_URL}/${key}`
    console.log('✅ Uploaded to DigitalOcean Spaces:', publicUrl)

    // Save to DB
    let handledByTaskFlow = false
    const resolvedInspectorId = await resolveInspectorIdForSession(phoneNumber, metadata, workOrderId, metadata?.inspectorPhone || phoneNumber)

    if (isTaskFlowMedia && activeTaskId) {
      try {
        if (!activeTaskEntryId && activeTaskItemId) {
          if (resolvedInspectorId) {
            const orphan = await prisma.itemEntry.findFirst({ where: { itemId: activeTaskItemId, inspectorId: resolvedInspectorId, taskId: null }, orderBy: { createdOn: 'desc' } })
            if (orphan) {
              await prisma.itemEntry.update({ where: { id: orphan.id }, data: { taskId: activeTaskId, condition: (metadata.currentTaskCondition as any) || undefined } })
              activeTaskEntryId = orphan.id
            }
          }
          if (!activeTaskEntryId) {
            const created = await prisma.itemEntry.create({ data: { taskId: activeTaskId, itemId: activeTaskItemId, inspectorId: resolvedInspectorId, condition: (metadata.currentTaskCondition as any) || undefined } })
            activeTaskEntryId = created.id
          }
          await updateSessionState(phoneNumber, { currentTaskEntryId: activeTaskEntryId })
        }
        if (activeTaskEntryId) {
          await saveMediaToItemEntry(activeTaskEntryId, publicUrl, mediaType)
          handledByTaskFlow = true
          await updateSessionState(phoneNumber, { taskFlowStage: 'remarks', currentTaskEntryId: activeTaskEntryId })
          return `✅ ${mediaType === 'photo' ? 'Photo' : 'Video'} saved successfully for ${activeTaskName || 'this task'}.\n\nPlease share any remarks for this task, or reply "skip" if there are none.`
        }
      } catch (error) {
        console.error('❌ Failed to save media to task entry, falling back to item storage', error)
      }
    }

    if (!handledByTaskFlow) {
      if (workOrderId && currentLocation) {
        console.log('💾 Saving media to database for location:', currentLocation)
        const targetItemId = await resolveChecklistItemIdForLocation(workOrderId, currentLocation)
        if (targetItemId) {
          try { await updateSessionState(phoneNumber, { currentItemId: targetItemId }) } catch {}
          await saveMediaForItem(targetItemId, resolvedInspectorId, publicUrl, mediaType)
        } else {
          console.log('❌ Could not resolve a ContractChecklistItem ID for location:', currentLocation)
        }
      } else {
        console.log('⚠️ Skipping database save - missing workOrderId or currentLocation')
      }

      const locationName = currentLocation === 'general' ? 'your current job' : currentLocation
      return `✅ ${mediaType === 'photo' ? 'Photo' : 'Video'} uploaded successfully for ${locationName}!\n\nYou can continue with your inspection or upload more media.`
    }

    return `✅ ${mediaType === 'photo' ? 'Photo' : 'Video'} saved successfully.`
  } catch (error) {
    console.error('❌ Error handling WhatsApp media:', error)
    return 'Failed to upload media. Please try again.'
  }
}
