// Background data synchronization utility
import { logger } from "./logger";

interface SyncTask {
  id: string;
  operation: () => Promise<any>;
  retryCount: number;
  maxRetries: number;
  priority: number;
  onSuccess?: (result: any) => void;
  onError?: (error: any) => void;
}

class BackgroundSyncManager {
  private tasks: Map<string, SyncTask> = new Map();
  private isProcessing = false;
  private readonly MAX_CONCURRENT_TASKS = 3;
  private readonly RETRY_DELAY = 1000; // 1 second base delay

  // Add a task to the background sync queue
  addTask(task: Omit<SyncTask, 'retryCount'>): void {
    const syncTask: SyncTask = {
      ...task,
      retryCount: 0,
    };

    this.tasks.set(task.id, syncTask);
    this.processTasks();
  }

  // Remove a task from the queue
  removeTask(id: string): void {
    this.tasks.delete(id);
  }

  // Process tasks in the background
  private async processTasks(): Promise<void> {
    if (this.isProcessing || this.tasks.size === 0) return;

    this.isProcessing = true;

    try {
      // Get tasks sorted by priority (higher first)
      const sortedTasks = Array.from(this.tasks.values())
        .sort((a, b) => b.priority - a.priority)
        .slice(0, this.MAX_CONCURRENT_TASKS);

      // Process tasks in parallel
      const promises = sortedTasks.map(task => this.executeTask(task));
      await Promise.allSettled(promises);

      // Continue processing if there are more tasks
      if (this.tasks.size > 0) {
        // Small delay before next batch
        setTimeout(() => {
          this.isProcessing = false;
          this.processTasks();
        }, 100);
      } else {
        this.isProcessing = false;
      }
    } catch (error) {
      logger.error("Background sync error", error);
      this.isProcessing = false;
    }
  }

  // Execute a single task with retry logic
  private async executeTask(task: SyncTask): Promise<void> {
    try {
      const result = await task.operation();
      
      // Success - remove task and call success callback
      this.tasks.delete(task.id);
      task.onSuccess?.(result);
      
    } catch (error) {
      logger.error(`Background sync task ${task.id} failed`, error);
      
      // Increment retry count
      task.retryCount++;
      
      if (task.retryCount >= task.maxRetries) {
        // Max retries reached - remove task and call error callback
        this.tasks.delete(task.id);
        task.onError?.(error);
      } else {
        // Schedule retry with exponential backoff
        const delay = this.RETRY_DELAY * Math.pow(2, task.retryCount - 1);
        setTimeout(() => {
          this.processTasks();
        }, delay);
      }
    }
  }

  // Get current queue status
  getStatus() {
    return {
      queueSize: this.tasks.size,
      isProcessing: this.isProcessing,
      tasks: Array.from(this.tasks.keys()),
    };
  }

  // Clear all tasks
  clear(): void {
    this.tasks.clear();
  }
}

// Global background sync manager
export const backgroundSync = new BackgroundSyncManager();

// Helper functions for common background sync operations

// Sync profile data in background
export const syncProfileInBackground = (userId: string, profileData: any) => {
  backgroundSync.addTask({
    id: `sync-profile-${userId}`,
    operation: async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      return supabase
        .from('profiles')
        .update(profileData)
        .eq('id', userId);
    },
    maxRetries: 3,
    priority: 5,
    onError: (error) => {
      logger.error("Failed to sync profile data", error);
    },
  });
};

// Sync nutrition data in background
export const syncNutritionInBackground = (userId: string, nutritionData: any) => {
  backgroundSync.addTask({
    id: `sync-nutrition-${userId}-${Date.now()}`,
    operation: async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      return supabase
        .from('nutrition_logs')
        .insert(nutritionData);
    },
    maxRetries: 2,
    priority: 3,
    onError: (error) => {
      logger.error("Failed to sync nutrition data", error);
    },
  });
};

// Preload meals for a set of dates via the v2 `meals_with_totals` view. Writes
// into both the in-memory nutritionCache and localStorage so date navigation
// is O(1) when the user scrubs back and forth — MyFitnessPal-style.
export const preloadNutritionData = (userId: string, dates: string[]) => {
  dates.forEach((date) => {
    backgroundSync.addTask({
      id: `preload-nutrition-${userId}-${date}`,
      operation: async () => {
        const { supabase } = await import('@/integrations/supabase/client');
        const { nutritionCache } = await import('@/lib/nutritionCache');
        const { localCache } = await import('@/lib/localCache');
        const { mapMealsWithTotalsToMeal } = await import('@/hooks/nutrition/mealsMapper');

        // Skip if we already have a fresh in-memory slot for this date.
        if (nutritionCache.has(userId, 'meals', date)) return null;

        const { data, error } = await supabase
          .from('meals_with_totals')
          .select('id, user_id, date, meal_type, meal_name, notes, is_ai_generated, total_calories, total_protein_g, total_carbs_g, total_fats_g, item_count, created_at')
          .eq('user_id', userId)
          .eq('date', date)
          .order('created_at', { ascending: true })
          .limit(100);

        if (error) return null;

        const meals = (data ?? []).map(mapMealsWithTotalsToMeal);
        nutritionCache.setMeals(userId, date, meals);
        localCache.setForDate(userId, 'nutrition_logs', date, meals);
        return meals;
      },
      maxRetries: 1,
      priority: 1, // Low priority for preloading
    });
  });
};

// Preload a ±3-day window around the active date. Covers both forward and
// backward scrubbing which is the dominant nav pattern on diary apps, and
// keeps the localStorage footprint small (7 days × per-date rows).
export const preloadAdjacentDates = (userId: string, currentDate: string) => {
  const anchor = new Date(currentDate);
  const offsets = [-3, -2, -1, 1, 2, 3];
  const dates = offsets.map((d) => {
    const day = new Date(anchor);
    day.setDate(anchor.getDate() + d);
    return day.toISOString().split('T')[0];
  });
  preloadNutritionData(userId, dates);
};

