// Simple localStorage-based persistence for AI content
// This replaces the complex database approach with a simple, reliable solution

import { logger } from "./logger";

interface StoredAIContent {
  data: any;
  timestamp: number;
  expiresAt: number;
  /** Last-write timestamp used for LRU eviction. Optional for migration
   *  safety — pre-LRU entries default to 0 so they're evicted first. */
  lastWritten?: number;
}

/**
 * Soft cap per user before LRU eviction kicks in. Picked empirically to keep
 * the per-user keyspace well below the ~5 MB localStorage quota even with
 * fat payloads like generated meal plans. Adjust if usage patterns change.
 */
const MAX_ENTRIES_PER_USER = 50;

export class AIPersistence {
  private static getStorageKey(userId: string, type: string): string {
    return `ai_${type}_${userId}`;
  }

  /** Enumerate this user's cache keys without parsing values. */
  private static keysForUser(userId: string): string[] {
    const suffix = `_${userId}`;
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ai_') && key.endsWith(suffix)) {
        out.push(key);
      }
    }
    return out;
  }

  /** LRU eviction: when the per-user keyspace exceeds the cap, drop oldest
   *  entries (by `lastWritten`, with missing values treated as 0 so legacy
   *  entries are evicted first). Best-effort — wrapped in try/catch so a
   *  parse failure on one entry never blocks a save. */
  private static evictIfOverCap(userId: string): void {
    try {
      const keys = this.keysForUser(userId);
      if (keys.length <= MAX_ENTRIES_PER_USER) return;

      const ranked = keys
        .map((key) => {
          let lastWritten = 0;
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw) as StoredAIContent;
              lastWritten = parsed.lastWritten ?? 0;
            }
          } catch {
            /* unparsable entry — leave lastWritten at 0 so it evicts first */
          }
          return { key, lastWritten };
        })
        .sort((a, b) => a.lastWritten - b.lastWritten);

      const toEvict = ranked.slice(0, keys.length - MAX_ENTRIES_PER_USER);
      toEvict.forEach(({ key }) => localStorage.removeItem(key));
    } catch (error) {
      logger.warn("AIPersistence: LRU eviction failed", { error });
    }
  }

  static save(userId: string, type: string, data: any, expirationHours: number = 24): void {
    try {
      const now = Date.now();
      const content: StoredAIContent = {
        data,
        timestamp: now,
        expiresAt: now + (expirationHours * 60 * 60 * 1000),
        lastWritten: now,
      };

      const key = this.getStorageKey(userId, type);
      localStorage.setItem(key, JSON.stringify(content));
      // Cap the per-user keyspace after every write so growth is bounded.
      this.evictIfOverCap(userId);
    } catch (error) {
      logger.warn("Failed to save AI content to localStorage", { error });
    }
  }

  static load(userId: string, type: string): any | null {
    try {
      const key = this.getStorageKey(userId, type);
      const stored = localStorage.getItem(key);
      
      if (!stored) return null;
      
      const content: StoredAIContent = JSON.parse(stored);
      
      // Check if expired
      if (Date.now() > content.expiresAt) {
        localStorage.removeItem(key);
        return null;
      }
      
      return content.data;
    } catch (error) {
      logger.warn("Failed to load AI content from localStorage", { error });
      return null;
    }
  }

  static remove(userId: string, type: string): void {
    try {
      const key = this.getStorageKey(userId, type);
      localStorage.removeItem(key);
    } catch (error) {
      logger.warn("Failed to remove AI content from localStorage", { error });
    }
  }

  static clearAllForUser(userId: string): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('ai_') && key.endsWith(`_${userId}`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      if (keysToRemove.length > 0) {
        logger.info(`Cleared ${keysToRemove.length} AI cache entries for user`, { userId: userId.slice(0, 8) });
      }
    } catch (error) {
      logger.warn("Failed to clear AI content for user", { error });
    }
  }

  static cleanup(): void {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('ai_')) {
          try {
            const stored = localStorage.getItem(key);
            if (stored) {
              const content: StoredAIContent = JSON.parse(stored);
              if (Date.now() > content.expiresAt) {
                keysToRemove.push(key);
              }
            }
          } catch (error) {
            // Invalid JSON, remove it
            keysToRemove.push(key);
          }
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      logger.warn("Failed to cleanup AI content", { error });
    }
  }
}

// Cleanup expired items — deferred to avoid blocking page load
if (typeof requestIdleCallback !== 'undefined') {
  requestIdleCallback(() => AIPersistence.cleanup());
} else {
  setTimeout(() => AIPersistence.cleanup(), 5000);
}
