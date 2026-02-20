// Local-first cache using localStorage
// Key format:  wcw_{userId}_{key}
// Date-bucketed: wcw_{userId}_{table}_{YYYY-MM-DD}

interface CacheEnvelope<T> {
  data: T;
  cachedAt: number; // Date.now()
  version: 1;
}

class LocalCache {
  private prefix = "wcw";

  private buildKey(userId: string, key: string): string {
    return `${this.prefix}_${userId}_${key}`;
  }

  // ---------- Core ----------

  set<T>(userId: string, key: string, data: T): void {
    const envelope: CacheEnvelope<T> = { data, cachedAt: Date.now(), version: 1 };
    const raw = JSON.stringify(envelope);
    try {
      localStorage.setItem(this.buildKey(userId, key), raw);
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        // Auto-prune nutrition to 7 days then retry once
        this.pruneNutritionBefore(userId, 7);
        this.pruneHydrationBefore(userId, 7);
        try {
          localStorage.setItem(this.buildKey(userId, key), raw);
        } catch {
          // Give up silently — cache miss is acceptable
        }
      }
    }
  }

  get<T>(userId: string, key: string): T | null {
    try {
      const raw = localStorage.getItem(this.buildKey(userId, key));
      if (!raw) return null;
      const envelope: CacheEnvelope<T> = JSON.parse(raw);
      return envelope.data;
    } catch {
      return null;
    }
  }

  remove(userId: string, key: string): void {
    localStorage.removeItem(this.buildKey(userId, key));
  }

  cachedAt(userId: string, key: string): number | null {
    try {
      const raw = localStorage.getItem(this.buildKey(userId, key));
      if (!raw) return null;
      const envelope: CacheEnvelope<unknown> = JSON.parse(raw);
      return envelope.cachedAt;
    } catch {
      return null;
    }
  }

  // ---------- Date-bucketed helpers ----------

  private dateKey(table: string, date: string): string {
    return `${table}_${date}`;
  }

  setForDate<T>(userId: string, table: string, date: string, data: T): void {
    this.set(userId, this.dateKey(table, date), data);
  }

  getForDate<T>(userId: string, table: string, date: string): T | null {
    return this.get<T>(userId, this.dateKey(table, date));
  }

  removeForDate(userId: string, table: string, date: string): void {
    this.remove(userId, this.dateKey(table, date));
  }

  // ---------- Maintenance ----------

  private pruneTableBefore(userId: string, tablePrefix: string, keepDays: number): void {
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    const scanPrefix = `${this.prefix}_${userId}_${tablePrefix}_`;
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(scanPrefix)) {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const envelope: CacheEnvelope<unknown> = JSON.parse(raw);
            if (envelope.cachedAt < cutoff) {
              keysToRemove.push(k);
            }
          }
        } catch {
          keysToRemove.push(k); // Remove corrupt entries
        }
      }
    }

    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  }

  pruneNutritionBefore(userId: string, keepDays: number): void {
    this.pruneTableBefore(userId, "nutrition_logs", keepDays);
  }

  pruneHydrationBefore(userId: string, keepDays: number): void {
    this.pruneTableBefore(userId, "hydration_logs", keepDays);
  }

  clearUser(userId: string): void {
    const scanPrefix = `${this.prefix}_${userId}_`;
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(scanPrefix)) {
        keysToRemove.push(k);
      }
    }

    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  }
}

export const localCache = new LocalCache();
