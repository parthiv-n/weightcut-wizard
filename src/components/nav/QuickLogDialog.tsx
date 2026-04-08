import { Utensils, Weight, Dumbbell } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";

interface QuickLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogFood: () => void;
  onLogWeight: () => void;
  onLogTraining: () => void;
}

export function QuickLogDialog({ open, onOpenChange, onLogFood, onLogWeight, onLogTraining }: QuickLogDialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] [&>button]:hidden">
        <div className="flex justify-center pt-1 pb-3">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/25" aria-hidden />
        </div>
        <SheetHeader className="px-1 pb-3">
          <SheetTitle className="text-base font-semibold">Quick Log</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-3 gap-3 px-1">
          <button
            onClick={() => { triggerHaptic(ImpactStyle.Light); onLogFood(); }}
            className="flex flex-col items-center gap-2 py-4 rounded-xl bg-muted/50 active:scale-95 transition-transform duration-100"
          >
            <div className="h-12 w-12 rounded-full bg-health/15 flex items-center justify-center">
              <Utensils className="h-6 w-6 text-health" />
            </div>
            <span className="text-sm font-medium">Food</span>
          </button>
          <button
            onClick={() => { triggerHaptic(ImpactStyle.Light); onLogWeight(); }}
            className="flex flex-col items-center gap-2 py-4 rounded-xl bg-muted/50 active:scale-95 transition-transform duration-100"
          >
            <div className="h-12 w-12 rounded-full bg-hydration/15 flex items-center justify-center">
              <Weight className="h-6 w-6 text-hydration" />
            </div>
            <span className="text-sm font-medium">Weight</span>
          </button>
          <button
            onClick={() => { triggerHaptic(ImpactStyle.Light); onLogTraining(); }}
            className="flex flex-col items-center gap-2 py-4 rounded-xl bg-muted/50 active:scale-95 transition-transform duration-100"
          >
            <div className="h-12 w-12 rounded-full bg-energy/15 flex items-center justify-center">
              <Dumbbell className="h-6 w-6 text-energy" />
            </div>
            <span className="text-sm font-medium">Training</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
