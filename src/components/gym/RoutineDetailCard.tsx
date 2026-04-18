import { useState, useRef, useEffect, useMemo } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronDown, Play, Trash2, Pencil, Check, X,
} from "lucide-react";
import type { SavedRoutine, RoutineExercise } from "@/pages/gym/types";

interface RoutineDetailCardProps {
  routine: SavedRoutine;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onStartWorkout: (routine: SavedRoutine, dayFilter?: string) => void;
}

const GOAL_BADGE: Record<string, string> = {
  hypertrophy: "bg-blue-500/15 text-blue-400",
  strength: "bg-red-500/15 text-red-400",
  explosiveness: "bg-amber-500/15 text-amber-400",
  conditioning: "bg-green-500/15 text-green-400",
};

const MUSCLE_COLORS: Record<string, string> = {
  chest: "bg-blue-500/15 text-blue-400",
  back: "bg-purple-500/15 text-purple-400",
  shoulders: "bg-orange-500/15 text-orange-400",
  biceps: "bg-cyan-500/15 text-cyan-400",
  triceps: "bg-pink-500/15 text-pink-400",
  quads: "bg-green-500/15 text-green-400",
  hamstrings: "bg-emerald-500/15 text-emerald-400",
  glutes: "bg-rose-500/15 text-rose-400",
  calves: "bg-teal-500/15 text-teal-400",
  abs: "bg-yellow-500/15 text-yellow-400",
  core: "bg-yellow-500/15 text-yellow-400",
  full_body: "bg-indigo-500/15 text-indigo-400",
  cardio: "bg-red-500/15 text-red-400",
};

const DAY_COLORS = [
  "border-l-blue-500",
  "border-l-purple-500",
  "border-l-emerald-500",
  "border-l-amber-500",
  "border-l-rose-500",
  "border-l-cyan-500",
];

function GroupedExerciseList({ exercises }: { exercises: RoutineExercise[] }) {
  const hasDays = exercises.some(e => e.day);

  const groups = useMemo(() => {
    if (!hasDays) return [{ day: "", exercises }];
    const result: { day: string; exercises: RoutineExercise[] }[] = [];
    for (const ex of exercises) {
      const label = ex.day || "Exercises";
      const existing = result.find(g => g.day === label);
      if (existing) existing.exercises.push(ex);
      else result.push({ day: label, exercises: [ex] });
    }
    return result;
  }, [exercises, hasDays]);

  if (!hasDays) {
    // Flat list for old routines
    return (
      <div className="px-4 pb-2 space-y-1">
        {exercises.map((ex, i) => (
          <div key={i} className="flex items-center gap-3 py-2 border-t border-border/20 first:border-t-0">
            <span className="text-[10px] text-muted-foreground/50 w-4 text-right tabular-nums shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium truncate block">{ex.name}</span>
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{ex.sets}&times;{ex.reps}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${MUSCLE_COLORS[ex.muscle_group] || "bg-muted/50 text-muted-foreground"}`}>
              {ex.muscle_group.replace("_", " ")}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="px-3 pb-2 space-y-2.5 pt-1">
      {groups.map((group, gi) => (
        <div key={group.day || gi} className={`rounded-xl border border-border/30 overflow-hidden border-l-[3px] ${DAY_COLORS[gi % DAY_COLORS.length]}`}>
          <div className="px-3 py-2 bg-muted/15 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/80">{group.day}</span>
            <span className="text-[10px] text-muted-foreground">{group.exercises.length} exercises</span>
          </div>
          <div className="divide-y divide-border/15">
            {group.exercises.map((ex, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <span className="text-[10px] text-muted-foreground/50 w-4 text-right tabular-nums shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium truncate block">{ex.name}</span>
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{ex.sets}&times;{ex.reps}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${MUSCLE_COLORS[ex.muscle_group] || "bg-muted/50 text-muted-foreground"}`}>
                  {ex.muscle_group.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RoutineDetailCard({ routine, onDelete, onRename, onStartWorkout }: RoutineDetailCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(routine.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== routine.name) {
      onRename(routine.id, trimmed);
    } else {
      setEditName(routine.name);
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(routine.name);
    setEditing(false);
  };

  const formattedDate = new Date(routine.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="card-surface rounded-2xl border border-border/50 overflow-hidden relative">
        {/* Subtle gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.02] to-transparent pointer-events-none" />

        <div className="relative">
          {/* Header */}
          <CollapsibleTrigger asChild>
            <button className="w-full p-4 text-left active:scale-[0.98] transition-transform">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Input
                        ref={inputRef}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename();
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        className="h-7 text-sm font-semibold bg-muted/30 border-border/30 rounded-lg px-2"
                      />
                      <button onClick={handleRename} className="p-1 rounded hover:bg-muted/40">
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      </button>
                      <button onClick={handleCancelEdit} className="p-1 rounded hover:bg-muted/40">
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{routine.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                        className="p-1 rounded hover:bg-muted/40 shrink-0 opacity-40 hover:opacity-100 transition-opacity"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${GOAL_BADGE[routine.goal] || "bg-muted/50 text-muted-foreground"}`}>
                      {routine.goal}
                    </span>
                    {routine.is_ai_generated && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-semibold">
                        AI
                      </span>
                    )}
                    {routine.sport && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/20 capitalize">
                        {routine.sport.replace("_", " ")}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground/60">
                      {routine.exercises.length} exercises
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">
                      {formattedDate}
                    </span>
                  </div>
                </div>

                <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
              </div>
            </button>
          </CollapsibleTrigger>

          {/* Exercises list — grouped by day if available */}
          <CollapsibleContent>
            <GroupedExerciseList exercises={routine.exercises} />

            {/* Footer actions */}
            <div className="px-4 pb-4 pt-2 border-t border-border/20 space-y-2">
              {(() => {
                const hasDays = routine.exercises.some(e => e.day);
                if (!hasDays) {
                  return (
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => onStartWorkout(routine)}
                        className="flex-1 h-10 rounded-xl text-xs font-semibold bg-gradient-to-r from-primary to-primary/80"
                        size="sm"
                      >
                        <Play className="h-3.5 w-3.5 mr-1.5" />
                        Start Workout
                      </Button>
                      <button
                        onClick={() => onDelete(routine.id)}
                        className="h-10 w-10 rounded-xl flex items-center justify-center border border-border/50 hover:bg-destructive/10 hover:border-destructive/30 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                      </button>
                    </div>
                  );
                }
                // Multi-day routine: show per-day Start buttons
                const dayGroups: string[] = [];
                for (const ex of routine.exercises) {
                  const d = ex.day || "Exercises";
                  if (!dayGroups.includes(d)) dayGroups.push(d);
                }
                return (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {dayGroups.map((day) => (
                        <Button
                          key={day}
                          onClick={() => onStartWorkout(routine, day)}
                          variant="outline"
                          className="h-9 rounded-xl text-[11px] font-semibold gap-1.5"
                          size="sm"
                        >
                          <Play className="h-3 w-3" />
                          {day.replace(/^Day\s*\d+:\s*/i, "")}
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => onStartWorkout(routine)}
                        className="flex-1 h-10 rounded-xl text-xs font-semibold bg-gradient-to-r from-primary to-primary/80"
                        size="sm"
                      >
                        <Play className="h-3.5 w-3.5 mr-1.5" />
                        Start Full Routine
                      </Button>
                      <button
                        onClick={() => onDelete(routine.id)}
                        className="h-10 w-10 rounded-xl flex items-center justify-center border border-border/50 hover:bg-destructive/10 hover:border-destructive/30 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </CollapsibleContent>
        </div>
      </div>
    </Collapsible>
  );
}
