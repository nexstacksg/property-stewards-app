import prisma from '@/lib/prisma'
import { updateSessionState } from '@/lib/chat-session'
import { getLocationsWithCompletionStatus, getInspectorByPhone, getContractChecklistItemIdByLocation } from '@/lib/services/inspectorService'

// Utility: detect if Wassenger payload contains media
export function detectHasMedia(data: any): boolean {
  return Boolean(
    data?.type === 'image' ||
    data?.type === 'video' ||
    data?.type === 'document' ||
    data?.type === 'audio' ||
    data?.hasMedia ||
    data?.media ||
    data?.message?.imageMessage ||
    data?.message?.videoMessage ||
    data?.message?.documentMessage ||
    data?.url ||
    data?.fileUrl
  )
}

// Utility: format locations with (Done) suffix
export async function buildLocationsFormatted(workOrderId: string): Promise<string[]> {
  const locs = (await getLocationsWithCompletionStatus(workOrderId)) as any[]
  return locs.map((l: any, i: number) => `[${i + 1}] ${l.isCompleted ? `${l.name} (Done)` : l.name}`)
}

// Utility: resolve inspector id from session/phone/work order and persist to session if found
export async function resolveInspectorIdForSession(sessionId: string, metadata: any, workOrderId?: string, fallbackPhone?: string): Promise<string | null> {
  // 1) session
  if (metadata?.inspectorId) return metadata.inspectorId

  // 2) phone variants
  if (fallbackPhone) {
    try {
      const variants = [fallbackPhone, fallbackPhone.startsWith('+') ? fallbackPhone.slice(1) : `+${fallbackPhone}`]
      for (const p of variants) {
        const match = await getInspectorByPhone(p) as any
        if (match?.id) {
          await updateSessionState(sessionId, { inspectorId: match.id, inspectorName: match.name, inspectorPhone: match.mobilePhone || p })
          return match.id
        }
      }
    } catch {}
  }

  // 3) work order inspectors relation
  if (workOrderId) {
    try {
      const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { inspectors: { select: { id: true } } } }) as any
      const derived = wo?.inspectors?.[0]?.id
      if (derived) {
        await updateSessionState(sessionId, { inspectorId: derived })
        return derived
      }
    } catch {}
  }
  return null
}

// Utility: resolve checklist item id for workOrderId + location (cache + fallback name match)
export async function resolveChecklistItemIdForLocation(workOrderId: string, location: string): Promise<string | null> {
  const viaCache = await getContractChecklistItemIdByLocation(workOrderId, location)
  if (viaCache) return viaCache
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: workOrderId },
    include: { contract: { include: { contractChecklist: { include: { items: true } } } } }
  })
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  const target = norm(location)
  const items = workOrder?.contract?.contractChecklist?.items || []
  const byName = items.find((i: any) => norm(i.name) === target)
  return byName?.id || null
}

// Utility: save media either to per-inspector ItemEntry or fallback to item-level arrays
export async function saveMediaForItem(itemId: string, inspectorId: string | null, publicUrl: string, mediaType: 'photo' | 'video') {
  if (inspectorId) {
    const entry = await prisma.itemEntry.upsert({
      where: { itemId_inspectorId: { itemId, inspectorId } },
      update: {},
      create: { itemId, inspectorId }
    })

    let task = await prisma.checklistTask.findFirst({ where: { itemId, entryId: entry.id } })
    if (!task) {
      task = await prisma.checklistTask.create({
        data: {
          itemId,
          entryId: entry.id,
          inspectorId,
          name: 'Inspector notes',
          status: 'PENDING'
        }
      })
    }

    await prisma.checklistTask.update({
      where: { id: task.id },
      data: mediaType === 'photo'
        ? { photos: { push: publicUrl } }
        : { videos: { push: publicUrl } }
    })
    console.log('✅ Media saved to ChecklistTask for inspector', inspectorId)
  } else {
    const item = await prisma.contractChecklistItem.findUnique({
      where: { id: itemId },
      include: { checklistTasks: { where: { entryId: null }, take: 1 } }
    })

    if (!item) {
      throw new Error('Checklist item not found')
    }

    let task = item.checklistTasks[0]
    if (!task) {
      task = await prisma.checklistTask.create({
        data: {
          itemId,
          name: item.name || 'General inspection',
          status: item.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING'
        }
      })
    }

    await prisma.checklistTask.update({
      where: { id: task.id },
      data: mediaType === 'photo'
        ? { photos: { push: publicUrl } }
        : { videos: { push: publicUrl } }
    })
    console.log('✅ Media saved to ChecklistTask (general)')
  }
}

// Send WhatsApp response via Wassenger
export async function sendWhatsAppResponse(to: string, message: string) {
  try {
    const response = await fetch('https://api.wassenger.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Token': process.env.WASSENGER_API_KEY!
      },
      body: JSON.stringify({
        phone: to,
        message
      })
    })
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Wassenger API error: ${response.status} - ${error}`)
    }
    const result = await response.json()
    console.log(`✅ Message sent to ${to}`)
    return result
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error)
    throw error
  }
}
