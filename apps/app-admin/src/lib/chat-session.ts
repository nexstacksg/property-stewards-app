import { cacheGetJSON, cacheSetJSON } from '@/lib/memcache'

export type PendingMediaUpload = {
  url: string
  key: string
  mediaType: 'photo' | 'video'
  workOrderId?: string
  location?: string
  locationId?: string
  subLocation?: string
  subLocationId?: string
  isTaskFlow?: boolean
  taskId?: string | null
  taskItemId?: string | null
  taskEntryId?: string | null
  taskName?: string | null
  uploadedAt: string
  condition?: string | null
}

export type ChatSessionState = {
  // identity
  inspectorId?: string
  inspectorName?: string
  inspectorPhone?: string
  // channel + contact metadata
  channel?: string
  phoneNumber?: string
  identifiedAt?: string

  // job context
  workOrderId?: string
  customerName?: string
  propertyAddress?: string
  postalCode?: string
  jobStatus?: 'none' | 'confirming' | 'started'
  // job edit flow during confirmation
  jobEditMode?: 'menu' | 'await_value'
  jobEditType?: 'customer' | 'address' | 'time' | 'status'

  // inspection context
  currentLocation?: string
  currentLocationId?: string
  currentSubLocationId?: string
  currentSubLocationName?: string
  currentItemId?: string

  // task flow context
  currentTaskId?: string
  currentTaskName?: string
  currentTaskItemId?: string
  currentTaskEntryId?: string
  currentTaskCondition?: string
  currentTaskLocationId?: string
  currentTaskLocationName?: string
  currentLocationCondition?: string
  taskFlowStage?: 'condition' | 'media' | 'remarks' | 'confirm' | 'cause' | 'resolution'
  pendingTaskRemarks?: string | null
  pendingTaskCause?: string | null
  pendingTaskResolution?: string | null
  pendingMediaUploads?: PendingMediaUpload[]
  locationSubLocations?: Record<string, Array<{ id: string; name: string; status: string }>> // keyed by ContractChecklistItem ID

  // assistant/thread context
  threadId?: string

  // menu/navigation context
  lastMenu?: 'jobs' | 'confirm' | 'locations' | 'sublocations' | 'tasks'
  lastMenuAt?: string

  // cached choices for quick number mapping (avoids re-fetch)
  lastJobsSnapshot?: Array<{ id: string; number: number }>

  // audit
  createdAt?: string
  lastUpdatedAt?: string
}

const baseKey = (sessionId: string) => `mc:chat:session:${sessionId}`
const defaultTTL = Number(process.env.MEMCACHE_SESSION_TTL ?? 86400) // 24h

export async function getSessionState(sessionId: string): Promise<ChatSessionState> {
  const key = baseKey(sessionId)
  const t0 = Date.now()
  const state = await cacheGetJSON<ChatSessionState>(key)
  const out = state || {}
  // Verbose session logging for observability in Vercel logs
  try {
    const logSessions = (process.env.WHATSAPP_LOG_SESSIONS ?? 'true').toLowerCase() !== 'false'
    if (logSessions) {
      console.log('[sess:get:state]', { sessionId, state: out })
    }
  } catch {}
  try {
    const dbg = (process.env.WHATSAPP_DEBUG || '').toLowerCase()
    if (dbg && dbg !== 'false') {
      const summary = {
        workOrderId: out.workOrderId,
        jobStatus: out.jobStatus,
        lastMenu: out.lastMenu,
        currentLocation: out.currentLocation,
        currentLocationId: out.currentLocationId,
        currentSubLocationId: out.currentSubLocationId,
        currentTaskId: out.currentTaskId,
        currentTaskEntryId: out.currentTaskEntryId,
        currentTaskCondition: out.currentTaskCondition,
        inspectorId: out.inspectorId,
        inspectorPhone: out.inspectorPhone,
        createdAt: out.createdAt,
        lastUpdatedAt: out.lastUpdatedAt
      }
      console.log('[sess:get]', { sessionId, tookMs: Date.now() - t0, summary })
    }
  } catch {}
  return out
}

export async function updateSessionState(sessionId: string, updates: Partial<ChatSessionState>): Promise<ChatSessionState> {
  const key = baseKey(sessionId)
  const existing = await cacheGetJSON<ChatSessionState>(key)
  const merged: ChatSessionState = {
    ...(existing || {}),
    ...updates,
    lastUpdatedAt: new Date().toISOString(),
    createdAt: existing?.createdAt || new Date().toISOString()
  }
  await cacheSetJSON(key, merged, { ttlSeconds: defaultTTL })
  try {
    const dbg = (process.env.WHATSAPP_DEBUG || '').toLowerCase()
    if (dbg && dbg !== 'false') {
      const before = existing || {}
      const after = merged
      const summaryBefore = {
        workOrderId: before.workOrderId,
        jobStatus: before.jobStatus,
        lastMenu: before.lastMenu,
        currentLocation: before.currentLocation,
        currentLocationId: before.currentLocationId,
        currentSubLocationId: before.currentSubLocationId,
        currentTaskId: before.currentTaskId,
        currentTaskEntryId: before.currentTaskEntryId,
        currentTaskCondition: before.currentTaskCondition,
        inspectorId: before.inspectorId,
        inspectorPhone: before.inspectorPhone,
        createdAt: before.createdAt,
        lastUpdatedAt: before.lastUpdatedAt
      }
      const summaryAfter = {
        workOrderId: after.workOrderId,
        jobStatus: after.jobStatus,
        lastMenu: after.lastMenu,
        currentLocation: after.currentLocation,
        currentLocationId: after.currentLocationId,
        currentSubLocationId: after.currentSubLocationId,
        currentTaskId: after.currentTaskId,
        currentTaskEntryId: after.currentTaskEntryId,
        currentTaskCondition: after.currentTaskCondition,
        inspectorId: after.inspectorId,
        inspectorPhone: after.inspectorPhone,
        createdAt: after.createdAt,
        lastUpdatedAt: after.lastUpdatedAt
      }
      console.log('[sess:update]', { sessionId, updates, before: summaryBefore, after: summaryAfter })
    }
  } catch {}
  return merged
}
