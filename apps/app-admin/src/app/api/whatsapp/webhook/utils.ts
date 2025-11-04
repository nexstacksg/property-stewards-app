import prisma from '@/lib/prisma'
import { updateSessionState } from '@/lib/chat-session'
import { getLocationsWithCompletionStatus, getInspectorByPhone, getContractChecklistItemIdByLocation } from '@/lib/services/inspectorService'

const debugLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== 'production') console.log(...args)
}

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
    data?.fileUrl ||
    data?.media?.file?.download ||
    data?.media?.links?.download ||
    data?.media?.links?.resource
  )
}

// Utility: format locations with (Done) suffix
export async function buildLocationsFormatted(workOrderId: string): Promise<string[]> {
  const locs = (await getLocationsWithCompletionStatus(workOrderId)) as any[]
  return locs.map((l: any, i: number) => `[${i + 1}] ${l.isCompleted ? `${l.name} (Done)` : l.name}`)
}

// Removed instant small-talk reply helper to reduce unused logic

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
    let entry = await prisma.itemEntry.findFirst({ where: { itemId, inspectorId }, orderBy: { createdOn: 'desc' } })
    if (!entry) entry = await prisma.itemEntry.create({ data: { itemId, inspectorId } })

    await prisma.itemEntry.update({
      where: { id: entry.id },
      data: mediaType === 'photo'
        ? { photos: { push: publicUrl } }
        : { videos: { push: publicUrl } }
    })
    debugLog('✅ Media saved to inspector entry for inspector', inspectorId)
  } else {
    await prisma.contractChecklistItem.update({
      where: { id: itemId },
      data: mediaType === 'photo'
        ? { photos: { push: publicUrl } }
        : { videos: { push: publicUrl } }
    })
    debugLog('✅ Media saved to contract checklist item', itemId)
  }
}

// Utility: append media to an existing item entry (per task)
export async function saveMediaToItemEntry(entryId: string, publicUrl: string, mediaType: 'photo' | 'video', caption?: string, taskIdForMedia?: string | null) {
  const entry = await prisma.itemEntry.update({
    where: { id: entryId },
    data: mediaType === 'photo'
      ? { photos: { push: publicUrl } }
      : { videos: { push: publicUrl } },
    select: { taskId: true }
  })

  // Create an ItemEntryMedia row with optional caption
  try {
    await prisma.itemEntryMedia.create({
      data: {
        entryId,
        taskId: (taskIdForMedia || entry.taskId) || undefined,
        url: publicUrl,
        caption: caption && caption.trim().length > 0 ? caption.trim() : null,
        type: mediaType === 'photo' ? 'PHOTO' : 'VIDEO',
        // order is auto defaulted; could be improved by counting existing
      }
    })
  } catch (e) {
    console.error('Failed to create ItemEntryMedia record', e)
  }

  if (entry.taskId) {
    await prisma.checklistTask.update({
      where: { id: entry.taskId },
      data: mediaType === 'photo'
        ? { photos: { push: publicUrl } }
        : { videos: { push: publicUrl } }
    })
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
    debugLog(`✅ Message sent to ${to}`)
    return result
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error)
    throw error
  }
}
