import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Search, Plus, Dumbbell, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { CATEGORIES, EQUIPMENT_OPTIONS } from "@/data/exerciseDatabase";
import type { Exercise, ExerciseCategory, Equipment } from "@/pages/gym/types";

interface ExercisePickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: Exercise[];
  loading?: boolean;
  onSelect: (exercise: Exercise) => void;
  onCreateCustom: () => void;
}

export function ExercisePickerSheet({ open, onOpenChange, exercises, loading, onSelect, onCreateCustom }: ExercisePickerSheetProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ExerciseCategory | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState<Equipment | null>(null);

  const filtered = exercises.filter(ex => {
    if (search) {
      const q = search.toLowerCase();
      if (!ex.name.toLowerCase().includes(q) &&
          !ex.muscle_group.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (categoryFilter && ex.category !== categoryFilter) return false;
    if (equipmentFilter && ex.equipment !== equipmentFilter) return false;
    return true;
  });

  // Group by muscle
  const grouped = new Map<string, Exercise[]>();
  for (const ex of filtered) {
    const key = ex.muscle_group;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(ex);
  }

  const handleSelect = (exercise: Exercise) => {
    onSelect(exercise);
    onOpenChange(false);
    setSearch("");
    setCategoryFilter(null);
    setEquipmentFilter(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-xl border-0 bg-card/95 backdrop-blur-xl p-0">
        <div className="px-3 pt-3 pb-1.5">
          <SheetHeader>
            <SheetTitle className="text-[13px] font-semibold text-center">Add Exercise</SheetTitle>
          </SheetHeader>
        </div>

        <div className="px-3">
          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search exercises..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-7 text-[11px] rounded-md bg-muted/20 border-border/30"
              autoFocus
            />
          </div>

          {/* Category chips */}
          <div className="flex gap-1 overflow-x-auto pb-1.5 mb-1 scrollbar-none">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setCategoryFilter(categoryFilter === cat.value ? null : cat.value as ExerciseCategory)}
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                  categoryFilter === cat.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground active:bg-muted/60"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Equipment chips */}
          <div className="flex gap-1 overflow-x-auto pb-1.5 mb-1.5 scrollbar-none">
            {EQUIPMENT_OPTIONS.map(eq => (
              <button
                key={eq.value}
                onClick={() => setEquipmentFilter(equipmentFilter === eq.value ? null : eq.value as Equipment)}
                className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                  equipmentFilter === eq.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/30 text-muted-foreground active:bg-muted/50"
                }`}
              >
                {eq.label}
              </button>
            ))}
          </div>
        </div>

        {/* Exercise list */}
        <div className="overflow-y-auto flex-1 px-3" style={{ maxHeight: "calc(85vh - 200px)" }}>
          <motion.div variants={staggerContainer(30)} initial="hidden" animate="visible" className="space-y-2">
            {Array.from(grouped.entries()).map(([muscle, exs]) => (
              <motion.div key={muscle} variants={staggerItem}>
                <h4 className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-widest mb-0.5 px-0.5">
                  {muscle.replace("_", " ")}
                </h4>
                <div className="divide-y divide-border/20">
                  {exs.map(ex => (
                    <button
                      key={ex.id}
                      onClick={() => handleSelect(ex)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 active:bg-muted/50 transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium truncate">{ex.name}</div>
                        <div className="text-[9px] text-muted-foreground">
                          {ex.equipment || "bodyweight"}{ex.is_custom ? " · Custom" : ""}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            ))}

            {loading && filtered.length === 0 && (
              <div className="flex items-center justify-center py-6 gap-1.5 text-muted-foreground text-[11px]">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="text-center py-6">
                <p className="text-[11px] text-muted-foreground">No exercises found</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Create custom */}
        <div className="px-3 border-t border-border/30 mt-1">
          <button
            onClick={() => { onCreateCustom(); onOpenChange(false); }}
            className="w-full py-2 text-[12px] font-semibold text-primary active:bg-muted/50 transition-colors flex items-center justify-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Create Custom Exercise
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
