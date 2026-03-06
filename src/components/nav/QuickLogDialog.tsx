import { Utensils, Weight, Dumbbell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface QuickLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogFood: () => void;
  onLogWeight: () => void;
  onLogTraining: () => void;
}

export function QuickLogDialog({ open, onOpenChange, onLogFood, onLogWeight, onLogTraining }: QuickLogDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Log</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-4">
          <Button
            onClick={onLogFood}
            size="lg"
            className="h-16 flex items-center justify-start gap-4 px-6"
            variant="outline"
          >
            <Utensils className="h-6 w-6 text-emerald-500" />
            <span className="text-lg font-semibold">Log Food</span>
          </Button>
          <Button
            onClick={onLogWeight}
            size="lg"
            className="h-16 flex items-center justify-start gap-4 px-6"
            variant="outline"
          >
            <Weight className="h-6 w-6 text-blue-500" />
            <span className="text-lg font-semibold">Log Weight</span>
          </Button>
          <Button
            onClick={onLogTraining}
            size="lg"
            className="h-16 flex items-center justify-start gap-4 px-6"
            variant="outline"
          >
            <Dumbbell className="h-6 w-6 text-orange-500" />
            <span className="text-lg font-semibold">Log Training</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
