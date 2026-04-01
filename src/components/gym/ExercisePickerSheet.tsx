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
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="pb-2">
          <SheetTitle className="text-lg font-bold tracking-tight">Add Exercise</SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11 bg-muted/30 border-border/30 focus-visible:ring-2 focus-visible:ring-primary/30"
            autoFocus
          />
        </div>

        {/* Category chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-none">
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setCategoryFilter(categoryFilter === cat.value ? null : cat.value as ExerciseCategory)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                categoryFilter === cat.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Equipment chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
          {EQUIPMENT_OPTIONS.map(eq => (
            <button
              key={eq.value}
              onClick={() => setEquipmentFilter(equipmentFilter === eq.value ? null : eq.value as Equipment)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                equipmentFilter === eq.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {eq.label}
            </button>
          ))}
        </div>

        {/* Exercise list */}
        <div className="overflow-y-auto flex-1 -mx-1 px-1" style={{ maxHeight: "calc(85vh - 260px)" }}>
          <motion.div variants={staggerContainer(30)} initial="hidden" animate="visible" className="space-y-4">
            {Array.from(grouped.entries()).map(([muscle, exs]) => (
              <motion.div key={muscle} variants={staggerItem}>
                <h4 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-widest mb-1.5 px-1">
                  {muscle.replace("_", " ")}
                </h4>
                <div className="space-y-0.5">
                  {exs.map(ex => (
                    <button
                      key={ex.id}
                      onClick={() => handleSelect(ex)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted/30 active:bg-muted/50 active:scale-[0.98] transition-all text-left touch-target"
                    >
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Dumbbell className="h-4 w-4 text-primary/70" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{ex.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {ex.equipment || "bodyweight"}{ex.is_custom ? " · Custom" : ""}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            ))}

            {loading && filtered.length === 0 && (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading exercises...
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="text-center py-12">
                <div className="h-10 w-10 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                  <Search className="h-5 w-5 text-muted-foreground/30" />
                </div>
                <p className="text-sm text-muted-foreground">No exercises found</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Create custom */}
        <div className="pt-3 border-t border-border/30 mt-3">
          <button
            onClick={() => { onCreateCustom(); onOpenChange(false); }}
            className="w-full h-12 rounded-xl border-2 border-dashed border-border/50 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98] transition-all"
          >
            <Plus className="h-4 w-4" />
            Create Custom Exercise
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
