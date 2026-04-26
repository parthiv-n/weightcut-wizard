import { useState } from "react";
import { Utensils, Weight, Dumbbell, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { triggerHaptic, celebrateSuccess } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";

interface QuickLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogFood: () => void;
  onLogWeight: () => void;
  onLogTraining: () => void;
  onLogGym: () => void;
}

export function QuickLogDialog({ open, onOpenChange, onLogFood, onLogWeight, onLogTraining, onLogGym }: QuickLogDialogProps) {
  const { userId, refreshProfile } = useUser();
  const { toast } = useToast();
  const [quickWeight, setQuickWeight] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [unit, setUnit] = useState<"kg" | "lb">(
    () => (localStorage.getItem("wcw_weight_unit") as "kg" | "lb") || "kg"
  );

  const handleQuickWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    const raw = parseFloat(quickWeight);
    if (isNaN(raw) || raw <= 0) {
      toast({ title: "Enter a valid weight", variant: "destructive" });
      return;
    }
    const weight_kg = unit === "lb" ? raw / 2.20462 : raw;
    const today = new Date().toISOString().split("T")[0];
    setSavingWeight(true);
    try {
      const { error } = await supabase
        .from("weight_logs")
        .upsert({ user_id: userId, weight_kg, date: today }, { onConflict: "user_id,date" });
      if (error) throw error;
      await supabase.from("profiles").update({ current_weight_kg: weight_kg }).eq("id", userId);
      celebrateSuccess();
      refreshProfile?.();
      toast({ title: "Weight logged", description: `${raw.toFixed(1)} ${unit}` });
      setQuickWeight("");
      onOpenChange(false);
    } catch (err) {
      logger.error("QuickLog weight save failed", err);
      toast({ title: "Failed to log weight", variant: "destructive" });
    } finally {
      setSavingWeight(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+5rem)] [&>button]:hidden">
        <div className="flex justify-center pt-1 pb-3">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/25" aria-hidden />
        </div>
        <SheetHeader className="px-1 pb-3">
          <SheetTitle className="text-base font-semibold">Quick Log</SheetTitle>
        </SheetHeader>

        {/* Inline weight entry — saves without leaving sheet */}
        <form onSubmit={handleQuickWeight} className="px-1 mb-3">
          <div className="rounded-2xl bg-muted/30 p-3 flex items-center gap-2">
            <Weight className="h-4 w-4 text-hydration shrink-0" />
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="Weigh-in"
              value={quickWeight}
              onChange={(e) => setQuickWeight(e.target.value)}
              className="flex-1 h-9 text-[14px] tabular-nums bg-background/50 border-border/30"
            />
            <div className="flex gap-0.5 bg-background/40 rounded-full p-0.5">
              <button
                type="button"
                onClick={() => { setUnit("kg"); triggerHaptic(ImpactStyle.Light); }}
                className={`px-2 py-1 text-[12px] rounded-full font-medium transition-colors ${unit === "kg" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >kg</button>
              <button
                type="button"
                onClick={() => { setUnit("lb"); triggerHaptic(ImpactStyle.Light); }}
                className={`px-2 py-1 text-[12px] rounded-full font-medium transition-colors ${unit === "lb" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >lb</button>
            </div>
            <button
              type="submit"
              disabled={savingWeight || !quickWeight}
              className="h-9 px-3 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold active:scale-95 transition-transform disabled:opacity-40"
            >
              {savingWeight ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </button>
          </div>
        </form>
        <div className="grid grid-cols-4 gap-3 px-1">
          <button
            onClick={() => { triggerHaptic(ImpactStyle.Light); onLogFood(); }}
            className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-muted/50 active:scale-95 transition-transform duration-100"
          >
            <div className="h-12 w-12 rounded-full bg-health/15 flex items-center justify-center">
              <Utensils className="h-6 w-6 text-health" />
            </div>
            <span className="text-sm font-medium">Food</span>
          </button>
          <button
            onClick={() => { triggerHaptic(ImpactStyle.Light); onLogWeight(); }}
            className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-muted/50 active:scale-95 transition-transform duration-100"
          >
            <div className="h-12 w-12 rounded-full bg-hydration/15 flex items-center justify-center">
              <Weight className="h-6 w-6 text-hydration" />
            </div>
            <span className="text-sm font-medium">Weight</span>
          </button>
          <button
            onClick={() => { triggerHaptic(ImpactStyle.Light); onLogTraining(); }}
            className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-muted/50 active:scale-95 transition-transform duration-100"
          >
            <div className="h-12 w-12 rounded-full bg-energy/15 flex items-center justify-center">
              <Dumbbell className="h-6 w-6 text-energy" />
            </div>
            <span className="text-sm font-medium">Training</span>
          </button>
          <button
            onClick={() => { triggerHaptic(ImpactStyle.Light); onLogGym(); }}
            className="flex flex-col items-center gap-2 py-4 rounded-2xl bg-muted/50 active:scale-95 transition-transform duration-100"
          >
            <div className="h-12 w-12 rounded-full bg-primary/15 flex items-center justify-center">
              <Dumbbell className="h-6 w-6 text-primary" />
            </div>
            <span className="text-sm font-medium">Gym</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
