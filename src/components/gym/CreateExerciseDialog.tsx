import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CATEGORIES, MUSCLE_GROUPS, EQUIPMENT_OPTIONS } from "@/data/exerciseDatabase";
import type { ExerciseCategory, MuscleGroup, Equipment, Exercise } from "@/pages/gym/types";

interface CreateExerciseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    category: ExerciseCategory;
    muscle_group: string;
    equipment: Equipment | null;
    is_bodyweight: boolean;
  }) => Promise<Exercise | null>;
}

export function CreateExerciseDialog({ open, onOpenChange, onSubmit }: CreateExerciseDialogProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ExerciseCategory>("push");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>("chest");
  const [equipment, setEquipment] = useState<Equipment | "none">("barbell");
  const [isBodyweight, setIsBodyweight] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    const result = await onSubmit({
      name: name.trim(),
      category,
      muscle_group: muscleGroup,
      equipment: equipment === "none" ? null : equipment,
      is_bodyweight: isBodyweight,
    });
    setSubmitting(false);
    if (result) {
      setName("");
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Create Custom Exercise</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pt-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Exercise Name</label>
            <Input
              placeholder="e.g. Zercher Squat"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Category</label>
              <Select value={category} onValueChange={(v) => setCategory(v as ExerciseCategory)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Muscle Group</label>
              <Select value={muscleGroup} onValueChange={(v) => setMuscleGroup(v as MuscleGroup)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MUSCLE_GROUPS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Equipment</label>
            <Select value={equipment} onValueChange={(v) => setEquipment(v as Equipment)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_OPTIONS.map(e => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Bodyweight Exercise</label>
            <Switch checked={isBodyweight} onCheckedChange={setIsBodyweight} />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
            className="w-full h-11"
          >
            {submitting ? "Creating..." : "Create Exercise"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
