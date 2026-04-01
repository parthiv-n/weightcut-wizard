import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Trash2, Flame, Trophy } from "lucide-react";
import { motion } from "motion/react";
import { springs } from "@/lib/motion";
import type { GymSet, PRType } from "@/pages/gym/types";

interface SetRowProps {
  set: GymSet;
  index: number;
  prTypes?: PRType[];
  onUpdate: (setId: string, updates: Partial<{ weight_kg: number | null; reps: number; rpe: number | null; is_warmup: boolean }>) => void;
  onDelete: (setId: string) => void;
}

export function SetRow({ set, index, prTypes, onUpdate, onDelete }: SetRowProps) {
  const [weightStr, setWeightStr] = useState(set.weight_kg?.toString() ?? "");
  const [repsStr, setRepsStr] = useState(set.reps.toString());
  const handleWeightBlur = useCallback(() => {
    const val = weightStr === "" ? null : parseFloat(weightStr);
    if (val !== set.weight_kg) {
      onUpdate(set.id, { weight_kg: val && !isNaN(val) ? val : null });
    }
  }, [weightStr, set.id, set.weight_kg, onUpdate]);

  const handleRepsBlur = useCallback(() => {
    const val = parseInt(repsStr, 10);
    if (!isNaN(val) && val > 0 && val !== set.reps) {
      onUpdate(set.id, { reps: val });
    }
  }, [repsStr, set.id, set.reps, onUpdate]);

  const hasPR = prTypes && prTypes.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.snappy}
      className={`group flex items-center gap-2 px-3 py-2.5 transition-colors ${
        set.is_warmup ? "opacity-50" : ""
      } ${hasPR ? "bg-yellow-500/5" : ""}`}
    >
      {/* Set number badge */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        set.is_warmup
          ? "bg-muted text-muted-foreground"
          : hasPR
            ? "bg-gradient-to-br from-yellow-500/25 to-yellow-600/15 text-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.15)]"
            : "bg-gradient-to-br from-primary/20 to-primary/10 text-primary"
      }`}>
        {set.is_warmup ? "W" : index + 1}
      </div>

      {/* Weight input */}
      <Input
        type="number"
        inputMode="decimal"
        placeholder={set.is_bodyweight ? "BW" : "kg"}
        value={weightStr}
        onChange={(e) => setWeightStr(e.target.value)}
        onBlur={handleWeightBlur}
        className="h-10 flex-1 text-center text-sm font-medium tabular-nums bg-background/50 border-border/40 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40"
        disabled={set.is_bodyweight}
      />

      {/* Reps input */}
      <Input
        type="number"
        inputMode="numeric"
        placeholder="reps"
        value={repsStr}
        onChange={(e) => setRepsStr(e.target.value)}
        onBlur={handleRepsBlur}
        className="h-10 flex-1 text-center text-sm font-medium tabular-nums bg-background/50 border-border/40 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40"
      />

      {/* Warmup toggle */}
      <button
        onClick={() => onUpdate(set.id, { is_warmup: !set.is_warmup })}
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
          set.is_warmup
            ? "text-orange-400 bg-orange-500/15 shadow-[0_0_8px_rgba(249,115,22,0.15)]"
            : "text-muted-foreground/40 hover:text-orange-400 hover:bg-orange-500/10"
        }`}
        aria-label="Toggle warmup"
      >
        <Flame className="h-3.5 w-3.5" />
      </button>

      {/* PR badge */}
      {hasPR && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={springs.bouncy}
          className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-500 shadow-[0_0_12px_rgba(234,179,8,0.2)]"
        >
          <Trophy className="h-3 w-3" />
          <span className="text-[9px] font-bold">PR</span>
        </motion.span>
      )}

      {/* Delete button */}
      <button
        onClick={() => onDelete(set.id)}
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all md:opacity-100"
        aria-label="Delete set"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}
