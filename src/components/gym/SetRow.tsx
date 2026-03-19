import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Trash2, Flame } from "lucide-react";
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.snappy}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-xl ${set.is_warmup ? "opacity-60" : ""} ${hasPR ? "ring-1 ring-yellow-500/30 bg-yellow-500/5" : ""}`}
    >
      {/* Set number */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
        set.is_warmup ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
      }`}>
        {set.is_warmup ? "W" : index + 1}
      </div>

      {/* Weight */}
      <Input
        type="number"
        inputMode="decimal"
        placeholder={set.is_bodyweight ? "BW" : "kg"}
        value={weightStr}
        onChange={(e) => setWeightStr(e.target.value)}
        onBlur={handleWeightBlur}
        className="h-9 w-[72px] text-center text-sm tabular-nums"
        disabled={set.is_bodyweight}
      />

      {/* Reps */}
      <Input
        type="number"
        inputMode="numeric"
        placeholder="reps"
        value={repsStr}
        onChange={(e) => setRepsStr(e.target.value)}
        onBlur={handleRepsBlur}
        className="h-9 w-[60px] text-center text-sm tabular-nums"
      />

      {/* Warmup toggle */}
      <button
        onClick={() => onUpdate(set.id, { is_warmup: !set.is_warmup })}
        className={`shrink-0 p-1.5 rounded-lg transition-colors ${set.is_warmup ? "text-orange-400 bg-orange-500/15" : "text-muted-foreground hover:text-foreground"}`}
        aria-label="Toggle warmup"
      >
        <Flame className="h-4 w-4" />
      </button>

      {/* PR badge */}
      {hasPR && (
        <span className="shrink-0 text-[10px] font-bold text-yellow-500 animate-pulse">
          PR
        </span>
      )}

      {/* Delete */}
      <button
        onClick={() => onDelete(set.id)}
        className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
        aria-label="Delete set"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}
