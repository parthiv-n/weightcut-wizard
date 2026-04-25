// Utility for batching database operations to improve performance
import { supabase } from "@/integrations/supabase/client";
import { PROFILE_COLUMNS } from "@/lib/queryColumns";

interface BatchOperation {
  id: string;
  operation: () => PromiseLike<any>;
  priority?: number; // Higher number = higher priority
}

interface BatchResult<T = any> {
  id: string;
  success: boolean;
  data?: T;
  error?: any;
}

class DatabaseBatcher {
  private pendingOperations: BatchOperation[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 50; // 50ms delay before executing batch
  private readonly MAX_BATCH_SIZE = 10; // Maximum operations per batch

  // Add operation to batch
  addOperation<T>(operation: BatchOperation): Promise<BatchResult<T>> {
    return new Promise((resolve) => {
      // Add resolve callback to operation
      const wrappedOperation = {
        ...operation,
        resolve,
      };

      this.pendingOperations.push(wrappedOperation as any);

      // Sort by priority (higher priority first)
      this.pendingOperations.sort((a, b) => (b.priority || 0) - (a.priority || 0));

      // Schedule batch execution
      this.scheduleBatch();

      // Execute immediately if batch is full
      if (this.pendingOperations.length >= this.MAX_BATCH_SIZE) {
        this.executeBatch();
      }
    });
  }

  // Schedule batch execution with debouncing
  private scheduleBatch() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      this.executeBatch();
    }, this.BATCH_DELAY);
  }

  // Execute all pending operations
  private async executeBatch() {
    if (this.pendingOperations.length === 0) return;

    const operations = [...this.pendingOperations];
    this.pendingOperations = [];

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    // Execute all operations in parallel
    const results = await Promise.allSettled(
      operations.map(async (op: any) => {
        try {
          const data = await op.operation();
          return { id: op.id, success: true, data };
        } catch (error) {
          return { id: op.id, success: false, error };
        }
      })
    );

    // Resolve promises with results
    results.forEach((result, index) => {
      const operation = operations[index] as any;
      if (result.status === 'fulfilled') {
        operation.resolve(result.value);
      } else {
        operation.resolve({
          id: operation.id,
          success: false,
          error: result.reason,
        });
      }
    });
  }

  // Force immediate execution of pending operations
  flush(): Promise<void> {
    return new Promise((resolve) => {
      if (this.pendingOperations.length === 0) {
        resolve();
        return;
      }

      // Add a completion callback
      const originalLength = this.pendingOperations.length;
      let completed = 0;

      const checkCompletion = () => {
        completed++;
        if (completed >= originalLength) {
          resolve();
        }
      };

      // Wrap existing operations with completion tracking
      this.pendingOperations.forEach((op: any) => {
        const originalResolve = op.resolve;
        op.resolve = (result: any) => {
          originalResolve(result);
          checkCompletion();
        };
      });

      this.executeBatch();
    });
  }
}

// Global batcher instance
export const databaseBatcher = new DatabaseBatcher();

// Helper functions for common database operations

// Batch profile queries
export const batchProfileQuery = (userId: string, priority = 5) => {
  return databaseBatcher.addOperation({
    id: `profile-${userId}`,
    operation: () => supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle(),
    priority,
  });
};

// Batch nutrition queries — reads from the aggregated `meals_with_totals`
// view so each row is one meal with summed macros. Totals are mapped to the
// same flat fields legacy consumers expect (calories, protein_g, ...).
export const batchNutritionQuery = (userId: string, date: string, priority = 3) => {
  return databaseBatcher.addOperation({
    id: `nutrition-${userId}-${date}`,
    operation: () => supabase
      .from("meals_with_totals")
      .select("id, user_id, date, meal_name, meal_type, notes, is_ai_generated, total_calories, total_protein_g, total_carbs_g, total_fats_g, item_count, created_at")
      .eq("user_id", userId)
      .eq("date", date)
      .order("created_at", { ascending: true }),
    priority,
  });
};

/**
 * Create one `meals` row with N items via the atomic `create_meal_with_items`
 * RPC. Replaces the old bulk `nutrition_logs.insert` path — one meal header,
 * many items, single round trip.
 */
export const batchCreateMealWithItems = (
  args: {
    p_date: string;
    p_meal_type: string;
    p_meal_name: string;
    p_notes?: string | null;
    p_is_ai_generated?: boolean;
    p_items: unknown[];
  },
  priority = 3,
) => {
  return databaseBatcher.addOperation({
    id: `meal-write-${args.p_date}-${crypto.randomUUID()}`,
    operation: () => supabase.rpc("create_meal_with_items", args as any),
    priority,
  });
};

// Batch weight logs queries
export const batchWeightLogsQuery = (userId: string, limit = 30, priority = 2) => {
  return databaseBatcher.addOperation({
    id: `weight-logs-${userId}`,
    operation: () => supabase
      .from("weight_logs")
      .select("id, user_id, date, weight_kg, created_at")
      .eq("user_id", userId)
      .order("date", { ascending: true })
      .limit(limit),
    priority,
  });
};

// Batch hydration queries
export const batchHydrationQuery = (userId: string, date: string, priority = 1) => {
  return databaseBatcher.addOperation({
    id: `hydration-${userId}-${date}`,
    operation: () => supabase
      .from("hydration_logs")
      .select("amount_ml")
      .eq("user_id", userId)
      .eq("date", date),
    priority,
  });
};

// Utility for batching multiple related queries
export const batchDashboardQueries = async (userId: string, date: string) => {
  const [profileResult, weightResult, nutritionResult, hydrationResult] = await Promise.all([
    batchProfileQuery(userId, 5),
    batchWeightLogsQuery(userId, 30, 4),
    batchNutritionQuery(userId, date, 3),
    batchHydrationQuery(userId, date, 2),
  ]);

  return {
    profile: profileResult.success ? profileResult.data : null,
    weightLogs: weightResult.success ? weightResult.data : [],
    nutritionLogs: nutritionResult.success ? nutritionResult.data : [],
    hydrationLogs: hydrationResult.success ? hydrationResult.data : [],
    errors: [
      !profileResult.success && profileResult.error,
      !weightResult.success && weightResult.error,
      !nutritionResult.success && nutritionResult.error,
      !hydrationResult.success && hydrationResult.error,
    ].filter(Boolean),
  };
};

