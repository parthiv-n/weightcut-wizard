import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, addMonths, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Activity, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { localCache } from "@/lib/localCache";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { useSafeAsync } from "@/hooks/useSafeAsync";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { TrainingSummarySection } from "@/components/fightcamp/TrainingSummarySection";
import { CalendarMonthGrid } from "@/components/fightcamp/CalendarMonthGrid";
import { SessionCard } from "@/components/fightcamp/SessionCard";
import { SessionDetailDrawer } from "@/components/fightcamp/SessionDetailDrawer";
import { FightCampLogForm, SESSION_TYPES } from "@/components/fightcamp/FightCampLogForm";
import { uploadSessionMedia, deleteSessionMedia } from "@/lib/uploadSessionMedia";
import { triggerHapticSelection, confirmDelete } from "@/lib/haptics";
import { ShareButton } from "@/components/share/ShareButton";
import { ShareCardDialog } from "@/components/share/ShareCardDialog";
import { TrainingCalendarCard } from "@/components/share/cards/TrainingCalendarCard";
import { CoachingLibrarySheet } from "@/components/fightcamp/CoachingLibrarySheet";
import { logger } from "@/lib/logger";
import { getUserColors, setUserColor } from "@/lib/sessionColors";
import { encodeRunMeta, decodeRunMeta, formatPace } from "@/lib/runMeta";
import { Skeleton } from "@/components/ui/skeleton-loader";
import { withSupabaseTimeout, withRetry } from "@/lib/timeoutWrapper";

import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type TrainingCalendarRow = Tables<"fight_camp_calendar">;
type TrainingCalendarInsert = TablesInsert<"fight_camp_calendar">;

// Module-level in-memory cache survives component remounts within a session,
// so re-entering the page paints instantly without a JSON.parse from localStorage.
type SessionsCacheEntry = { data: TrainingCalendarRow[]; fetchedAt: number };
const monthMemCache = new Map<string, SessionsCacheEntry>();
const monthInflight = new Map<string, Promise<TrainingCalendarRow[]>>();
const recent28dMemCache = new Map<string, SessionsCacheEntry>();
const recent28dInflight = new Map<string, Promise<TrainingCalendarRow[]>>();
const FRESH_WINDOW_MS = 30 * 1000; // dedupe identical requests inside 30s

export default function TrainingCalendar() {
    const { userId, profile } = useUser();
    const { toast } = useToast();
    const { safeAsync, isMounted } = useSafeAsync();
    const [searchParams, setSearchParams] = useSearchParams();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [sessions, setSessions] = useState<TrainingCalendarRow[]>(() => {
        // Hydrate from in-memory cache synchronously so first paint has data
        const ws = userId ? monthMemCache.get(`${userId}:${format(new Date(), "yyyy-MM")}`) : null;
        return ws?.data ?? [];
    });
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [sessions28d, setSessions28d] = useState<TrainingCalendarRow[]>(() => {
        const ws = userId ? recent28dMemCache.get(userId) : null;
        return ws?.data ?? [];
    });
    const [sessionLoggedTrigger, setSessionLoggedTrigger] = useState(0);

    // Form State
    const [sessionType, setSessionType] = useState(SESSION_TYPES[0]);
    const [duration, setDuration] = useState("60");
    const [rpe, setRpe] = useState([5]);
    const [intensityLevel, setIntensityLevel] = useState([3]);
    const [hasSoreness, setHasSoreness] = useState(false);
    const [sorenessLevel, setSorenessLevel] = useState([5]);
    const [notes, setNotes] = useState("");
    const [runDistance, setRunDistance] = useState("");
    const [runTime, setRunTime] = useState("");
    const [runDistanceUnit, setRunDistanceUnit] = useState<"km" | "mi">("km");
    const runPace = formatPace(runDistance, runTime);

    // Edit state
    const [editingSession, setEditingSession] = useState<TrainingCalendarRow | null>(null);
    // Share state
    const [shareOpen, setShareOpen] = useState(false);
    const [shareTimeRange, setShareTimeRange] = useState<"day" | "week" | "month">("week");
    const [cardVariant, setCardVariant] = useState<"dark" | "transparent">("dark");
    // Custom session colors
    const [customColors, setCustomColors] = useState<Record<string, string>>({});
    // Media state
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
    const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(null);
    // Detail drawer state
    const [viewingSession, setViewingSession] = useState<TrainingCalendarRow | null>(null);
    const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
    // Coaching library state
    const [libraryOpen, setLibraryOpen] = useState(false);

    const DISPLAY_TTL = 24 * 60 * 60 * 1000; // 24h — show stale cache instantly, refresh in background
    const fetchingRef = useRef(false);
    const toastRef = useRef(toast);
    toastRef.current = toast;
    // Keep a ref in sync with userId so async handlers (e.g. handleSaveSession's
    // wait-for-auth poll) observe live values, not the captured render closure.
    const userIdRef = useRef(userId);
    useEffect(() => { userIdRef.current = userId; }, [userId]);

    const monthCacheKey = (d: Date) => `training_sessions_${format(d, "yyyy-MM")}`;

    const queryMonth = useCallback(async (uid: string, date: Date): Promise<TrainingCalendarRow[]> => {
        const memKey = `${uid}:${format(date, "yyyy-MM")}`;
        const inflight = monthInflight.get(memKey);
        if (inflight) return inflight;

        const promise = (async () => {
            const { data, error } = await withRetry(
                () => withSupabaseTimeout(
                    supabase
                        .from('fight_camp_calendar')
                        .select('*')
                        .eq('user_id', uid)
                        .gte('date', format(startOfMonth(date), "yyyy-MM-dd"))
                        .lte('date', format(endOfMonth(date), "yyyy-MM-dd"))
                        .limit(100),
                    12000,
                    "Fetch training month",
                ),
                1,
                500,
            );
            if (error) throw error;
            const rows = (data ?? []) as TrainingCalendarRow[];
            monthMemCache.set(memKey, { data: rows, fetchedAt: Date.now() });
            localCache.set(uid, monthCacheKey(date), rows);
            return rows;
        })().catch((err) => {
            // Kick connection recovery so a wedged auth mutex doesn't poison
            // every subsequent call. Re-throw so callers still see the error.
            void import('@/lib/connectionRecovery').then(({ recoverSupabaseConnection }) =>
                recoverSupabaseConnection('training-month-fetch-timeout')
            ).catch(() => {});
            throw err;
        });

        monthInflight.set(memKey, promise);
        try {
            return await promise;
        } finally {
            monthInflight.delete(memKey);
        }
    }, []);

    const fetchSessions = useCallback(async () => {
        if (!userId) return;

        // Cache-first: serve memCache → localCache → network. Skeleton only on cold miss.
        const memKey = `${userId}:${format(currentDate, "yyyy-MM")}`;
        const mem = monthMemCache.get(memKey);
        const cached = mem?.data ?? localCache.get<TrainingCalendarRow[]>(userId, monthCacheKey(currentDate), DISPLAY_TTL);
        if (cached) {
            safeAsync(setSessions)(cached);
            safeAsync(setIsLoading)(false);
            // Skip refetch if memCache is hot
            if (mem && Date.now() - mem.fetchedAt < FRESH_WINDOW_MS) return;
        } else {
            safeAsync(setIsLoading)(true);
        }

        try {
            const rows = await queryMonth(userId, currentDate);
            safeAsync(setSessions)(rows);
        } catch (error) {
            logger.warn("Error fetching sessions", error);
            // Only surface a destructive toast when we have nothing cached to
            // show the user; otherwise the cache covers it and we silently
            // retry next time UserContext flushes the queue.
            if (!cached && isMounted()) {
                toastRef.current({
                    title: "Couldn't refresh calendar",
                    description: "Showing offline data — we'll retry when you're reconnected.",
                });
            }
        } finally {
            safeAsync(setIsLoading)(false);
        }
    }, [userId, currentDate, safeAsync, isMounted, queryMonth]);

    const fetch28DaySessions = useCallback(async () => {
        if (!userId) return;

        const mem = recent28dMemCache.get(userId);
        const cached28d = mem?.data ?? localCache.get<TrainingCalendarRow[]>(userId, "training_sessions_28d", DISPLAY_TTL);
        if (cached28d) safeAsync(setSessions28d)(cached28d);
        if (mem && Date.now() - mem.fetchedAt < FRESH_WINDOW_MS) return;

        const inflight = recent28dInflight.get(userId);
        if (inflight) {
            try {
                const rows = await inflight;
                safeAsync(setSessions28d)(rows);
            } catch { /* already logged */ }
            return;
        }

        const promise = (async () => {
            const from = format(subDays(new Date(), 28), "yyyy-MM-dd");
            const to = format(new Date(), "yyyy-MM-dd");
            const { data, error } = await withRetry(
                () => withSupabaseTimeout(
                    supabase
                        .from('fight_camp_calendar')
                        .select('*')
                        .eq('user_id', userId)
                        .gte('date', from)
                        .lte('date', to)
                        .limit(100),
                    12000,
                    "Fetch training 28d",
                ),
                1,
                500,
            );
            if (error) throw error;
            const rows = (data ?? []) as TrainingCalendarRow[];
            recent28dMemCache.set(userId, { data: rows, fetchedAt: Date.now() });
            localCache.set(userId, "training_sessions_28d", rows);
            return rows;
        })();

        recent28dInflight.set(userId, promise);
        try {
            const rows = await promise;
            safeAsync(setSessions28d)(rows);
        } catch (err) {
            logger.warn("TrainingCalendar: 28-day fetch failed", { err });
        } finally {
            recent28dInflight.delete(userId);
        }
    }, [userId, safeAsync]);

    // Preload adjacent months in background
    const preloadMonth = useCallback(async (date: Date) => {
        if (!userId) return;
        const memKey = `${userId}:${format(date, "yyyy-MM")}`;
        if (monthMemCache.get(memKey)) return;
        if (localCache.get(userId, monthCacheKey(date), DISPLAY_TTL)) return;
        try {
            await queryMonth(userId, date);
        } catch { /* silent preload */ }
    }, [userId, queryMonth]);

    useEffect(() => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;
        Promise.all([fetchSessions(), fetch28DaySessions()]).finally(() => { fetchingRef.current = false; });
    }, [fetchSessions, fetch28DaySessions]);

    // Preload prev/next months after current month loads
    useEffect(() => {
        if (!userId) return;
        const t = setTimeout(() => {
            preloadMonth(subMonths(currentDate, 1));
            preloadMonth(addMonths(currentDate, 1));
        }, 500);
        return () => clearTimeout(t);
    }, [userId, currentDate, preloadMonth]);
    useEffect(() => { if (userId) setCustomColors(getUserColors(userId)); }, [userId]);

    // Auto-open Log Session dialog when navigated from Quick Log (deferred to avoid race with QuickLog sheet close)
    useEffect(() => {
        if (searchParams.get("openLogSession") === "true") {
            searchParams.delete("openLogSession");
            setSearchParams(searchParams, { replace: true });
            const t = setTimeout(() => {
                setSelectedDate(new Date());
                setIsAddModalOpen(true);
            }, 150);
            return () => clearTimeout(t);
        }
    }, [searchParams, setSearchParams]);

    const resetForm = () => {
        setSessionType(SESSION_TYPES[0]);
        setDuration("60");
        setRpe([5]);
        setIntensityLevel([3]);
        setHasSoreness(false);
        setSorenessLevel([5]);
        setNotes("");
        setRunDistance("");
        setRunTime("");
        setRunDistanceUnit("km");
        setEditingSession(null);
        setMediaFile(null);
        setMediaPreviewUrl(null);
        setExistingMediaUrl(null);
    };

    const handleViewSession = (session: TrainingCalendarRow) => {
        setViewingSession(session);
        setIsDetailDrawerOpen(true);
    };

    const handleEditSession = (session: TrainingCalendarRow) => {
        // Close detail drawer first if open
        setIsDetailDrawerOpen(false);
        setViewingSession(null);

        setEditingSession(session);
        setSessionType(session.session_type);
        setDuration(String(session.duration_minutes));
        setRpe([session.rpe]);
        const il = session.intensity_level ?? (session.intensity === 'high' ? 5 : session.intensity === 'moderate' ? 3 : 1);
        setIntensityLevel([il]);
        setHasSoreness((session.soreness_level ?? 0) > 0);
        setSorenessLevel([(session.soreness_level ?? 0) > 0 ? session.soreness_level! : 5]);
        const { meta, notes: cleanNotes } = decodeRunMeta(session.notes);
        setNotes(cleanNotes);
        if (meta) {
            setRunDistance(meta.distance || "");
            setRunTime(meta.time || "");
            setRunDistanceUnit(meta.unit || "km");
        } else {
            setRunDistance("");
            setRunTime("");
            setRunDistanceUnit("km");
        }
        setExistingMediaUrl(session.media_url ?? null);
        setMediaFile(null);
        setMediaPreviewUrl(null);
        setIsAddModalOpen(true);
    };

    const handleSaveSession = async () => {
        // Wait briefly for userId on cold-start. Read from a ref so the loop
        // sees live updates from React re-renders rather than the captured
        // closure value of `userId`.
        let resolvedUserId = userIdRef.current;
        if (!resolvedUserId) {
            const start = Date.now();
            while (!resolvedUserId && Date.now() - start < 2000) {
                await new Promise((r) => setTimeout(r, 100));
                resolvedUserId = userIdRef.current;
            }
            if (!resolvedUserId) {
                toast({
                    title: "Still loading your account",
                    description: "Please wait a moment and try again.",
                    variant: "destructive",
                });
                return;
            }
        }

        if (isSaving) return; // guard against double-press
        setIsSaving(true);

        const uid = resolvedUserId;
        const sessionId = editingSession ? editingSession.id : crypto.randomUUID();
        const intensityMap: Record<number, string> = { 1: 'low', 2: 'low', 3: 'moderate', 4: 'high', 5: 'high' };
        const dateStr = format(selectedDate, "yyyy-MM-dd");
        const monthKey = monthCacheKey(currentDate);
        const memMonthKey = `${uid}:${format(currentDate, "yyyy-MM")}`;
        const previousMonthSessions = sessions;
        const previousMem = monthMemCache.get(memMonthKey);

        // Build optimistic row using existing media url (we'll replace with the
        // uploaded URL once it lands; UI shows the preview meanwhile)
        const baseNotes = sessionType === "Run"
            ? encodeRunMeta(
                { distance: runDistance, unit: runDistanceUnit, time: runTime, pace: runPace },
                notes.trim()
              ) || null
            : notes.trim() || null;

        const optimisticRow: TrainingCalendarRow = {
            // Spread editingSession to preserve any DB-managed fields (created_at, etc.)
            ...(editingSession ?? ({} as TrainingCalendarRow)),
            id: sessionId,
            user_id: uid,
            date: dateStr,
            session_type: sessionType,
            duration_minutes: parseInt(duration) || 0,
            rpe: rpe[0],
            intensity: intensityMap[intensityLevel[0]] || 'moderate',
            intensity_level: intensityLevel[0],
            soreness_level: hasSoreness ? sorenessLevel[0] : 0,
            notes: baseNotes,
            fatigue_level: null,
            sleep_quality: null,
            mobility_done: null,
            media_url: mediaPreviewUrl ?? existingMediaUrl ?? null,
        };

        // OPTIMISTIC: update state + caches + close dialog immediately.
        // Skip the optimistic state mutation when editing a row that isn't in
        // the visible month — preserves the row instead of silently dropping it.
        const editingRowIsVisible = !editingSession || sessions.some(s => s.id === sessionId);
        const optimisticApplied = editingRowIsVisible;
        const nextSessions = !optimisticApplied
            ? sessions
            : editingSession
                ? sessions.map(s => s.id === sessionId ? optimisticRow : s)
                : [...sessions, optimisticRow];
        if (optimisticApplied) {
            setSessions(nextSessions);
            monthMemCache.set(memMonthKey, { data: nextSessions, fetchedAt: Date.now() });
            localCache.set(uid, monthKey, nextSessions);
        }
        setIsAddModalOpen(false);
        setSessionLoggedTrigger(prev => prev + 1);

        // Hoisted so the catch block can enqueue the failed write
        let payload: TrainingCalendarInsert | null = null;
        let resolvedMediaUrl: string | null = existingMediaUrl ?? null;
        let mediaUploadFailed = false;

        try {
            // Upload media in background (with timeout fence so it can't hang forever)
            if (mediaFile) {
                try {
                    resolvedMediaUrl = await Promise.race([
                        uploadSessionMedia(uid, sessionId, mediaFile, existingMediaUrl),
                        new Promise<string>((_, reject) =>
                            setTimeout(() => reject(new Error("Media upload timed out")), 30000)
                        ),
                    ]);
                } catch (mediaError) {
                    logger.error("Failed to upload session media", mediaError);
                    mediaUploadFailed = true;
                    resolvedMediaUrl = existingMediaUrl ?? null;
                }
            } else if (!mediaPreviewUrl && !mediaFile && existingMediaUrl) {
                deleteSessionMedia(existingMediaUrl).catch(() => {});
                resolvedMediaUrl = null;
            }

            payload = {
                id: sessionId,
                user_id: uid,
                date: dateStr,
                session_type: sessionType,
                duration_minutes: parseInt(duration) || 0,
                rpe: rpe[0],
                intensity: intensityMap[intensityLevel[0]] || 'moderate',
                intensity_level: intensityLevel[0],
                soreness_level: hasSoreness ? sorenessLevel[0] : 0,
                notes: baseNotes,
                fatigue_level: null,
                sleep_quality: null,
                mobility_done: null,
                media_url: resolvedMediaUrl,
            };

            if (editingSession) {
                const { error } = await withRetry(
                    () => withSupabaseTimeout(
                        supabase.from('fight_camp_calendar').update(payload!).eq('id', editingSession.id),
                        12000,
                        "Update training session",
                    ),
                    1,
                    500,
                );
                if (error) throw error;
            } else {
                const { error } = await withRetry(
                    () => withSupabaseTimeout(
                        supabase.from('fight_camp_calendar').insert([payload!]),
                        12000,
                        "Insert training session",
                    ),
                    1,
                    500,
                );
                if (error) throw error;
            }

            // Patch the optimistic row with the resolved media URL using a
            // functional update; mirror to caches via the live cache snapshot
            // so a concurrent month-nav refetch doesn't get overwritten.
            if (optimisticApplied && resolvedMediaUrl !== optimisticRow.media_url) {
                const patch = (rows: TrainingCalendarRow[]) =>
                    rows.map(s => s.id === sessionId ? { ...s, media_url: resolvedMediaUrl } : s);
                setSessions(prev => patch(prev));
                const liveMem = monthMemCache.get(memMonthKey);
                if (liveMem) {
                    monthMemCache.set(memMonthKey, { data: patch(liveMem.data), fetchedAt: liveMem.fetchedAt });
                }
                const liveLocal = localCache.get<TrainingCalendarRow[]>(uid, monthKey);
                if (liveLocal) {
                    localCache.set(uid, monthKey, patch(liveLocal));
                }
            }

            // If we skipped the optimistic update (edit-from-different-month),
            // invalidate the affected month so the next visit refetches fresh.
            if (!optimisticApplied && editingSession) {
                const editedMonthKey = `training_sessions_${editingSession.date.slice(0, 7)}`;
                const editedMemKey = `${uid}:${editingSession.date.slice(0, 7)}`;
                monthMemCache.delete(editedMemKey);
                localCache.remove(uid, editedMonthKey);
            }

            // Invalidate the 28d cache so the rolling window picks up the new row
            recent28dMemCache.delete(uid);
            localCache.remove(uid, "training_sessions_28d");
            // Background revalidate (non-blocking)
            void fetch28DaySessions();

            // Invalidate the TrainingSummarySection's week cache and bump the
            // trigger again now that the DB row is persisted. The first bump
            // happened optimistically (before the insert), which queried the DB
            // too early — without this second bump the "Generate Summary"
            // button would stay hidden until a manual refresh.
            const weekStartIso = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
            localCache.remove(uid, `training_week_${weekStartIso}`);
            localCache.remove(uid, "training_summaries");
            setSessionLoggedTrigger(prev => prev + 1);

            if (mediaUploadFailed) {
                toast({
                    title: "Session saved, media failed",
                    description: "Saved without the photo/video. Edit the session to retry.",
                    variant: "destructive",
                });
            } else {
                toast({
                    title: editingSession ? "Session Updated" : "Session Saved",
                    description: editingSession
                        ? "Your session has been updated."
                        : "Your training session has been logged successfully.",
                });
            }
            resetForm();
        } catch (error) {
            // QUEUE for background sync instead of rolling back. The optimistic
            // row stays visible; UserContext replays syncQueue on `online` /
            // visibility-change / app-resume. Also kick connection recovery in
            // case auth wedged (Promise.race timeouts don't cancel the
            // underlying request, so the auth mutex can stay stuck — recovery
            // cycles realtime + force-refreshes the session).
            logger.warn("Save timed out, queueing for background sync", { error });
            void import('@/lib/connectionRecovery').then(({ recoverSupabaseConnection }) =>
                recoverSupabaseConnection('training-save-timeout')
            ).catch(() => {});

            if (payload) {
                const { syncQueue } = await import('@/lib/syncQueue');
                syncQueue.enqueue(uid, {
                    table: 'fight_camp_calendar',
                    action: editingSession ? 'update' : 'insert',
                    payload: payload as unknown as Record<string, unknown>,
                    recordId: sessionId,
                    timestamp: Date.now(),
                    persistOnFailure: true,
                });
                toast({
                    title: editingSession ? "Update queued" : "Saved offline",
                    description: "We'll sync to the cloud when you're back online.",
                });
                resetForm();
            } else {
                // Failed before the payload was built (very early error) — roll
                // back the optimistic state so the UI matches reality.
                if (optimisticApplied) {
                    setSessions(previousMonthSessions);
                    if (previousMem) {
                        monthMemCache.set(memMonthKey, previousMem);
                    } else {
                        monthMemCache.delete(memMonthKey);
                    }
                    localCache.set(uid, monthKey, previousMonthSessions);
                }
                toast({
                    title: "Couldn't save session",
                    description: "Check your connection and try again.",
                    variant: "destructive"
                });
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteSession = async (id: string) => {
        if (!userId) return;
        const uid = userId;
        const session = sessions.find(s => s.id === id);
        const previousSessions = sessions;
        const memMonthKey = `${uid}:${format(currentDate, "yyyy-MM")}`;
        const previousMem = monthMemCache.get(memMonthKey);

        // Optimistic remove
        const next = sessions.filter(s => s.id !== id);
        setSessions(next);
        monthMemCache.set(memMonthKey, { data: next, fetchedAt: Date.now() });
        localCache.set(uid, monthCacheKey(currentDate), next);
        confirmDelete();

        try {
            if (session?.media_url) {
                deleteSessionMedia(session.media_url).catch(() => {});
            }
            const { error } = await withRetry(
                () => withSupabaseTimeout(
                    supabase.from('fight_camp_calendar').delete().eq('id', id),
                    12000,
                    "Delete training session",
                ),
                1,
                500,
            );
            if (error) throw error;

            recent28dMemCache.delete(uid);
            localCache.remove(uid, "training_sessions_28d");
            void fetch28DaySessions();
        } catch (error) {
            // Queue the delete for background sync. Keep the local removal so
            // the user sees their action; replay will reconcile when network
            // recovers. Also kick connection recovery in case auth wedged.
            logger.warn("Delete timed out, queueing for background sync", { error });
            void import('@/lib/connectionRecovery').then(({ recoverSupabaseConnection }) =>
                recoverSupabaseConnection('training-delete-timeout')
            ).catch(() => {});

            const { syncQueue } = await import('@/lib/syncQueue');
            syncQueue.enqueue(uid, {
                table: 'fight_camp_calendar',
                action: 'delete',
                payload: { id },
                recordId: id,
                timestamp: Date.now(),
                persistOnFailure: true,
            });
            toast({
                title: "Delete queued",
                description: "We'll finish syncing when you're back online.",
            });
        }
    };

    const handleColorChange = (sessionType: string, color: string) => {
        if (!userId) return;
        setUserColor(userId, sessionType, color);
        setCustomColors(prev => ({ ...prev, [sessionType]: color }));
    };

    const daysInMonth = eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate)
    });

    const nextMonth = () => { setCurrentDate(addMonths(currentDate, 1)); triggerHapticSelection(); };
    const prevMonth = () => { setCurrentDate(subMonths(currentDate, 1)); triggerHapticSelection(); };

    const sessionsForSelectedDate = sessions.filter(s => s.date === format(selectedDate, 'yyyy-MM-dd'));

    return (
        <div className="animate-page-in space-y-3 px-5 py-3 sm:p-5 md:p-6 max-w-7xl mx-auto pb-16 md:pb-6">
                {/* Calendar View */}
                <Card className="p-4 rounded-2xl shadow-sm card-surface mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold">{format(currentDate, "MMMM yyyy")}</h2>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { triggerHapticSelection(); setLibraryOpen(true); }}
                                aria-label="Open coaching library"
                                className="rounded-full h-8 w-8"
                            >
                                <BookOpen className="h-4 w-4" />
                            </Button>
                            {sessions.length > 0 && <ShareButton onClick={() => setShareOpen(true)} />}
                            <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="Previous month" className="rounded-full h-8 w-8">
                                <ChevronLeft className="h-5 w-5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="Next month" className="rounded-full h-8 w-8">
                                <ChevronRight className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>

                    <CalendarMonthGrid
                        daysInMonth={daysInMonth}
                        selectedDate={selectedDate}
                        sessions={sessions}
                        onSelectDate={setSelectedDate}
                    />
                </Card>

                {/* Selected Date Details */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold">{format(selectedDate, "EEEE, MMM do")}</h3>
                        <Dialog open={isAddModalOpen} onOpenChange={(open) => {
                            setIsAddModalOpen(open);
                            if (!open) resetForm();
                        }}>
                            <DialogTrigger asChild>
                                <Button className="rounded-full h-10 w-10 p-0 shadow-md">
                                    <Plus className="h-5 w-5" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-[340px] rounded-2xl p-0 border border-border/20 bg-background shadow-2xl gap-0 max-h-[calc(100vh-6rem)] overflow-y-auto">
                                <div className="px-4 pt-5 pb-2">
                                    <DialogHeader>
                                        <DialogTitle className="text-[15px] font-semibold text-center">
                                            {editingSession ? 'Edit Session' : 'Log Session'}
                                        </DialogTitle>
                                    </DialogHeader>
                                </div>
                                <div className="px-4 pb-4">
                                <FightCampLogForm
                                    isEditing={!!editingSession}
                                    userId={userId}
                                    sessionType={sessionType} setSessionType={setSessionType}
                                    duration={duration} setDuration={setDuration}
                                    rpe={rpe} setRpe={setRpe}
                                    intensityLevel={intensityLevel} setIntensityLevel={setIntensityLevel}
                                    hasSoreness={hasSoreness} setHasSoreness={setHasSoreness}
                                    sorenessLevel={sorenessLevel} setSorenessLevel={setSorenessLevel}
                                    notes={notes} setNotes={setNotes}
                                    runDistance={runDistance} setRunDistance={setRunDistance}
                                    runTime={runTime} setRunTime={setRunTime}
                                    runDistanceUnit={runDistanceUnit} setRunDistanceUnit={setRunDistanceUnit}
                                    runPace={runPace}
                                    mediaPreviewUrl={mediaPreviewUrl}
                                    existingMediaUrl={existingMediaUrl}
                                    onMediaSelected={(file, previewUrl) => {
                                        setMediaFile(file);
                                        setMediaPreviewUrl(previewUrl);
                                    }}
                                    onMediaRemoved={() => {
                                        setMediaFile(null);
                                        setMediaPreviewUrl(null);
                                        setExistingMediaUrl(null);
                                    }}
                                    onSave={handleSaveSession}
                                    saving={isSaving}
                                    canSave={!!userId}
                                />
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="space-y-3">
                        {isLoading ? (
                            <div className="flex flex-col gap-3">
                                {[1, 2].map(i => (
                                    <div key={i} className="card-surface rounded-2xl p-5 overflow-hidden relative border border-border">
                                        <div className="absolute top-0 left-0 right-0 h-[2px]">
                                            <Skeleton className="w-1/3 h-full" />
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            <Skeleton className="w-3 h-3 rounded-full" />
                                            <Skeleton className="h-4 w-20" />
                                        </div>
                                        <div className="flex gap-4 mt-4">
                                            {[1, 2, 3].map(j => (
                                                <div key={j} className="flex-1 space-y-1.5">
                                                    <Skeleton className="h-2.5 w-12" />
                                                    <Skeleton className="h-7 w-10" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : sessionsForSelectedDate.length === 0 ? (
                            <div className="card-surface rounded-2xl border-dashed border-border p-10 flex flex-col items-center justify-center text-center">
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                                    <Activity className="w-5 h-5 text-foreground/30" />
                                </div>
                                <p className="text-sm text-foreground/40 font-medium">No sessions logged</p>
                                <p className="text-xs text-foreground/25 mt-1">Tap + to record your training</p>
                            </div>
                        ) : (
                            sessionsForSelectedDate.map(session => (
                                <SessionCard
                                    key={session.id}
                                    session={session}
                                    customColors={customColors}
                                    userId={userId}
                                    onView={handleViewSession}
                                    onColorChange={handleColorChange}
                                />
                            ))
                        )}
                    </div>

                    {/* Training Summary Section */}
                    {userId && (
                        <TrainingSummarySection
                            userId={userId}
                            selectedDate={selectedDate}
                            sessionLoggedTrigger={sessionLoggedTrigger}
                            customColors={customColors}
                        />
                    )}
                </div>

            {/* Coaching Library Sheet */}
            <CoachingLibrarySheet
                userId={userId}
                open={libraryOpen}
                onOpenChange={setLibraryOpen}
            />

            {/* Session Detail Drawer */}
            <SessionDetailDrawer
                session={viewingSession}
                open={isDetailDrawerOpen}
                onOpenChange={setIsDetailDrawerOpen}
                onEdit={handleEditSession}
                onDelete={handleDeleteSession}
                customColors={customColors}
            />

            {/* Share dialog with time range */}
            <ShareCardDialog
                open={shareOpen}
                onOpenChange={(v) => { setShareOpen(v); if (v) setCardVariant("dark"); }}
                transparent={cardVariant === "transparent"}
                title="Share Training Log"
                shareTitle="Training Log"
                shareText="Check out my training log on FightCamp Wizard"
            >
                {({ cardRef, aspect, transparent }) => {
                    const now = new Date();
                    let filtered = [...sessions, ...sessions28d];
                    const seen = new Set<string>();
                    filtered = filtered.filter((s) => {
                        if (seen.has(s.id)) return false;
                        seen.add(s.id);
                        return true;
                    });
                    if (shareTimeRange === "day") {
                        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                        filtered = filtered.filter((s) => s.date === todayStr);
                    } else if (shareTimeRange === "week") {
                        const cutoff = new Date(now);
                        cutoff.setDate(cutoff.getDate() - 7);
                        const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
                        filtered = filtered.filter((s) => s.date >= cutoffStr);
                    } else {
                        const cutoff = new Date(now);
                        cutoff.setDate(cutoff.getDate() - 35);
                        const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
                        filtered = filtered.filter((s) => s.date >= cutoffStr);
                    }

                    let touchStartX = 0;

                    return (
                        <div
                            onTouchStart={(e) => { touchStartX = e.touches[0].clientX; }}
                            onTouchEnd={(e) => {
                                const delta = e.changedTouches[0].clientX - touchStartX;
                                if (Math.abs(delta) > 40) {
                                    setCardVariant((v) => v === "dark" ? "transparent" : "dark");
                                }
                            }}
                        >
                            {/* Time range pills */}
                            <div style={{
                                position: "absolute",
                                top: 100,
                                right: 48,
                                display: "flex",
                                gap: 8,
                                zIndex: 10,
                            }}>
                                {(["day", "week", "month"] as const).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setShareTimeRange(t)}
                                        style={{
                                            padding: "4px 12px",
                                            borderRadius: 999,
                                            fontSize: 12,
                                            fontWeight: 600,
                                            background: shareTimeRange === t ? "#2563eb" : "rgba(255,255,255,0.08)",
                                            color: shareTimeRange === t ? "#ffffff" : "rgba(255,255,255,0.5)",
                                            border: "none",
                                            cursor: "pointer",
                                            textTransform: "capitalize",
                                        }}
                                    >
                                        {t === "day" ? "Day" : t === "week" ? "Week" : "Month"}
                                    </button>
                                ))}
                            </div>
                            <TrainingCalendarCard
                                ref={cardRef}
                                sessions={filtered}
                                timeRange={shareTimeRange}
                                aspect={aspect}
                                customColors={customColors}
                                transparent={transparent}
                            />
                            {/* Variant mode toggle */}
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 10,
                                marginTop: 10,
                            }}>
                                <button
                                    onClick={() => setCardVariant("dark")}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        padding: 0,
                                        cursor: "pointer",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: cardVariant === "dark" ? "#ffffff" : "rgba(255,255,255,0.35)",
                                        transition: "color 0.2s",
                                    }}
                                >
                                    Dark
                                </button>
                                <div style={{ display: "flex", gap: 6 }}>
                                    {(["dark", "transparent"] as const).map((v) => (
                                        <button
                                            key={v}
                                            onClick={() => setCardVariant(v)}
                                            aria-label={`${v} style`}
                                            style={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: 4,
                                                border: "none",
                                                padding: 0,
                                                cursor: "pointer",
                                                background: cardVariant === v ? "#ffffff" : "rgba(255,255,255,0.3)",
                                                transition: "background 0.2s",
                                            }}
                                        />
                                    ))}
                                </div>
                                <button
                                    onClick={() => setCardVariant("transparent")}
                                    style={{
                                        background: "none",
                                        border: "none",
                                        padding: 0,
                                        cursor: "pointer",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: cardVariant === "transparent" ? "#ffffff" : "rgba(255,255,255,0.35)",
                                        transition: "color 0.2s",
                                    }}
                                >
                                    Transparent
                                </button>
                            </div>
                        </div>
                    );
                }}
            </ShareCardDialog>

        </div>
    );
}
