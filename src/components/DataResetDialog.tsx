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
import { Download, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import { format } from "date-fns";

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

      // Fetch all user data
      const [
        { data: profile },
        { data: weightLogs },
        { data: nutritionLogs },
        { data: hydrationLogs },
        { data: fightCamps },
        { data: fightWeekPlans },
        { data: fightWeekLogs }
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("weight_logs").select("*").eq("user_id", user.id).order("date", { ascending: true }),
        supabase.from("nutrition_logs").select("*").eq("user_id", user.id).order("date", { ascending: true }),
        supabase.from("hydration_logs").select("*").eq("user_id", user.id).order("date", { ascending: true }),
        supabase.from("fight_camps").select("*").eq("user_id", user.id).order("fight_date", { ascending: true }),
        supabase.from("fight_week_plans").select("*").eq("user_id", user.id),
        supabase.from("fight_week_logs").select("*").eq("user_id", user.id).order("log_date", { ascending: true })
      ]);

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Profile Summary Sheet
      if (profile) {
        const profileData = [
          ["Profile Summary"],
          [""],
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
        ];
        const ws = XLSX.utils.aoa_to_sheet(profileData);
        XLSX.utils.book_append_sheet(wb, ws, "Profile");
      }

      // Weight Logs Timeline
      if (weightLogs && weightLogs.length > 0) {
        const weightData = [
          ["Weight Tracking Timeline"],
          [""],
          ["Date", "Weight (kg)", "Days in Timeline"],
        ];
        weightLogs.forEach((log, idx) => {
          weightData.push([
            format(new Date(log.date), "yyyy-MM-dd"),
            String(log.weight_kg),
            String(idx + 1)
          ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(weightData);
        XLSX.utils.book_append_sheet(wb, ws, "Weight Timeline");
      }

      // Fight Camps Summary
      if (fightCamps && fightCamps.length > 0) {
        const campsData = [
          ["Fight Camps Summary"],
          [""],
          ["Camp Name", "Event", "Fight Date", "Starting Weight", "End Weight", "Total Cut", "Via Dehydration", "Via Carb Reduction", "Weigh-In Timing", "Completed"],
        ];
        fightCamps.forEach(camp => {
          campsData.push([
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

        // Add rehydration and performance notes section
        campsData.push([]);
        campsData.push(["Camp Details"]);
        campsData.push([]);
        fightCamps.forEach(camp => {
          if (camp.rehydration_notes || camp.performance_feeling) {
            campsData.push([`${camp.name} - Rehydration Notes`]);
            campsData.push([camp.rehydration_notes || "No notes"]);
            campsData.push([]);
            campsData.push([`${camp.name} - Performance Feeling`]);
            campsData.push([camp.performance_feeling || "No notes"]);
            campsData.push([]);
          }
        });

        const ws = XLSX.utils.aoa_to_sheet(campsData);
        XLSX.utils.book_append_sheet(wb, ws, "Fight Camps");
      }

      // Fight Week Logs
      if (fightWeekLogs && fightWeekLogs.length > 0) {
        const fightWeekData = [
          ["Fight Week Timeline"],
          [""],
          ["Date", "Weight (kg)", "Carbs (g)", "Fluid Intake (ml)", "Sweat Session (min)", "Notes"],
        ];
        fightWeekLogs.forEach(log => {
          fightWeekData.push([
            format(new Date(log.log_date), "yyyy-MM-dd"),
            log.weight_kg ? String(log.weight_kg) : "N/A",
            log.carbs_g ? String(log.carbs_g) : "N/A",
            log.fluid_intake_ml ? String(log.fluid_intake_ml) : "N/A",
            log.sweat_session_min ? String(log.sweat_session_min) : "N/A",
            log.notes || ""
          ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(fightWeekData);
        XLSX.utils.book_append_sheet(wb, ws, "Fight Week Logs");
      }

      // Nutrition Logs
      if (nutritionLogs && nutritionLogs.length > 0) {
        const nutritionData = [
          ["Nutrition Timeline"],
          [""],
          ["Date", "Meal Name", "Meal Type", "Calories", "Protein (g)", "Carbs (g)", "Fats (g)", "Portion Size"],
        ];
        nutritionLogs.forEach(log => {
          nutritionData.push([
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
        const ws = XLSX.utils.aoa_to_sheet(nutritionData);
        XLSX.utils.book_append_sheet(wb, ws, "Nutrition Timeline");
      }

      // Hydration Logs
      if (hydrationLogs && hydrationLogs.length > 0) {
        const hydrationData = [
          ["Hydration & Rehydration Timeline"],
          [""],
          ["Date", "Amount (ml)", "Pre-Training Weight", "Post-Training Weight", "Sweat Loss %", "Sodium (mg)", "Notes"],
        ];
        hydrationLogs.forEach(log => {
          hydrationData.push([
            format(new Date(log.date), "yyyy-MM-dd"),
            String(log.amount_ml),
            log.training_weight_pre ? String(log.training_weight_pre) : "N/A",
            log.training_weight_post ? String(log.training_weight_post) : "N/A",
            log.sweat_loss_percent ? String(log.sweat_loss_percent) : "N/A",
            log.sodium_mg ? String(log.sodium_mg) : "N/A",
            log.notes || ""
          ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(hydrationData);
        XLSX.utils.book_append_sheet(wb, ws, "Hydration Timeline");
      }

      // Generate comparison summary
      if (fightCamps && fightCamps.length > 1) {
        const comparisonData = [
          ["Fight Camps Comparison"],
          [""],
          ["Metric", ...fightCamps.map(c => c.name)],
          ["Fight Date", ...fightCamps.map(c => format(new Date(c.fight_date), "yyyy-MM-dd"))],
          ["Total Weight Cut (kg)", ...fightCamps.map(c => c.total_weight_cut ? String(c.total_weight_cut) : "N/A")],
          ["Via Dehydration (kg)", ...fightCamps.map(c => c.weight_via_dehydration ? String(c.weight_via_dehydration) : "N/A")],
          ["Via Carb Reduction (kg)", ...fightCamps.map(c => c.weight_via_carb_reduction ? String(c.weight_via_carb_reduction) : "N/A")],
          ["Starting Weight (kg)", ...fightCamps.map(c => c.starting_weight_kg ? String(c.starting_weight_kg) : "N/A")],
          ["End Weight (kg)", ...fightCamps.map(c => c.end_weight_kg ? String(c.end_weight_kg) : "N/A")],
          ["Weigh-In Timing", ...fightCamps.map(c => c.weigh_in_timing === "day_before" ? "Day Before" : c.weigh_in_timing === "day_of" ? "Day Of" : "N/A")],
          ["Completed", ...fightCamps.map(c => c.is_completed ? "Yes" : "No")],
        ];
        const ws = XLSX.utils.aoa_to_sheet(comparisonData);
        XLSX.utils.book_append_sheet(wb, ws, "Camps Comparison");
      }

      // Export file
      const fileName = `weight-cut-wizard-export-${format(new Date(), "yyyy-MM-dd-HHmmss")}.xlsx`;
      XLSX.writeFile(wb, fileName);

      toast({
        title: "Export Complete",
        description: "Your data has been exported successfully",
      });
    } catch (error) {
      console.error("Export error:", error);
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
      await Promise.all([
        supabase.from("fight_week_logs").delete().eq("user_id", user.id),
        supabase.from("nutrition_logs").delete().eq("user_id", user.id),
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
      console.error("Reset error:", error);
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
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <AlertDialogTitle>Reset All Data?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-3 pt-2">
            <p>
              This will permanently delete your tracking data including:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Profile information (age, height, targets)</li>
              <li>All weight logs</li>
              <li>All nutrition logs</li>
              <li>All hydration logs</li>
              <li>Fight week plans and logs</li>
              <li>All AI chat history</li>
            </ul>
            <p className="text-sm font-medium text-primary">
              ✓ Fight camps will be preserved
            </p>
            <p className="font-semibold text-foreground">
              This action cannot be undone.
            </p>
            <p className="text-sm">
              We recommend exporting your data before resetting.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            variant="outline"
            onClick={exportAllData}
            disabled={exporting || resetting}
            className="w-full"
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
          <div className="flex gap-2 w-full">
            <AlertDialogCancel className="flex-1" disabled={resetting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReset}
              disabled={exporting || resetting}
              className="flex-1 bg-destructive hover:bg-destructive/90"
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
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
