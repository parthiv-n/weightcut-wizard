import { useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useUser } from "@/contexts/UserContext";
import { RecoveryDashboard } from "@/components/fightcamp/RecoveryDashboard";
import { localCache } from "@/lib/localCache";
import { Skeleton } from "@/components/ui/skeleton-loader";
import { Card } from "@/components/ui/card";

// Local row shape — snake_case shape consumed by RecoveryDashboard / performanceEngine.
interface TrainingCalendarRow {
    id: string;
    user_id: string;
    date: string;
    session_type: string;
    duration_minutes: number;
    rpe: number;
    intensity: string;
    intensity_level: number | null;
    bodyweight: number | null;
    fatigue_level: number | null;
    soreness_level: number | null;
    sleep_hours: number | null;
    sleep_quality: string | null;
    mobility_done: boolean | null;
    notes: string | null;
    media_url: string | null;
    created_at: string | null;
}

export default function Recovery() {
    const { userId, profile } = useUser();
    const from = useMemo(() => format(subDays(new Date(), 28), "yyyy-MM-dd"), []);
    const to = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

    // Live-reactive Convex subscription.
    const rawSessions = useQuery(api.fight_camp.listCalendar, userId ? { from, to } : "skip");

    const sessions28d = useMemo<TrainingCalendarRow[]>(() => {
        if (!rawSessions) return [];
        return rawSessions.map((r: any) => ({
            id: r._id,
            user_id: r.userId,
            date: r.date,
            session_type: r.sessionType,
            duration_minutes: r.durationMinutes,
            rpe: r.rpe,
            intensity: r.intensity,
            intensity_level: r.intensityLevel ?? null,
            bodyweight: r.bodyweight ?? null,
            fatigue_level: r.fatigueLevel ?? null,
            soreness_level: r.sorenessLevel ?? null,
            sleep_hours: r.sleepHours ?? null,
            sleep_quality: r.sleepQuality ?? null,
            mobility_done: r.mobilityDone ?? null,
            notes: r.notes ?? null,
            media_url: r.mediaUrl ?? null,
            created_at: r._creationTime ? new Date(r._creationTime).toISOString() : null,
        }));
    }, [rawSessions]);

    // Cache the mapped result so a remount has instant first-paint while Convex
    // re-subscribes. Mirrors the pattern in TrainingCalendar.tsx.
    const [cachedSessions, setCachedSessions] = useState<TrainingCalendarRow[]>(() => {
        if (!userId) return [];
        return localCache.get<TrainingCalendarRow[]>(userId, "recovery_sessions_28d", 24 * 60 * 60 * 1000) || [];
    });
    useEffect(() => {
        if (rawSessions && userId) {
            localCache.set(userId, "recovery_sessions_28d", sessions28d);
            setCachedSessions(sessions28d);
        }
    }, [rawSessions, sessions28d, userId]);

    const athleteProfile = useMemo(() => profile ? {
        trainingFrequency: profile.training_frequency ?? null,
        activityLevel: profile.activity_level ?? null,
        sex: profile.sex ?? null,
        age: profile.age ?? null,
    } : undefined, [profile?.training_frequency, profile?.activity_level, profile?.sex, profile?.age]);

    // Loading: Convex result not yet hydrated AND no cache to fall back on.
    const isLoading = rawSessions === undefined && cachedSessions.length === 0;
    const display = rawSessions ? sessions28d : cachedSessions;

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

    if (display.length === 0) {
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
                    sessions28d={display as any}
                    userId={userId}
                    athleteProfile={athleteProfile}
                    tdee={profile?.tdee ?? null}
                />
            )}
        </div>
    );
}
