/**
 * High-performance In-Memory Cache Service
 * Provides sub-millisecond data retrieval for frequently read, infrequently changed resources
 * (Categories, Banners, Products, Store Settings, Delivery Zones).
 */

class MemoryCache {
  constructor(maxEntries = 2000, defaultTtl = 600) {
    this.store = new Map();
    this.maxEntries = maxEntries;
    this.defaultTtl = defaultTtl;

    // Background cleanup of expired keys every 60 seconds
    this.cleanupInterval = setInterval(() => this.pruneExpired(), 60000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value, ttlSeconds = this.defaultTtl) {
    if (this.store.size >= this.maxEntries) {
      // Evict oldest inserted key
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });

    return value;
  }

  async getOrSet(key, fetcher, ttlSeconds = this.defaultTtl) {
    const cached = this.get(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const fresh = await fetcher();
    if (fresh !== null && fresh !== undefined) {
      this.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }

  del(key) {
    return this.store.delete(key);
  }

  delPattern(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    let count = 0;
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  pruneExpired() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  flush() {
    this.store.clear();
  }

  stats() {
    return {
      size: this.store.size,
      maxEntries: this.maxEntries
    };
  }
}

export const cache = new MemoryCache();

// Specific invalidation helpers
export const invalidateCatalog = () => cache.delPattern('catalog:*');
export const invalidateCategories = () => {
  cache.del('catalog:categories');
  cache.delPattern('catalog:products:*');
};
export const invalidateBanners = () => cache.del('catalog:banners');
export const invalidateProducts = () => {
  cache.delPattern('catalog:products:*');
  cache.delPattern('catalog:product:*');
  cache.delPattern('catalog:bestsellers');
  cache.delPattern('catalog:toppicks');
};
export const invalidateSettings = () => {
  cache.del('catalog:store-settings');
  cache.del('catalog:delivery-zones');
};
