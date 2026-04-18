import { useState, useEffect, useCallback, useMemo } from "react";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { RecoveryDashboard } from "@/components/fightcamp/RecoveryDashboard";
import { logger } from "@/lib/logger";
import { localCache } from "@/lib/localCache";
import { Skeleton } from "@/components/ui/skeleton-loader";
import { Card } from "@/components/ui/card";

import type { Tables } from "@/integrations/supabase/types";

type TrainingCalendarRow = Tables<"fight_camp_calendar">;

export default function Recovery() {
    const { userId, profile } = useUser();
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
    } : undefined, [profile?.training_frequency, profile?.activity_level]);

    const fetch28DaySessions = useCallback(async () => {
        if (!userId) return;

        // Cache-first: serve cached data instantly
        const cached = localCache.get<TrainingCalendarRow[]>(userId, "recovery_sessions_28d", 24 * 60 * 60 * 1000);
        if (cached) {
            setSessions28d(cached);
            setIsLoading(false);
        } else {
            setIsLoading(true);
        }

        try {
            const from = format(subDays(new Date(), 28), "yyyy-MM-dd");
            const to = format(new Date(), "yyyy-MM-dd");
            const { data, error } = await supabase
                .from('fight_camp_calendar')
                .select('*')
                .eq('user_id', userId)
                .gte('date', from)
                .lte('date', to)
                .limit(100);

            if (error) throw error;
            setSessions28d(data || []);
            localCache.set(userId, "recovery_sessions_28d", data || []);
        } catch (error) {
            logger.error("Error fetching 28-day sessions", error);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

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
