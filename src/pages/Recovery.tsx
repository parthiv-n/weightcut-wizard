import { useState, useEffect, useCallback, useMemo } from "react";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { RecoveryDashboard } from "@/components/fightcamp/RecoveryDashboard";
import { logger } from "@/lib/logger";
import { localCache } from "@/lib/localCache";
import { Skeleton } from "@/components/ui/skeleton-loader";
import { Card } from "@/components/ui/card";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { withSupabaseTimeout } from "@/lib/timeoutWrapper";
import { useToast } from "@/hooks/use-toast";

import type { Tables } from "@/integrations/supabase/types";

type TrainingCalendarRow = Tables<"fight_camp_calendar">;

export default function Recovery() {
    const { userId, profile } = useUser();
    const { safeAsync, isMounted } = useSafeAsync();
    const { toast } = useToast();
    const [sessions28d, setSessions28d] = useState<TrainingCalendarRow[]>(() => {
        if (!userId) return [];
        return localCache.get<TrainingCalendarRow[]>(userId, "recovery_sessions_28d", 24 * 60 * 60 * 1000) || [];
    });
    const [isLoading, setIsLoading] = useState(() => {
        if (!userId) return true;
        return localCache.get(userId, "recovery_sessions_28d", 24 * 60 * 60 * 1000) === null;
    });

    const athleteProfile = useMemo(() => profile ? {
        trainingFrequency: profile.training_frequency ?? null,
        activityLevel: profile.activity_level ?? null,
        sex: profile.sex ?? null,
        age: profile.age ?? null,
    } : undefined, [profile?.training_frequency, profile?.activity_level, profile?.sex, profile?.age]);

    const fetch28DaySessions = useCallback(async (isRetry = false) => {
        if (!userId) return;

        // Cache-first: serve cached data instantly (only on first attempt)
        if (!isRetry) {
            const cached = localCache.get<TrainingCalendarRow[]>(userId, "recovery_sessions_28d", 24 * 60 * 60 * 1000);
            if (cached) {
                safeAsync(setSessions28d)(cached);
                safeAsync(setIsLoading)(false);
            } else {
                safeAsync(setIsLoading)(true);
            }
        }

        try {
            const from = format(subDays(new Date(), 28), "yyyy-MM-dd");
            const to = format(new Date(), "yyyy-MM-dd");
            const { data, error } = await withSupabaseTimeout(
                supabase
                    .from('fight_camp_calendar')
                    .select('*')
                    .eq('user_id', userId)
                    .gte('date', from)
                    .lte('date', to)
                    .limit(100),
                undefined,
                "Load recovery sessions"
            );

            if (!isMounted()) return;
            if (error) throw error;

            safeAsync(setSessions28d)(data || []);
            localCache.set(userId, "recovery_sessions_28d", data || []);
        } catch (err) {
            logger.warn("Error loading recovery sessions", { err });

            if (!isRetry) {
                setTimeout(() => { if (isMounted()) fetch28DaySessions(true); }, 2000);
                return;
            }

            const cached = userId ? localCache.get<TrainingCalendarRow[]>(userId, "recovery_sessions_28d", 24 * 60 * 60 * 1000) : null;
            if (isMounted() && (!cached || cached.length === 0)) {
                toast({ title: "Couldn't load recovery data", description: "Check your connection and try again.", variant: "destructive" });
            }
        } finally {
            if (isMounted()) safeAsync(setIsLoading)(false);
        }
    }, [userId, safeAsync, isMounted, toast]);

    useEffect(() => { fetch28DaySessions(); }, [fetch28DaySessions]);

    if (isLoading) {
        return (
            <div className="space-y-3 px-5 py-3 sm:p-5 md:p-6 max-w-7xl mx-auto pb-16 md:pb-6">
                <Card className="p-6 rounded-2xl card-surface">
                    <Skeleton className="h-6 w-40 mb-4" />
                    <Skeleton className="h-48 w-full rounded-2xl" />
                </Card>
            </div>
        );
    }

    if (sessions28d.length === 0) {
        return (
            <div className="space-y-3 px-5 py-3 sm:p-5 md:p-6 max-w-7xl mx-auto pb-16 md:pb-6">
                <Card className="p-8 rounded-2xl card-surface border-dashed flex flex-col items-center justify-center text-foreground/70">
                    <p>No training sessions in the last 28 days.</p>
                    <p className="text-sm mt-1">Log sessions in the Training Calendar to see recovery analytics.</p>
                </Card>
            </div>
        );
    }

    return (
        <div className="animate-page-in space-y-3 px-5 py-3 sm:p-5 md:p-6 max-w-7xl mx-auto pb-16 md:pb-6">
            {userId && (
                <RecoveryDashboard
                    sessions28d={sessions28d as any}
                    userId={userId}
                    athleteProfile={athleteProfile}
                    tdee={profile?.tdee ?? null}
                />
            )}
        </div>
    );
}
