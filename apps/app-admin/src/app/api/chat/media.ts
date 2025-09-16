import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3Client, BUCKET_NAME, SPACE_DIRECTORY, PUBLIC_URL } from '@/lib/s3-client'
import prisma from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { getSessionState } from '@/lib/chat-session'
import { getContractChecklistItemIdByLocation } from '@/lib/services/inspectorService'

export async function handleMultipartUpload(file: File, mediaType: string, sessionId: string) {
  if (!file || !mediaType || !sessionId) {
    return { error: 'Missing required fields for upload' }
  }
  const sessionState = await getSessionState(sessionId)
  const workOrderId = (sessionState.workOrderId as string) || ''
  let customerName = 'unknown'
  let postalCode = 'unknown'
  let roomName = 'general'
  if (sessionState.customerName) {
    customerName = (sessionState.customerName as string).toLowerCase().replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '-').substring(0, 50)
  }
  postalCode = (sessionState.postalCode as string) || 'unknown'
  roomName = ((sessionState.currentLocation as string) || 'general').toLowerCase().replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '-')

  const fileExtension = file.name.split('.').pop() || (mediaType === 'photo' ? 'jpeg' : 'mp4')
  const mediaFolder = mediaType === 'photo' ? 'photos' : 'videos'
  const fileName = `${randomUUID()}.${fileExtension}`
  const folderPath = `${customerName}-${postalCode}/${roomName}/${mediaFolder}`
  const key = `${SPACE_DIRECTORY}/${folderPath}/${fileName}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const uploadParams = { Bucket: BUCKET_NAME, Key: key, Body: buffer, ContentType: file.type, ACL: 'public-read' as const, Metadata: { workOrderId: workOrderId, location: roomName, mediaType: mediaType, originalName: file.name, uploadedAt: new Date().toISOString() } }
  await s3Client.send(new PutObjectCommand(uploadParams))
  const publicUrl = `${PUBLIC_URL}/${key}`

  if (workOrderId && roomName !== 'general') {
    const rawLocation = (sessionState.currentLocation as string) || roomName
    let targetItemId: string | null = null
    try { targetItemId = await getContractChecklistItemIdByLocation(workOrderId, rawLocation) } catch {}
    if (!targetItemId) {
      const workOrder = await prisma.workOrder.findUnique({ where: { id: workOrderId }, include: { contract: { include: { contractChecklist: { include: { items: true } } } } } })
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
      const normalizedTarget = norm(rawLocation)
      const items = (workOrder as any)?.contract?.contractChecklist?.items || []
      const byName = items.find((i: any) => norm(i.name) === normalizedTarget)
      if (byName) targetItemId = byName.id
    }
    if (targetItemId) {
      const inspectorId = (sessionState.inspectorId as string) || ''
      if (inspectorId) {
        if (mediaType === 'photo') {
          await (prisma as any).itemEntry.upsert({ where: { itemId_inspectorId: { itemId: targetItemId, inspectorId } }, update: { photos: { push: publicUrl } }, create: { itemId: targetItemId, inspectorId, photos: [publicUrl], videos: [] } })
        } else {
          await (prisma as any).itemEntry.upsert({ where: { itemId_inspectorId: { itemId: targetItemId, inspectorId } }, update: { videos: { push: publicUrl } }, create: { itemId: targetItemId, inspectorId, photos: [], videos: [publicUrl] } })
        }
      } else {
        if (mediaType === 'photo') {
          const existing = await prisma.contractChecklistItem.findUnique({ where: { id: targetItemId }, select: { photos: true } })
          const updatedPhotos = [ ...(existing?.photos || []), publicUrl ]
          await prisma.contractChecklistItem.update({ where: { id: targetItemId }, data: { photos: updatedPhotos } })
        } else {
          const existing = await prisma.contractChecklistItem.findUnique({ where: { id: targetItemId }, select: { videos: true } })
          const updatedVideos = [ ...(existing?.videos || []), publicUrl ]
          await prisma.contractChecklistItem.update({ where: { id: targetItemId }, data: { videos: updatedVideos } })
        }
      }
    }
  }

  return { success: true, url: publicUrl, path: folderPath, filename: fileName }
}
