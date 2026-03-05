// Simple localStorage-based persistence for AI content
// This replaces the complex database approach with a simple, reliable solution

import { logger } from "./logger";

interface StoredAIContent {
  data: any;
  timestamp: number;
  expiresAt: number;
}

export class AIPersistence {
  private static getStorageKey(userId: string, type: string): string {
    return `ai_${type}_${userId}`;
  }

  static save(userId: string, type: string, data: any, expirationHours: number = 24): void {
    try {
      const content: StoredAIContent = {
        data,
        timestamp: Date.now(),
        expiresAt: Date.now() + (expirationHours * 60 * 60 * 1000)
      };
      
      const key = this.getStorageKey(userId, type);
      localStorage.setItem(key, JSON.stringify(content));
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
