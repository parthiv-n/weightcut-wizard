// Nutrition data caching system for improved performance
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface ProfileCache {
  profile: any;
  meals: any[];
  macroGoals: any;
}

class NutritionCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes default TTL
  private readonly PROFILE_TTL = 10 * 60 * 1000; // 10 minutes for profile data
  private readonly MEALS_TTL = 2 * 60 * 1000; // 2 minutes for meals (more dynamic)

  // Generate cache key
  private getCacheKey(userId: string, type: string, date?: string): string {
    return date ? `${userId}:${type}:${date}` : `${userId}:${type}`;
  }

  // Check if cache entry is valid
  private isValid<T>(entry: CacheEntry<T>): boolean {
    return Date.now() < entry.expiresAt;
  }

  // Set cache entry with TTL
  set<T>(userId: string, type: string, data: T, ttl?: number, date?: string): void {
    const key = this.getCacheKey(userId, type, date);
    const now = Date.now();
    const expiresAt = now + (ttl || this.DEFAULT_TTL);

    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt,
    });
  }

  // Get cache entry if valid
  get<T>(userId: string, type: string, date?: string): T | null {
    const key = this.getCacheKey(userId, type, date);
    const entry = this.cache.get(key);

    if (!entry || !this.isValid(entry)) {
      if (entry) {
        this.cache.delete(key); // Clean up expired entry
      }
      return null;
    }

    return entry.data;
  }

  // Check if data exists in cache
  has(userId: string, type: string, date?: string): boolean {
    const key = this.getCacheKey(userId, type, date);
    const entry = this.cache.get(key);
    return entry ? this.isValid(entry) : false;
  }

  // Remove specific cache entry
  remove(userId: string, type: string, date?: string): void {
    const key = this.getCacheKey(userId, type, date);
    this.cache.delete(key);
  }

  // Clear all cache for a user
  clearUser(userId: string): void {
    const keysToDelete = Array.from(this.cache.keys()).filter(key => 
      key.startsWith(`${userId}:`)
    );
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  // Clear expired entries
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now >= entry.expiresAt) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  // Get cache statistics
  getStats() {
    const now = Date.now();
    let valid = 0;
    let expired = 0;

    this.cache.forEach(entry => {
      if (now < entry.expiresAt) {
        valid++;
      } else {
        expired++;
      }
    });

    return {
      total: this.cache.size,
      valid,
      expired,
    };
  }

  // Specific methods for nutrition data types
  
  // Profile caching
  setProfile(userId: string, profile: any): void {
    this.set(userId, 'profile', profile, this.PROFILE_TTL);
  }

  getProfile(userId: string): any | null {
    return this.get(userId, 'profile');
  }

  // Meals caching (by date)
  setMeals(userId: string, date: string, meals: any[]): void {
    this.set(userId, 'meals', meals, this.MEALS_TTL, date);
  }

  getMeals(userId: string, date: string): any[] | null {
    return this.get(userId, 'meals', date);
  }

  // Macro goals caching
  setMacroGoals(userId: string, macroGoals: any): void {
    this.set(userId, 'macroGoals', macroGoals, this.PROFILE_TTL);
  }

  getMacroGoals(userId: string): any | null {
    return this.get(userId, 'macroGoals');
  }

  // Invalidate related caches when data changes
  invalidateNutritionData(userId: string, date?: string): void {
    if (date) {
      this.remove(userId, 'meals', date);
    }
    this.remove(userId, 'macroGoals');
    // Don't invalidate profile unless specifically needed
  }

  // Batch cache operations for better performance
  setNutritionData(userId: string, date: string, data: {
    profile?: any;
    meals?: any[];
    macroGoals?: any;
  }): void {
    if (data.profile) {
      this.setProfile(userId, data.profile);
    }
    if (data.meals) {
      this.setMeals(userId, date, data.meals);
    }
    if (data.macroGoals) {
      this.setMacroGoals(userId, data.macroGoals);
    }
  }

  getNutritionData(userId: string, date: string): {
    profile: any | null;
    meals: any[] | null;
    macroGoals: any | null;
  } {
    return {
      profile: this.getProfile(userId),
      meals: this.getMeals(userId, date),
      macroGoals: this.getMacroGoals(userId),
    };
  }
}

// Global cache instance
export const nutritionCache = new NutritionCache();

// Auto-cleanup every 5 minutes
setInterval(() => {
  nutritionCache.cleanup();
}, 5 * 60 * 1000);

// Helper functions for common operations
export const cacheHelpers = {
  // Check if we need to fetch data
  shouldFetchProfile: (userId: string): boolean => {
    return !nutritionCache.has(userId, 'profile');
  },

  shouldFetchMeals: (userId: string, date: string): boolean => {
    return !nutritionCache.has(userId, 'meals', date);
  },

  shouldFetchMacroGoals: (userId: string): boolean => {
    return !nutritionCache.has(userId, 'macroGoals');
  },

  // Invalidate caches when user logs out
  clearUserSession: (userId: string): void => {
    nutritionCache.clearUser(userId);
  },
};

