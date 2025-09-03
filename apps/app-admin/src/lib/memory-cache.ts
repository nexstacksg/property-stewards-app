/**
 * Simple in-memory cache with TTL and LRU eviction
 * Optimized for performance without external dependencies
 */

interface CacheEntry<T> {
  value: T;
  expires: number;
  lastAccessed: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize = 1000; // Maximum number of entries
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 30000);
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    // Update last accessed time
    entry.lastAccessed = Date.now();
    return entry.value as T;
  }

  /**
   * Set value in cache with TTL in seconds
   */
  set<T>(key: string, value: T, ttl: number = 300): void {
    // Enforce cache size limit
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + (ttl * 1000),
      lastAccessed: Date.now()
    });
  }

  /**
   * Delete from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Delete all entries matching pattern
   */
  deletePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check if expired
    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires < now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Destroy cache and clear interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

// Create singleton instance
const memoryCache = new MemoryCache();

// Cache TTL configurations (in seconds)
export const CACHE_TTL = {
  INSPECTOR: 300,      // 5 minutes
  WORK_ORDER: 300,     // 5 minutes  
  THREAD: 3600,        // 1 hour
  LOCATIONS: 180,      // 3 minutes
  ASSISTANT_ID: 86400, // 24 hours
  TODAY_JOBS: 60,      // 1 minute (for time-sensitive data)
  TASK_MEDIA: 120,     // 2 minutes
};

// Helper functions for specific cache operations
export const cacheHelpers = {
  // Inspector cache
  async getInspector(phone: string): Promise<any | null> {
    return memoryCache.get(`inspector:${phone}`);
  },
  
  async setInspector(phone: string, inspector: any): Promise<void> {
    memoryCache.set(`inspector:${phone}`, inspector, CACHE_TTL.INSPECTOR);
  },

  // Work order cache
  async getWorkOrder(id: string): Promise<any | null> {
    return memoryCache.get(`workorder:${id}`);
  },
  
  async setWorkOrder(id: string, workOrder: any): Promise<void> {
    memoryCache.set(`workorder:${id}`, workOrder, CACHE_TTL.WORK_ORDER);
  },
  
  async clearWorkOrder(id: string): Promise<void> {
    memoryCache.delete(`workorder:${id}`);
    // Also clear related locations cache
    memoryCache.delete(`locations:${id}`);
  },

  // Thread cache
  async getThread(phone: string): Promise<string | null> {
    const data = memoryCache.get<{ threadId: string }>(`thread:${phone}`);
    return data?.threadId || null;
  },
  
  async setThread(phone: string, threadId: string): Promise<void> {
    memoryCache.set(`thread:${phone}`, { threadId }, CACHE_TTL.THREAD);
  },

  // Locations cache
  async getLocations(workOrderId: string): Promise<any[] | null> {
    return memoryCache.get(`locations:${workOrderId}`);
  },
  
  async setLocations(workOrderId: string, locations: any[]): Promise<void> {
    memoryCache.set(`locations:${workOrderId}`, locations, CACHE_TTL.LOCATIONS);
  },

  // Assistant ID cache
  async getAssistantId(): Promise<string | null> {
    const data = memoryCache.get<{ assistantId: string }>('assistant:current');
    return data?.assistantId || null;
  },
  
  async setAssistantId(assistantId: string): Promise<void> {
    memoryCache.set('assistant:current', { assistantId }, CACHE_TTL.ASSISTANT_ID);
  },

  // Today's jobs cache
  async getTodayJobs(inspectorId: string, dateKey: string): Promise<any[] | null> {
    return memoryCache.get(`todayjobs:${inspectorId}:${dateKey}`);
  },
  
  async setTodayJobs(inspectorId: string, dateKey: string, jobs: any[]): Promise<void> {
    memoryCache.set(`todayjobs:${inspectorId}:${dateKey}`, jobs, CACHE_TTL.TODAY_JOBS);
  },

  // Task media cache
  async getTaskMedia(taskId: string): Promise<any | null> {
    return memoryCache.get(`taskmedia:${taskId}`);
  },
  
  async setTaskMedia(taskId: string, media: any): Promise<void> {
    memoryCache.set(`taskmedia:${taskId}`, media, CACHE_TTL.TASK_MEDIA);
  },

  // Generic cache operations
  async get<T>(key: string): Promise<T | null> {
    return memoryCache.get<T>(key);
  },

  async set(key: string, value: any, ttl?: number): Promise<void> {
    memoryCache.set(key, value, ttl);
  },

  async del(key: string): Promise<void> {
    memoryCache.delete(key);
  },

  async delPattern(pattern: string): Promise<void> {
    memoryCache.deletePattern(pattern);
  },

  async exists(key: string): Promise<boolean> {
    return memoryCache.has(key);
  },

  async clear(): Promise<void> {
    memoryCache.clear();
  },
};

// Export the cache instance for direct access if needed
export const cache = {
  get: <T>(key: string) => memoryCache.get<T>(key),
  set: (key: string, value: any, ttl?: number) => memoryCache.set(key, value, ttl),
  del: (key: string) => memoryCache.delete(key),
  delPattern: (pattern: string) => memoryCache.deletePattern(pattern),
  exists: (key: string) => memoryCache.has(key),
  clear: () => memoryCache.clear(),
  size: () => memoryCache.size(),
};

// Cleanup function for graceful shutdown
export async function cleanupCache() {
  console.log('🧹 Cleaning up memory cache');
  memoryCache.destroy();
}

export default memoryCache;