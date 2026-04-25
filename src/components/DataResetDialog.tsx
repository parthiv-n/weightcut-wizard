import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, AlertTriangle, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { logger } from "@/lib/logger";

interface DataResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DataResetDialog({ open, onOpenChange }: DataResetDialogProps) {
  const [exporting, setExporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const exportAllData = async () => {
    setExporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [
        { data: profile },
        { data: weightLogs },
        { data: nutritionLogs },
        { data: hydrationLogs },
        { data: fightCamps },
        { data: fightWeekPlans },
        { data: fightWeekLogs }
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("age, sex, height_cm, current_weight_kg, goal_weight_kg, activity_level, bmr, tdee, target_date")
          .eq("id", user.id)
          .single(),
        supabase
          .from("weight_logs")
          .select("date, weight_kg")
          .eq("user_id", user.id)
          .order("date", { ascending: true })
          .limit(10000),
        supabase
          .from("nutrition_logs")
          .select("date, meal_name, meal_type, calories, protein_g, carbs_g, fats_g, portion_size")
          .eq("user_id", user.id)
          .order("date", { ascending: true })
          .limit(20000),
        supabase
          .from("hydration_logs")
          .select("date, amount_ml, training_weight_pre, training_weight_post, sweat_loss_percent, sodium_mg, notes")
          .eq("user_id", user.id)
          .order("date", { ascending: true })
          .limit(10000),
        supabase
          .from("fight_camps")
          .select("name, event_name, fight_date, starting_weight_kg, end_weight_kg, total_weight_cut, weight_via_dehydration, weight_via_carb_reduction, weigh_in_timing, is_completed, rehydration_notes, performance_feeling")
          .eq("user_id", user.id)
          .order("fight_date", { ascending: true })
          .limit(1000),
        supabase
          .from("fight_week_plans")
          .select("id")
          .eq("user_id", user.id)
          .limit(1000),
        supabase
          .from("fight_week_logs")
          .select("log_date, weight_kg, carbs_g, fluid_intake_ml, sweat_session_min, notes")
          .eq("user_id", user.id)
          .order("log_date", { ascending: true })
          .limit(5000)
      ]);

      // CSV helper: escape cells containing commas, quotes, or newlines
      const escapeCell = (val: string) => {
        if (val.includes(",") || val.includes('"') || val.includes("\n")) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      };
      const rowToCSV = (row: string[]) => row.map(escapeCell).join(",");

      const sections: string[][] = [];
      const blankRow = [""];

      // Profile Summary
      if (profile) {
        sections.push(
          ["Profile Summary"],
          blankRow,
          ["Field", "Value"],
          ["Age", String(profile.age)],
          ["Sex", String(profile.sex)],
          ["Height (cm)", String(profile.height_cm)],
          ["Current Weight (kg)", String(profile.current_weight_kg)],
          ["Goal Weight (kg)", String(profile.goal_weight_kg)],
          ["Activity Level", String(profile.activity_level)],
          ["BMR", String(profile.bmr || "N/A")],
          ["TDEE", String(profile.tdee || "N/A")],
          ["Target Date", String(profile.target_date)],
          blankRow, blankRow
        );
      }

      // Weight Logs Timeline
      if (weightLogs && weightLogs.length > 0) {
        sections.push(
          ["Weight Tracking Timeline"],
          blankRow,
          ["Date", "Weight (kg)", "Days in Timeline"]
        );
        weightLogs.forEach((log, idx) => {
          sections.push([
            format(new Date(log.date), "yyyy-MM-dd"),
            String(log.weight_kg),
            String(idx + 1)
          ]);
        });
        sections.push(blankRow, blankRow);
      }

      // Fight Camps Summary
      if (fightCamps && fightCamps.length > 0) {
        sections.push(
          ["Fight Camps Summary"],
          blankRow,
          ["Camp Name", "Event", "Fight Date", "Starting Weight", "End Weight", "Total Cut", "Via Dehydration", "Via Carb Reduction", "Weigh-In Timing", "Completed"]
        );
        fightCamps.forEach(camp => {
          sections.push([
            camp.name,
            camp.event_name || "N/A",
            format(new Date(camp.fight_date), "yyyy-MM-dd"),
            camp.starting_weight_kg ? String(camp.starting_weight_kg) : "N/A",
            camp.end_weight_kg ? String(camp.end_weight_kg) : "N/A",
            camp.total_weight_cut ? String(camp.total_weight_cut) : "N/A",
            camp.weight_via_dehydration ? String(camp.weight_via_dehydration) : "N/A",
            camp.weight_via_carb_reduction ? String(camp.weight_via_carb_reduction) : "N/A",
            camp.weigh_in_timing === "day_before" ? "Day Before" : camp.weigh_in_timing === "day_of" ? "Day Of" : "N/A",
            camp.is_completed ? "Yes" : "No"
          ]);
        });

        // Camp details (rehydration & performance notes)
        sections.push(blankRow, ["Camp Details"], blankRow);
        fightCamps.forEach(camp => {
          if (camp.rehydration_notes || camp.performance_feeling) {
            sections.push(
              [`${camp.name} - Rehydration Notes`],
              [camp.rehydration_notes || "No notes"],
              blankRow,
              [`${camp.name} - Performance Feeling`],
              [camp.performance_feeling || "No notes"],
              blankRow
            );
          }
        });
        sections.push(blankRow);
      }

      // Fight Week Logs
      if (fightWeekLogs && fightWeekLogs.length > 0) {
        sections.push(
          ["Fight Week Timeline"],
          blankRow,
          ["Date", "Weight (kg)", "Carbs (g)", "Fluid Intake (ml)", "Sweat Session (min)", "Notes"]
        );
        fightWeekLogs.forEach(log => {
          sections.push([
            format(new Date(log.log_date), "yyyy-MM-dd"),
            log.weight_kg ? String(log.weight_kg) : "N/A",
            log.carbs_g ? String(log.carbs_g) : "N/A",
            log.fluid_intake_ml ? String(log.fluid_intake_ml) : "N/A",
            log.sweat_session_min ? String(log.sweat_session_min) : "N/A",
            log.notes || ""
          ]);
        });
        sections.push(blankRow, blankRow);
      }

      // Nutrition Logs
      if (nutritionLogs && nutritionLogs.length > 0) {
        sections.push(
          ["Nutrition Timeline"],
          blankRow,
          ["Date", "Meal Name", "Meal Type", "Calories", "Protein (g)", "Carbs (g)", "Fats (g)", "Portion Size"]
        );
        nutritionLogs.forEach(log => {
          sections.push([
            format(new Date(log.date), "yyyy-MM-dd"),
            log.meal_name,
            log.meal_type || "N/A",
            String(log.calories),
            log.protein_g ? String(log.protein_g) : "N/A",
            log.carbs_g ? String(log.carbs_g) : "N/A",
            log.fats_g ? String(log.fats_g) : "N/A",
            log.portion_size || "N/A"
          ]);
        });
        sections.push(blankRow, blankRow);
      }

      // Hydration Logs
      if (hydrationLogs && hydrationLogs.length > 0) {
        sections.push(
          ["Hydration & Rehydration Timeline"],
          blankRow,
          ["Date", "Amount (ml)", "Pre-Training Weight", "Post-Training Weight", "Sweat Loss %", "Sodium (mg)", "Notes"]
        );
        hydrationLogs.forEach(log => {
          sections.push([
            format(new Date(log.date), "yyyy-MM-dd"),
            String(log.amount_ml),
            log.training_weight_pre ? String(log.training_weight_pre) : "N/A",
            log.training_weight_post ? String(log.training_weight_post) : "N/A",
            log.sweat_loss_percent ? String(log.sweat_loss_percent) : "N/A",
            log.sodium_mg ? String(log.sodium_mg) : "N/A",
            log.notes || ""
          ]);
        });
        sections.push(blankRow, blankRow);
      }

      // Fight Camps Comparison
      if (fightCamps && fightCamps.length > 1) {
        sections.push(
          ["Fight Camps Comparison"],
          blankRow,
          ["Metric", ...fightCamps.map(c => c.name)],
          ["Fight Date", ...fightCamps.map(c => format(new Date(c.fight_date), "yyyy-MM-dd"))],
          ["Total Weight Cut (kg)", ...fightCamps.map(c => c.total_weight_cut ? String(c.total_weight_cut) : "N/A")],
          ["Via Dehydration (kg)", ...fightCamps.map(c => c.weight_via_dehydration ? String(c.weight_via_dehydration) : "N/A")],
          ["Via Carb Reduction (kg)", ...fightCamps.map(c => c.weight_via_carb_reduction ? String(c.weight_via_carb_reduction) : "N/A")],
          ["Starting Weight (kg)", ...fightCamps.map(c => c.starting_weight_kg ? String(c.starting_weight_kg) : "N/A")],
          ["End Weight (kg)", ...fightCamps.map(c => c.end_weight_kg ? String(c.end_weight_kg) : "N/A")],
          ["Weigh-In Timing", ...fightCamps.map(c => c.weigh_in_timing === "day_before" ? "Day Before" : c.weigh_in_timing === "day_of" ? "Day Of" : "N/A")],
          ["Completed", ...fightCamps.map(c => c.is_completed ? "Yes" : "No")]
        );
      }

      // Build CSV string and trigger download
      const csvContent = sections.map(rowToCSV).join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `weight-cut-wizard-export-${format(new Date(), "yyyy-MM-dd-HHmmss")}.csv`;
      link.click();
      URL.revokeObjectURL(url);

    } catch (error) {
      logger.error("Export error", error);
      toast({
        title: "Export Failed",
        description: "Failed to export data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Delete all user data in order (respecting foreign keys)
      // NOTE: Fight camps are preserved - only tracking data is reset
      // Deleting from `meals` cascades to `meal_items` via FK ON DELETE CASCADE.
      await Promise.all([
        supabase.from("fight_week_logs").delete().eq("user_id", user.id),
        supabase.from("meals").delete().eq("user_id", user.id),
        supabase.from("hydration_logs").delete().eq("user_id", user.id),
        supabase.from("weight_logs").delete().eq("user_id", user.id),
        supabase.from("chat_messages").delete().eq("user_id", user.id),
        supabase.from("user_dietary_preferences").delete().eq("user_id", user.id),
        supabase.from("meal_plans").delete().eq("user_id", user.id),
        supabase.from("fight_week_plans").delete().eq("user_id", user.id),
      ]);

      // Delete profile last (fight camps are preserved)
      const { error: deleteError } = await supabase.from("profiles").delete().eq("id", user.id);

      if (deleteError) {
        throw deleteError;
      }

      toast({
        title: "Data Reset Complete",
        description: "All your data has been cleared. Redirecting to onboarding...",
      });

      // Redirect to onboarding
      setTimeout(() => {
        navigate("/onboarding");
        onOpenChange(false);
      }, 1500);
    } catch (error) {
      logger.error("Reset error", error);
      toast({
        title: "Reset Failed",
        description: "Failed to reset data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="text-center items-center">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/20">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <AlertDialogTitle className="text-center text-lg">Reset All Data?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-1 text-center text-[13px] leading-relaxed text-muted-foreground">
              <p>This will permanently delete your tracking data:</p>
              <div className="rounded-2xl bg-destructive/5 dark:bg-destructive/10 border border-destructive/10 dark:border-destructive/15 p-4 text-left text-xs space-y-1.5 text-muted-foreground/80">
                <p>Profile information (age, height, targets)</p>
                <p>All weight, nutrition & hydration logs</p>
                <p>Fight week plans, logs & AI chat history</p>
              </div>
              <div className="flex items-center justify-center gap-2 text-xs font-medium text-primary">
                <Shield className="h-3.5 w-3.5" />
                Fight camps will be preserved
              </div>
              <p className="text-xs text-muted-foreground/50">
                We recommend exporting your data before resetting.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Export button */}
        <Button
          variant="outline"
          onClick={exportAllData}
          disabled={exporting || resetting}
          className="w-full rounded-2xl h-12 text-[15px] font-semibold"
        >
          {exporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Export Data First
            </>
          )}
        </Button>

        <AlertDialogFooter className="flex-row gap-3">
          <AlertDialogCancel className="flex-1 h-12 rounded-2xl text-[15px] font-semibold" disabled={resetting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReset}
            disabled={exporting || resetting}
            className="flex-1 h-12 rounded-2xl text-[15px] font-semibold bg-destructive hover:bg-destructive/90"
          >
            {resetting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              "Reset All Data"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
