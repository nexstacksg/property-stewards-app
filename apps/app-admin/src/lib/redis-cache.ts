import { createClient } from 'redis';

// Create Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: (retries: number) => {
      if (retries > 10) {
        console.error('❌ Redis: Too many reconnection attempts');
        return new Error('Too many reconnection attempts');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

// Handle Redis connection
redisClient.on('error', (err: Error) => {
  console.error('❌ Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Redis Client Connected');
});

redisClient.on('ready', () => {
  console.log('✅ Redis Client Ready');
});

// Connect on startup
(async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error);
  }
})();

// Cache TTL configurations
export const CACHE_TTL = {
  INSPECTOR: 300, // 5 minutes
  WORK_ORDER: 300, // 5 minutes
  THREAD: 3600, // 1 hour
  LOCATIONS: 180, // 3 minutes
  ASSISTANT_ID: 86400, // 24 hours
};

// Cache key prefixes
const CACHE_PREFIX = {
  INSPECTOR: 'inspector:',
  WORK_ORDER: 'workorder:',
  THREAD: 'thread:',
  LOCATIONS: 'locations:',
  ASSISTANT: 'assistant:',
};

// Helper functions for caching
export const cache = {
  // Get from cache
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!redisClient.isReady) {
        console.warn('⚠️ Redis not ready, skipping cache get');
        return null;
      }
      
      const value = await redisClient.get(key);
      if (!value) return null;
      
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`❌ Cache get error for key ${key}:`, error);
      return null;
    }
  },

  // Set in cache
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      if (!redisClient.isReady) {
        console.warn('⚠️ Redis not ready, skipping cache set');
        return;
      }
      
      const serialized = JSON.stringify(value);
      
      if (ttl) {
        await redisClient.setEx(key, ttl, serialized);
      } else {
        await redisClient.set(key, serialized);
      }
    } catch (error) {
      console.error(`❌ Cache set error for key ${key}:`, error);
    }
  },

  // Delete from cache
  async del(key: string): Promise<void> {
    try {
      if (!redisClient.isReady) {
        console.warn('⚠️ Redis not ready, skipping cache delete');
        return;
      }
      
      await redisClient.del(key);
    } catch (error) {
      console.error(`❌ Cache delete error for key ${key}:`, error);
    }
  },

  // Delete by pattern
  async delPattern(pattern: string): Promise<void> {
    try {
      if (!redisClient.isReady) {
        console.warn('⚠️ Redis not ready, skipping pattern delete');
        return;
      }
      
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    } catch (error) {
      console.error(`❌ Cache pattern delete error for ${pattern}:`, error);
    }
  },

  // Check if exists
  async exists(key: string): Promise<boolean> {
    try {
      if (!redisClient.isReady) {
        return false;
      }
      
      return (await redisClient.exists(key)) === 1;
    } catch (error) {
      console.error(`❌ Cache exists error for key ${key}:`, error);
      return false;
    }
  }
};

// Specific cache helpers
export const cacheHelpers = {
  // Inspector cache
  async getInspector(phone: string): Promise<any | null> {
    return cache.get(`${CACHE_PREFIX.INSPECTOR}${phone}`);
  },
  
  async setInspector(phone: string, inspector: any): Promise<void> {
    await cache.set(`${CACHE_PREFIX.INSPECTOR}${phone}`, inspector, CACHE_TTL.INSPECTOR);
  },

  // Work order cache
  async getWorkOrder(id: string): Promise<any | null> {
    return cache.get(`${CACHE_PREFIX.WORK_ORDER}${id}`);
  },
  
  async setWorkOrder(id: string, workOrder: any): Promise<void> {
    await cache.set(`${CACHE_PREFIX.WORK_ORDER}${id}`, workOrder, CACHE_TTL.WORK_ORDER);
  },
  
  async clearWorkOrder(id: string): Promise<void> {
    await cache.del(`${CACHE_PREFIX.WORK_ORDER}${id}`);
    // Also clear related locations cache
    await cache.del(`${CACHE_PREFIX.LOCATIONS}${id}`);
  },

  // Thread cache
  async getThread(phone: string): Promise<string | null> {
    const data = await cache.get<{ threadId: string }>(`${CACHE_PREFIX.THREAD}${phone}`);
    return data?.threadId || null;
  },
  
  async setThread(phone: string, threadId: string): Promise<void> {
    await cache.set(`${CACHE_PREFIX.THREAD}${phone}`, { threadId }, CACHE_TTL.THREAD);
  },

  // Locations cache
  async getLocations(workOrderId: string): Promise<any[] | null> {
    return cache.get(`${CACHE_PREFIX.LOCATIONS}${workOrderId}`);
  },
  
  async setLocations(workOrderId: string, locations: any[]): Promise<void> {
    await cache.set(`${CACHE_PREFIX.LOCATIONS}${workOrderId}`, locations, CACHE_TTL.LOCATIONS);
  },

  // Assistant ID cache
  async getAssistantId(): Promise<string | null> {
    const data = await cache.get<{ assistantId: string }>(`${CACHE_PREFIX.ASSISTANT}current`);
    return data?.assistantId || null;
  },
  
  async setAssistantId(assistantId: string): Promise<void> {
    await cache.set(`${CACHE_PREFIX.ASSISTANT}current`, { assistantId }, CACHE_TTL.ASSISTANT_ID);
  }
};

// Cleanup function for graceful shutdown
export async function cleanupRedis() {
  try {
    await redisClient.quit();
    console.log('✅ Redis client closed');
  } catch (error) {
    console.error('❌ Error closing Redis client:', error);
  }
}

export default redisClient;