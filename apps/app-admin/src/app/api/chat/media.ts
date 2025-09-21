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
        const entry = await prisma.itemEntry.upsert({
          where: { itemId_inspectorId: { itemId: targetItemId, inspectorId } },
          update: {},
          create: { itemId: targetItemId, inspectorId }
        })

        let task = await prisma.checklistTask.findFirst({ where: { itemId: targetItemId, entryId: entry.id } })
        if (!task) {
          task = await prisma.checklistTask.create({
            data: {
              itemId: targetItemId,
              entryId: entry.id,
              inspectorId,
              name: 'Inspector notes',
              status: 'PENDING'
            }
          })
        }

        await prisma.checklistTask.update({
          where: { id: task.id },
          data: mediaType === 'photo' ? { photos: { push: publicUrl } } : { videos: { push: publicUrl } }
        })
      } else {
        const item = await prisma.contractChecklistItem.findUnique({
          where: { id: targetItemId },
          include: { checklistTasks: { where: { entryId: null }, take: 1 } }
        })

        if (!item) {
          throw new Error('Checklist item not found')
        }

        let task = item.checklistTasks[0]
        if (!task) {
          task = await prisma.checklistTask.create({
            data: {
              itemId: targetItemId,
              name: item.name || 'General inspection',
              status: item.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING'
            }
          })
        }

        await prisma.checklistTask.update({
          where: { id: task.id },
          data: mediaType === 'photo' ? { photos: { push: publicUrl } } : { videos: { push: publicUrl } }
        })
      }
    }
  }

  return { success: true, url: publicUrl, path: folderPath, filename: fileName }
}
