// Utility for handling optimistic UI updates with rollback capability
export interface OptimisticUpdate<T> {
  id: string;
  optimisticData: T;
  rollbackData: T;
  operation: () => Promise<void>;
  onSuccess?: (data: T) => void;
  onError?: (error: any, rollbackData: T) => void;
}

class OptimisticUpdateManager {
  private pendingUpdates = new Map<string, OptimisticUpdate<any>>();

  async executeOptimisticUpdate<T>(update: OptimisticUpdate<T>): Promise<boolean> {
    const { id, optimisticData, rollbackData, operation, onSuccess, onError } = update;
    
    // Store the update for potential rollback
    this.pendingUpdates.set(id, update);
    
    try {
      // Execute the background operation
      await operation();
      
      // Success - remove from pending and call success callback
      this.pendingUpdates.delete(id);
      onSuccess?.(optimisticData);
      return true;
    } catch (error) {
      // Failure - rollback and call error callback
      this.pendingUpdates.delete(id);
      onError?.(error, rollbackData);
      return false;
    }
  }

  // Get pending update by id
  getPendingUpdate(id: string) {
    return this.pendingUpdates.get(id);
  }

  // Check if an update is pending
  isPending(id: string): boolean {
    return this.pendingUpdates.has(id);
  }

  // Cancel a pending update (for cleanup)
  cancelUpdate(id: string) {
    this.pendingUpdates.delete(id);
  }
}

export const optimisticUpdateManager = new OptimisticUpdateManager();

// Helper function for nutrition target updates
export const createNutritionTargetUpdate = (
  userId: string,
  optimisticTargets: any,
  originalTargets: any,
  updateOperation: () => Promise<void>
): OptimisticUpdate<any> => ({
  id: `nutrition-targets-${userId}`,
  optimisticData: optimisticTargets,
  rollbackData: originalTargets,
  operation: updateOperation,
});

// Helper function for meal logging updates
export const createMealLogUpdate = (
  mealId: string,
  optimisticMeal: any,
  updateOperation: () => Promise<void>
): OptimisticUpdate<any> => ({
  id: `meal-log-${mealId}`,
  optimisticData: optimisticMeal,
  rollbackData: null, // New meals don't have rollback data
  operation: updateOperation,
});

