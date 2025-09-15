import { cacheGetJSON, cacheSetJSON } from '@/lib/memcache'

export type ChatSessionState = {
  // identity
  inspectorId?: string
  inspectorName?: string
  inspectorPhone?: string

  // job context
  workOrderId?: string
  customerName?: string
  propertyAddress?: string
  postalCode?: string
  jobStatus?: 'none' | 'confirming' | 'started'

  // inspection context
  currentLocation?: string
  currentItemId?: string

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
