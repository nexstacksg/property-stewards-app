import Redis from 'ioredis';

// Initialize Redis client
const redis = new Redis(process.env.REDIS_URL || 'dp9', {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 3) {
      console.error('❌ Redis connection failed after 3 retries');
      return null;
    }
    const delay = Math.min(times * 50, 2000);
    console.log(`⏳ Retrying Redis connection in ${delay}ms...`);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const targetErrors = ['READONLY', 'ETIMEDOUT', 'ECONNREFUSED'];
    return targetErrors.some(e => err.message.includes(e));
  }
});

// Log connection status
redis.on('connect', () => {
  console.log('✅ Redis connected successfully');
  // Pre-warm the connection with a ping
  redis.ping().catch(() => {});
});

redis.on('error', (error: Error) => {
  console.error('❌ Redis error:', error.message);
});

// Pre-warm Redis connection on module load
redis.ping().catch(() => {});

// Thread storage with TTL (15 hours)
const THREAD_TTL = 15 * 60 * 60; // 15 hours in seconds
const THREAD_PREFIX = 'whatsapp:thread:';
const METADATA_PREFIX = 'whatsapp:metadata:';
const INSPECTOR_PREFIX = 'whatsapp:inspector:';
const CACHE_TTL = 15 * 60 * 60; // 15 hours cache for inspector data (same as thread TTL)

export interface ThreadMetadata {
  threadId: string;
  phoneNumber: string;
  channel: string;
  inspectorId?: string;
  inspectorName?: string;
  workOrderId?: string;
  currentLocation?: string;
  customerName?: string;
  propertyAddress?: string;
  postalCode?: string;
  jobStatus?: string;
  jobStartedAt?: string;
  lastLocationAccessedAt?: string;
  createdAt: string;
  lastMessageAt?: string;
}

/**
 * Store thread ID and metadata for a phone number
 */
export async function storeThread(phoneNumber: string, threadId: string, metadata: Partial<ThreadMetadata>): Promise<void> {
  try {
    const key = `${THREAD_PREFIX}${phoneNumber}`;
    const metaKey = `${METADATA_PREFIX}${phoneNumber}`;
    
    // Store thread ID
    await redis.set(key, threadId, 'EX', THREAD_TTL);
    
    // Store metadata as JSON
    const fullMetadata: ThreadMetadata = {
      threadId,
      phoneNumber,
      channel: 'whatsapp',
      createdAt: new Date().toISOString(),
      ...metadata
    };
    
    await redis.set(metaKey, JSON.stringify(fullMetadata), 'EX', THREAD_TTL);
    
    console.log(`💾 Stored thread ${threadId} for ${phoneNumber} in Redis`);
  } catch (error) {
    console.error('Error storing thread in Redis:', error);
    throw error;
  }
}

/**
 * Get thread ID for a phone number
 */
export async function getThread(phoneNumber: string): Promise<string | null> {
  try {
    const key = `${THREAD_PREFIX}${phoneNumber}`;
    const threadId = await redis.get(key);
    
    if (threadId) {
      // Refresh TTL on access
      await redis.expire(key, THREAD_TTL);
      await redis.expire(`${METADATA_PREFIX}${phoneNumber}`, THREAD_TTL);
      console.log(`📖 Retrieved thread ${threadId} for ${phoneNumber} from Redis`);
    }
    
    return threadId;
  } catch (error) {
    console.error('Error getting thread from Redis:', error);
    return null;
  }
}

/**
 * Get thread metadata for a phone number
 */
export async function getThreadMetadata(phoneNumber: string): Promise<ThreadMetadata | null> {
  try {
    const metaKey = `${METADATA_PREFIX}${phoneNumber}`;
    const metadataStr = await redis.get(metaKey);
    
    if (metadataStr) {
      const metadata = JSON.parse(metadataStr) as ThreadMetadata;
      console.log(`📋 Retrieved metadata for ${phoneNumber} from Redis`);
      return metadata;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting thread metadata from Redis:', error);
    return null;
  }
}

/**
 * Update thread metadata
 */
export async function updateThreadMetadata(phoneNumber: string, updates: Partial<ThreadMetadata>): Promise<void> {
  try {
    const metaKey = `${METADATA_PREFIX}${phoneNumber}`;
    const existingMetadataStr = await redis.get(metaKey);
    
    let metadata: ThreadMetadata;
    if (existingMetadataStr) {
      metadata = JSON.parse(existingMetadataStr);
      metadata = { ...metadata, ...updates, lastMessageAt: new Date().toISOString() };
    } else {
      // If no existing metadata, create new with defaults
      metadata = {
        threadId: updates.threadId || '',
        phoneNumber,
        channel: 'whatsapp',
        createdAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
        ...updates
      };
    }
    
    await redis.set(metaKey, JSON.stringify(metadata), 'EX', THREAD_TTL);
    console.log(`🔄 Updated metadata for ${phoneNumber} in Redis`);
  } catch (error) {
    console.error('Error updating thread metadata in Redis:', error);
    throw error;
  }
}

/**
 * Delete thread and metadata for a phone number
 */
export async function deleteThread(phoneNumber: string): Promise<void> {
  try {
    const key = `${THREAD_PREFIX}${phoneNumber}`;
    const metaKey = `${METADATA_PREFIX}${phoneNumber}`;
    
    await redis.del(key, metaKey);
    console.log(`🗑️ Deleted thread and metadata for ${phoneNumber} from Redis`);
  } catch (error) {
    console.error('Error deleting thread from Redis:', error);
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return redis.status === 'ready';
}

/**
 * Cache inspector data for faster lookups
 */
export async function cacheInspector(phoneNumber: string, inspectorData: any): Promise<void> {
  try {
    const key = `${INSPECTOR_PREFIX}${phoneNumber}`;
    await redis.set(key, JSON.stringify(inspectorData), 'EX', CACHE_TTL);
    console.log(`💾 Cached inspector data for ${phoneNumber}`);
  } catch (error) {
    console.error('Error caching inspector:', error);
  }
}

/**
 * Get cached inspector data
 */
export async function getCachedInspector(phoneNumber: string): Promise<any | null> {
  try {
    const key = `${INSPECTOR_PREFIX}${phoneNumber}`;
    const data = await redis.get(key);
    if (data) {
      console.log(`📖 Retrieved cached inspector data for ${phoneNumber}`);
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Error getting cached inspector:', error);
    return null;
  }
}

// REMOVED: Work order caching functions
// Work orders should NEVER be cached as they change based on date/time/status
// Only cache static data like inspector info

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
}

export default redis;