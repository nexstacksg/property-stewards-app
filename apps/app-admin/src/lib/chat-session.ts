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

  // audit
  createdAt?: string
  lastUpdatedAt?: string
}

const baseKey = (sessionId: string) => `mc:chat:session:${sessionId}`
const defaultTTL = Number(process.env.MEMCACHE_SESSION_TTL ?? 86400) // 24h

export async function getSessionState(sessionId: string): Promise<ChatSessionState> {
  const key = baseKey(sessionId)
  const state = await cacheGetJSON<ChatSessionState>(key)
  return state || {}
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
  return merged
}
