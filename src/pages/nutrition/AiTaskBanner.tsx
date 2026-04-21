import { AICompactOverlay } from "@/components/AICompactOverlay";
import { MealPhotoScanOverlay } from "@/components/nutrition/MealPhotoScanOverlay";

interface AiTaskLike {
  id: string;
  steps: any[];
  startedAt: number;
  label: string;
}

interface AiTaskBannerProps {
  aiTask: AiTaskLike | null | undefined;
  photoAnalyzing: boolean;
  photoBase64: string | null;
  onCancel: () => void;
  onDismiss: (id: string) => void;
}

/**
 * Sticky overlay shown at the top of the Nutrition page while any
 * long-running AI task is active (meal analysis, ingredient lookup,
 * meal plan generation, diet analysis).
 */
export function AiTaskBanner({ aiTask, photoAnalyzing, photoBase64, onCancel, onDismiss }: AiTaskBannerProps) {
  if (!aiTask) return null;
  const handleCancel = () => { onCancel(); onDismiss(aiTask.id); };

  return (
    <div className="sticky top-0 z-50 px-5 sm:px-6 pt-2 pb-2 max-w-7xl mx-auto bg-background/95">
      {photoAnalyzing && photoBase64 ? (
        <MealPhotoScanOverlay
          isOpen
          isGenerating
          photoBase64={photoBase64}
          steps={aiTask.steps}
          startedAt={aiTask.startedAt}
          title={aiTask.label}
          onCancel={handleCancel}
        />
      ) : (
        <AICompactOverlay
          isOpen
          isGenerating
          steps={aiTask.steps}
          startedAt={aiTask.startedAt}
          title={aiTask.label}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
