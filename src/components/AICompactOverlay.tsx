import { memo, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { springs } from "@/lib/motion";
import { celebrateSuccess } from "@/lib/haptics";

export interface AIStep {
  icon: LucideIcon;
  label: string;
  color?: string;
}

interface AICompactOverlayProps {
  isOpen: boolean;
  isGenerating: boolean;
  steps: AIStep[];
  title?: string;
  subtitle?: string;
  onCompletion?: () => void;
  onCancel?: () => void;
  onMinimize?: () => void;
}

export const AICompactOverlay = memo(function AICompactOverlay({
  isOpen,
  isGenerating,
  steps,
  title = "Processing",
  onCompletion,
  onCancel,
  onMinimize,
}: AICompactOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showCancel, setShowCancel] = useState(false);
  const prevGenerating = useRef(isGenerating);

  // Advance steps every 1.2s while generating
  useEffect(() => {
    if (!isGenerating || steps.length === 0) return;
    setCurrentStep(0);
    setShowCancel(false);

    const stepTimer = setInterval(() => {
      setCurrentStep((s) => (s < steps.length - 1 ? s + 1 : s));
    }, 1200);

    const cancelTimer = setTimeout(() => setShowCancel(true), 3000);

    return () => {
      clearInterval(stepTimer);
      clearTimeout(cancelTimer);
    };
  }, [isGenerating, steps.length]);

  // Detect generating true -> false transition
  useEffect(() => {
    if (prevGenerating.current && !isGenerating) {
      celebrateSuccess();
      onCompletion?.();
    }
    prevGenerating.current = isGenerating;
  }, [isGenerating, onCompletion]);

  const ActiveIcon = steps[currentStep]?.icon;
  const activeColor = steps[currentStep]?.color;
  const activeLabel = steps[currentStep]?.label;

  return (
    <AnimatePresence>
      {isOpen && isGenerating && steps.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={springs.gentle}
          className="w-full"
        >
          <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl p-4">
            {/* Header row: icon + title + buttons */}
            <div className="flex items-center gap-3">
              {/* Animated icon */}
              <div
                className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0"
                style={activeColor ? { backgroundColor: `${activeColor}20` } : undefined}
              >
                {ActiveIcon && (
                  <motion.div
                    key={currentStep}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={springs.snappy}
                  >
                    <ActiveIcon
                      className={cn("w-5 h-5 animate-pulse", activeColor ? "" : "text-primary")}
                      style={activeColor ? { color: activeColor } : undefined}
                    />
                  </motion.div>
                )}
              </div>

              {/* Title */}
              <span className="text-sm font-semibold text-white truncate flex-1">
                {title}
              </span>

              {/* Action buttons */}
              <div className="flex items-center gap-1 shrink-0">
                {onMinimize && (
                  <button
                    onClick={onMinimize}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-white transition-colors rounded-lg"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Minimize</span>
                  </button>
                )}
                <AnimatePresence>
                  {showCancel && onCancel && (
                    <motion.button
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={springs.snappy}
                      onClick={onCancel}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-red-500/20 hover:text-red-400 border border-zinc-700/50 rounded-xl transition-colors touch-manipulation"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Progress dots */}
            <div className="flex items-center gap-1.5 mt-3 ml-[52px]">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors duration-300",
                    i < currentStep
                      ? "bg-primary"
                      : i === currentStep
                        ? "bg-primary animate-pulse"
                        : "bg-zinc-700"
                  )}
                />
              ))}
            </div>

            {/* Current step label */}
            {activeLabel && (
              <motion.p
                key={currentStep}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={springs.snappy}
                className="text-xs text-zinc-400 mt-2 ml-[52px] truncate"
              >
                {activeLabel}
              </motion.p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
