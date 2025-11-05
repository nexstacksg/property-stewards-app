import memjs from 'memjs'

// MemCachier client singleton with sensible defaults
// Expects env vars:
// - MEMCACHIER_SERVERS (e.g., "mc1.prod.memcachier.com:11211")
// - MEMCACHIER_USERNAME
// - MEMCACHIER_PASSWORD
// - MEMCACHIER_TLS (optional, default true)

let client: memjs.Client | null = null
let warnedDisabled = false
let warnedMissingEnv = false

export function getMemcacheClient(): memjs.Client | null {
  if (client) return client

  // Allow explicitly disabling memcache in environments where the
  // service is unreachable (e.g., Proxmox without outbound access).
  const disabled = (process.env.MEMCACHE_DISABLED ?? '').toLowerCase()
  if (disabled === '1' || disabled === 'true') {
    if (!warnedDisabled) {
      console.warn('[memcache] Disabled via MEMCACHE_DISABLED env; skipping client init')
      warnedDisabled = true
    }
    return null
  }

  const servers = process.env.MEMCACHIER_SERVERS
  const username = process.env.MEMCACHIER_USERNAME
  const password = process.env.MEMCACHIER_PASSWORD

  if (!servers || !username || !password) {
    if (!warnedMissingEnv) {
      console.warn('[memcache] MEMCACHIER env vars missing; cache disabled')
      warnedMissingEnv = true
    }
    return null
  }

  const useTLS = (process.env.MEMCACHIER_TLS ?? 'true').toLowerCase() !== 'false'
  const timeoutMs = Number(process.env.MEMCACHE_TIMEOUT_MS ?? 1000) / 1000 // memjs expects seconds
  const retries = Number(process.env.MEMCACHIER_RETRIES ?? 0)

  client = memjs.Client.create(servers, {
    username,
    password,
    // MemCachier recommends TLS when available
    // @ts-expect-error memjs types don’t include tls, but it’s supported at runtime
    tls: useTLS,
    // Small timeouts to avoid blocking critical paths
    timeout: timeoutMs,
    retries,
  })

  return client
}

export interface CacheSetOptions {
  ttlSeconds?: number
}

// Helpers for JSON get/set with automatic Buffer/encoding
export async function cacheSetJSON(key: string, value: unknown, opts: CacheSetOptions = {}): Promise<boolean> {
  const c = getMemcacheClient()
  if (!c) return false
  try {
    // Default TTL: 6 hours (override via MEMCACHE_DEFAULT_TTL or opts)
    const ttl = opts.ttlSeconds ?? Number(process.env.MEMCACHE_DEFAULT_TTL ?? 21600)
    const payload = Buffer.from(JSON.stringify(value))
    await c.set(key, payload, { expires: ttl })
    return true
  } catch (err) {
    console.error('[memcache] set error for key', key, err)
    return false
  }
}

export async function cacheFlushAll(): Promise<boolean> {
  const c = getMemcacheClient()
  if (!c) return false
  try {
    await new Promise<void>((resolve, reject) => {
      // memjs exposes flush(callback) to clear all keys
      c.flush((err: Error | null) => {
        if (err) return reject(err)
        resolve()
      })
    })
    return true
  } catch (err) {
    console.error('[memcache] flush error', err)
    return false
  }
}

export async function cacheGetJSON<T = unknown>(key: string): Promise<T | null> {
  const c = getMemcacheClient()
  if (!c) return null
  try {
    const { value } = await c.get(key)
    if (!value) return null
    return JSON.parse(value.toString('utf8')) as T
  } catch (err) {
    console.error('[memcache] get error for key', key, err)
    return null
  }
}

// Retrieve a possibly chunked array stored by cacheSetLargeArray
export async function cacheGetLargeArray<T = unknown>(baseKey: string): Promise<T[] | null> {
  const c = getMemcacheClient()
  if (!c) return null
  // Try direct key first
  const direct = await cacheGetJSON<T[]>(baseKey)
  if (direct && Array.isArray(direct)) return direct

  // Otherwise, look for index manifest
  const indexKey = `${baseKey}:index`
  const index = await cacheGetJSON<{ keys: string[] }>(indexKey)
  if (!index || !Array.isArray(index.keys)) return null

  const out: T[] = []
  for (const key of index.keys) {
    if (key === indexKey) continue
    const chunk = await cacheGetJSON<T[]>(key)
    if (chunk && Array.isArray(chunk)) out.push(...chunk)
  }
  return out
}

// Memcache has ~1MB item size limit; this chunks large arrays.
export async function cacheSetLargeArray(
  baseKey: string,
  items: unknown[],
  chunkSize = Number(process.env.MEMCACHE_CHUNK_SIZE ?? 200),
  opts: CacheSetOptions = {}
): Promise<{ chunks: number, keys: string[] }> {
  const c = getMemcacheClient()
  if (!c) return { chunks: 0, keys: [] }

  const ttl = opts.ttlSeconds ?? Number(process.env.MEMCACHE_DEFAULT_TTL ?? 21600)

  // If it fits in one item, store directly
  const serialized = JSON.stringify(items)
  if (Buffer.byteLength(serialized, 'utf8') < 900_000) {
    await cacheSetJSON(baseKey, items, { ttlSeconds: ttl })
    return { chunks: 1, keys: [baseKey] }
  }

  // Otherwise, split into chunks
  const total = items.length
  const keys: string[] = []
  let chunkIndex = 0
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    const key = `${baseKey}:chunk:${chunkIndex}`
    await cacheSetJSON(key, chunk, { ttlSeconds: ttl })
    keys.push(key)
    chunkIndex++
  }

  // Write an index manifest
  const indexKey = `${baseKey}:index`
  await cacheSetJSON(indexKey, { total, chunkSize, chunks: chunkIndex, keys }, { ttlSeconds: ttl })
  return { chunks: chunkIndex, keys: [indexKey, ...keys] }
}

export async function cacheSetLargeArrayNoFlush(
  baseKey: string,
  items: unknown[],
  chunkSize = Number(process.env.MEMCACHE_CHUNK_SIZE ?? 200),
  opts: CacheSetOptions = {}
): Promise<{ chunks: number, keys: string[] }> {
  const c = getMemcacheClient()
  if (!c) return { chunks: 0, keys: [] }

  const ttl = opts.ttlSeconds ?? Number(process.env.MEMCACHE_DEFAULT_TTL ?? 21600)

  const serialized = JSON.stringify(items)
  if (Buffer.byteLength(serialized, 'utf8') < 900_000) {
    await cacheSetJSON(baseKey, items, { ttlSeconds: ttl })
    return { chunks: 1, keys: [baseKey] }
  }

  const total = items.length
  const keys: string[] = []
  let chunkIndex = 0
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    const key = `${baseKey}:chunk:${chunkIndex}`
    await cacheSetJSON(key, chunk, { ttlSeconds: ttl })
    keys.push(key)
    chunkIndex++
  }

  const indexKey = `${baseKey}:index`
  await cacheSetJSON(indexKey, { total, chunkSize, chunks: chunkIndex, keys }, { ttlSeconds: ttl })
  return { chunks: chunkIndex, keys: [indexKey, ...keys] }
}

// Delete a key (for invalidation on updates)
export async function cacheDel(key: string): Promise<boolean> {
  const c = getMemcacheClient()
  if (!c) return false
  try {
    await c.delete(key)
    return true
  } catch (err) {
    console.error('[memcache] delete error for key', key, err)
    return false
  }
}
