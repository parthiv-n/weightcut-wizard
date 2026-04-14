import { useState, useRef } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { weightLogSchema } from "@/lib/validation";
import { localCache } from "@/lib/localCache";
import { withSupabaseTimeout, withRetry } from "@/lib/timeoutWrapper";
import { triggerHapticSuccess, celebrateSuccess } from "@/lib/haptics";
import { logger } from "@/lib/logger";
import type { WeightLog, Profile } from "@/pages/weight/types";

interface UseWeightDataParams {
  profile: Profile | null;
}

export function useWeightData({ profile }: UseWeightDataParams) {
  const { updateCurrentWeight, userId } = useUser();
  const { toast } = useToast();
  const { safeAsync, isMounted } = useSafeAsync();

  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [newWeight, setNewWeight] = useState("");
  const [newDate, setNewDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [logToDelete, setLogToDelete] = useState<WeightLog | null>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const fetchData = async () => {
    if (!userId) return;

    const cachedLogs = localCache.get<WeightLog[]>(userId, 'weight_logs');
    if (cachedLogs) {
      safeAsync(setWeightLogs)(cachedLogs);
    }

    try {
      const { data: logsData } = await withSupabaseTimeout(
        supabase
          .from("weight_logs")
          .select("id, date, weight_kg")
          .eq("user_id", userId)
          .order("date", { ascending: true })
          .limit(365),
        undefined,
        "Weight logs query"
      );

      if (!isMounted()) return;

      if (logsData) {
        setWeightLogs(logsData);
        localCache.set(userId, 'weight_logs', logsData);
      }
    } catch (err) {
      logger.error("Error fetching weight logs", err);
    }
  };

  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submittingRef.current) return;

    const validationResult = weightLogSchema.safeParse({
      weight_kg: parseFloat(newWeight),
      date: newDate,
    });

    if (!validationResult.success) {
      toast({
        title: "Validation Error",
        description: validationResult.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) {
      toast({
        title: "Session Expired",
        description: "Please sign in again to log your weight.",
        variant: "destructive",
      });
      setLoading(false);
      submittingRef.current = false;
      return;
    }

    const loggedWeight = parseFloat(newWeight);
    let opError = null;

    // Optimistic update — show weight in list immediately
    const prevLogs = [...weightLogs];
    if (editingLogId) {
      setWeightLogs(prev => prev.map(log =>
        log.id === editingLogId ? { ...log, weight_kg: loggedWeight, date: newDate } : log
      ));
    } else {
      setWeightLogs(prev => {
        const updated = [...prev, { id: `optimistic-${Date.now()}`, date: newDate, weight_kg: loggedWeight }]
          .sort((a, b) => a.date.localeCompare(b.date));
        return updated;
      });
    }

    if (editingLogId) {
      const { error } = await withRetry(
        () => withSupabaseTimeout(
          supabase
            .from("weight_logs")
            .update({
              weight_kg: loggedWeight,
              date: newDate,
            })
            .eq("id", editingLogId),
          undefined,
          "Weight log update"
        ),
        2,
        500
      );
      opError = error;
    } else {
      const { error } = await withRetry(
        () => withSupabaseTimeout(
          supabase.from("weight_logs").insert({
            user_id: user.id,
            weight_kg: loggedWeight,
            date: newDate,
          }),
          undefined,
          "Weight log insert"
        ),
        2,
        500
      );
      opError = error;
    }

    if (opError) {
      // Rollback optimistic update
      setWeightLogs(prevLogs);
      toast({
        title: "Error",
        description: `Failed to ${editingLogId ? 'update' : 'log'} weight`,
        variant: "destructive",
      });
    } else {
      try {
        await withRetry(
          () => withSupabaseTimeout(
            supabase
              .from("profiles")
              .update({ current_weight_kg: loggedWeight })
              .eq("id", user.id),
            undefined,
            "Profile weight update"
          ),
          1,
          500
        );
      } catch (profileErr) {
        logger.warn("Profile weight update failed (weight log succeeded)", profileErr);
      }

      await updateCurrentWeight(loggedWeight);

      if (userId) {
        const cachedLogs = localCache.get<any[]>(userId, 'dashboard_weight_logs');
        if (cachedLogs) {
          const existingIdx = cachedLogs.findIndex((l: any) => l.date === newDate);
          let updatedLogs: any[];
          if (existingIdx >= 0) {
            updatedLogs = [...cachedLogs];
            updatedLogs[existingIdx] = { date: newDate, weight_kg: loggedWeight };
          } else {
            updatedLogs = [...cachedLogs, { date: newDate, weight_kg: loggedWeight }]
              .sort((a, b) => a.date.localeCompare(b.date));
          }
          if (updatedLogs.length > 30) updatedLogs = updatedLogs.slice(-30);
          localCache.set(userId, 'dashboard_weight_logs', updatedLogs);
        }
      }

      celebrateSuccess();

      setNewWeight("");
      setEditingLogId(null);
      // Background sync to get real DB IDs
      setTimeout(() => fetchData(), 500);
    }

    setLoading(false);
    submittingRef.current = false;

    // Return the logged weight for weigh-in share card check
    return loggedWeight;
  };

  const handleDeleteLog = async () => {
    if (!logToDelete) return;

    setLoading(true);
    const { error } = await withSupabaseTimeout(
      supabase
        .from("weight_logs")
        .delete()
        .eq("id", logToDelete.id),
      undefined,
      "Weight log delete"
    );

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete weight log",
        variant: "destructive",
      });
    } else {
      fetchData();
    }

    setLoading(false);
    setDeleteDialogOpen(false);
    setLogToDelete(null);
  };

  const handleEditLog = (log: WeightLog) => {
    setNewWeight(log.weight_kg.toString());
    setNewDate(log.date);
    setEditingLogId(log.id);
    weightInputRef.current?.focus();
    triggerHapticSuccess();
  };

  const initiateDelete = (log: WeightLog) => {
    setLogToDelete(log);
    setDeleteDialogOpen(true);
  };

  const getCurrentWeight = () => {
    if (!weightLogs.length) return profile?.current_weight_kg || 0;
    return weightLogs[weightLogs.length - 1].weight_kg;
  };

  return {
    weightLogs,
    newWeight, setNewWeight,
    newDate, setNewDate,
    loading,
    editingLogId,
    deleteDialogOpen, setDeleteDialogOpen,
    logToDelete,
    weightInputRef,
    fetchData,
    handleAddWeight,
    handleDeleteLog,
    handleEditLog,
    initiateDelete,
    getCurrentWeight,
  };
}
