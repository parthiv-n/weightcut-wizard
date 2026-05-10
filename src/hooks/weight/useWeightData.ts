import { useState, useRef } from "react";
import { format } from "date-fns";
import { useConvex, useMutation } from "convex/react";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { weightLogSchema } from "@/lib/validation";
import { localCache } from "@/lib/localCache";
import { triggerHapticSuccess, celebrateSuccess } from "@/lib/haptics";
import { logger } from "@/lib/logger";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { WeightLog, Profile } from "@/pages/weight/types";

interface UseWeightDataParams {
  profile: Profile | null;
}

export function useWeightData({ profile }: UseWeightDataParams) {
  const { updateCurrentWeight, userId } = useUser();
  const { toast } = useToast();
  const { safeAsync, isMounted } = useSafeAsync();
  const convex = useConvex();
  const logWeightMut = useMutation(api.weight_logs.logWeight);
  const deleteLogMut = useMutation(api.weight_logs.deleteLog);

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
      const logsData = await convex.query(api.weight_logs.listForUser, { limit: 365 });

      if (!isMounted()) return;

      if (logsData) {
        const typed = logsData.map((r) => ({
          id: r.id as unknown as string,
          date: r.date,
          weight_kg: r.weight_kg,
        }));
        setWeightLogs(typed);
        localCache.set(userId, 'weight_logs', typed);
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

    if (!userId) {
      toast({
        title: "Session Expired",
        description: "Please sign in again to log your weight.",
        variant: "destructive",
      });
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    const loggedWeight = parseFloat(newWeight);

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

    try {
      // `logWeight` upserts by (userId, date) — covers both insert and edit
      // paths. If the user changed the date during edit, the old row stays
      // and a new one is added; users who care can delete the orphan via UI.
      await logWeightMut({ date: newDate, weightKg: loggedWeight });

      // Mirror to the profile so the rest of the app sees the latest weight.
      try {
        await updateCurrentWeight(loggedWeight);
      } catch (profileErr) {
        logger.warn("Profile weight update failed (weight log succeeded)", profileErr);
      }

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
      setTimeout(() => fetchData(), 500);
    } catch (err) {
      setWeightLogs(prevLogs);
      toast({
        title: "Error",
        description: `Failed to ${editingLogId ? 'update' : 'log'} weight`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }

    return loggedWeight;
  };

  const handleDeleteLog = async () => {
    if (!logToDelete) return;

    setLoading(true);
    try {
      await deleteLogMut({ id: logToDelete.id as unknown as Id<"weight_logs"> });
      fetchData();
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to delete weight log",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setDeleteDialogOpen(false);
      setLogToDelete(null);
    }
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
