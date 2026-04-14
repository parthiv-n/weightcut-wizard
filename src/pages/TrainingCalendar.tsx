import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, addMonths, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { localCache } from "@/lib/localCache";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
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
import { logger } from "@/lib/logger";
import { getUserColors, setUserColor } from "@/lib/sessionColors";
import { encodeRunMeta, decodeRunMeta, formatPace } from "@/lib/runMeta";
import { Skeleton } from "@/components/ui/skeleton-loader";

import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type TrainingCalendarRow = Tables<"fight_camp_calendar">;
type TrainingCalendarInsert = TablesInsert<"fight_camp_calendar">;

export default function TrainingCalendar() {
    const { userId, profile } = useUser();
    const { toast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [sessions, setSessions] = useState<TrainingCalendarRow[]>([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [sessions28d, setSessions28d] = useState<TrainingCalendarRow[]>([]);
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

    const DISPLAY_TTL = 24 * 60 * 60 * 1000; // 24h — show stale cache instantly, refresh in background
    const fetchingRef = useRef(false);
    const toastRef = useRef(toast);
    toastRef.current = toast;

    const monthCacheKey = (d: Date) => `training_sessions_${format(d, "yyyy-MM")}`;

    const fetchSessions = useCallback(async () => {
        if (!userId) return;

        // Cache-first: serve cached data instantly, then refresh in background
        const cacheKey = monthCacheKey(currentDate);
        const cached = localCache.get<TrainingCalendarRow[]>(userId, cacheKey, DISPLAY_TTL);
        if (cached) {
            setSessions(cached);
            setIsLoading(false);
        } else if (!localCache.get<TrainingCalendarRow[]>(userId, cacheKey)) {
            setIsLoading(true);
        }

        try {
            const { data, error } = await supabase
                .from('fight_camp_calendar')
                .select('*')
                .eq('user_id', userId)
                .gte('date', format(startOfMonth(currentDate), "yyyy-MM-dd"))
                .lte('date', format(endOfMonth(currentDate), "yyyy-MM-dd"))
                .limit(100);

            if (error) throw error;
            setSessions(data || []);
            localCache.set(userId, cacheKey, data || []);
        } catch (error) {
            logger.error("Error fetching sessions", error);
            if (!cached) {
                toastRef.current({
                    title: "Error fetching sessions",
                    description: "Could not load your calendar data.",
                    variant: "destructive"
                });
            }
        } finally {
            setIsLoading(false);
        }
    }, [userId, currentDate]);

    const fetch28DaySessions = useCallback(async () => {
        if (!userId) return;

        const cached28d = localCache.get<TrainingCalendarRow[]>(userId, "training_sessions_28d", DISPLAY_TTL);
        if (cached28d) setSessions28d(cached28d);

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
            localCache.set(userId, "training_sessions_28d", data || []);
        } catch (error) {
            logger.error("Error fetching 28-day sessions", error);
        }
    }, [userId]);

    // Preload adjacent months in background
    const preloadMonth = useCallback(async (date: Date) => {
        if (!userId) return;
        const key = monthCacheKey(date);
        if (localCache.get(userId, key, CACHE_TTL)) return; // already cached
        try {
            const { data } = await supabase
                .from('fight_camp_calendar')
                .select('*')
                .eq('user_id', userId)
                .gte('date', format(startOfMonth(date), "yyyy-MM-dd"))
                .lte('date', format(endOfMonth(date), "yyyy-MM-dd"))
                .limit(100);
            if (data) localCache.set(userId, key, data);
        } catch { /* silent preload */ }
    }, [userId]);

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
        if (!userId) return;

        try {
            // Determine session ID upfront (existing or new UUID)
            const sessionId = editingSession ? editingSession.id : crypto.randomUUID();

            // Resolve media_url before the DB write
            let resolvedMediaUrl: string | null = existingMediaUrl ?? null;
            let mediaUploadFailed = false;

            if (mediaFile) {
                try {
                    resolvedMediaUrl = await uploadSessionMedia(userId, sessionId, mediaFile, existingMediaUrl);
                } catch (mediaError) {
                    logger.error("Failed to upload session media", mediaError);
                    mediaUploadFailed = true;
                    resolvedMediaUrl = existingMediaUrl ?? null; // keep existing if replacing failed
                }
            } else if (!mediaPreviewUrl && !mediaFile && existingMediaUrl) {
                // Media was removed
                await deleteSessionMedia(existingMediaUrl).catch(() => {});
                resolvedMediaUrl = null;
            }

            const intensityMap: Record<number, string> = { 1: 'low', 2: 'low', 3: 'moderate', 4: 'high', 5: 'high' };
            const payload: TrainingCalendarInsert = {
                id: sessionId,
                user_id: userId,
                date: format(selectedDate, "yyyy-MM-dd"),
                session_type: sessionType,
                duration_minutes: parseInt(duration) || 0,
                rpe: rpe[0],
                intensity: intensityMap[intensityLevel[0]] || 'moderate',
                intensity_level: intensityLevel[0],
                soreness_level: hasSoreness ? sorenessLevel[0] : 0,
                notes: sessionType === "Run"
                    ? encodeRunMeta(
                        { distance: runDistance, unit: runDistanceUnit, time: runTime, pace: runPace },
                        notes.trim()
                      ) || null
                    : notes.trim() || null,
                fatigue_level: null,
                sleep_quality: null,
                mobility_done: null,
                media_url: resolvedMediaUrl,
            };

            if (editingSession) {
                const { error } = await supabase
                    .from('fight_camp_calendar')
                    .update(payload)
                    .eq('id', editingSession.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('fight_camp_calendar')
                    .insert([payload]);
                if (error) throw error;
            }

            if (mediaUploadFailed) {
                toast({
                    title: "Session saved, media failed",
                    description: "Your session was saved but the photo/video could not be uploaded. Try editing the session to add it again.",
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

            setIsAddModalOpen(false);
            // Invalidate cache so re-fetch writes fresh data
            if (userId) {
                localCache.remove(userId, monthCacheKey(currentDate));
                localCache.remove(userId, "training_sessions_28d");
            }
            fetchSessions();
            fetch28DaySessions();
            setSessionLoggedTrigger(prev => prev + 1);
            resetForm();
        } catch (error) {
            logger.error("Error saving session", error);
            toast({
                title: "Error saving session",
                description: "Could not save your session. Please try again.",
                variant: "destructive"
            });
        }
    };

    const handleDeleteSession = async (id: string) => {
        try {
            // Delete associated media from storage
            const session = sessions.find(s => s.id === id);
            if (session?.media_url) {
                await deleteSessionMedia(session.media_url).catch(() => {});
            }

            const { error } = await supabase
                .from('fight_camp_calendar')
                .delete()
                .eq('id', id);
            if (error) throw error;

            confirmDelete();
            setSessions(sessions.filter(s => s.id !== id));
            if (userId) {
                localCache.remove(userId, monthCacheKey(currentDate));
                localCache.remove(userId, "training_sessions_28d");
            }
            fetch28DaySessions();
        } catch (error) {
            logger.error("Error deleting session", error);
            toast({
                title: "Error deleting session",
                description: "Could not remove the session. Please try again.",
                variant: "destructive"
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
        <div className="animate-page-in space-y-3 p-3 sm:p-5 md:p-6 max-w-7xl mx-auto pb-16 md:pb-6">
                {/* Calendar View */}
                <Card className="p-4 rounded-xl shadow-sm card-surface mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold">{format(currentDate, "MMMM yyyy")}</h2>
                        <div className="flex items-center gap-1">
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
                            <DialogContent className="sm:max-w-[340px] rounded-xl p-0 border-0 bg-card/95 backdrop-blur-xl shadow-2xl gap-0 max-h-[calc(100vh-6rem)] overflow-y-auto">
                                <div className="px-4 pt-4 pb-3">
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
                                />
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="space-y-3">
                        {isLoading ? (
                            <div className="flex flex-col gap-3">
                                {[1, 2].map(i => (
                                    <div key={i} className="card-surface rounded-xl p-5 overflow-hidden relative border border-border">
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
                            <div className="card-surface rounded-xl border-dashed border-border p-10 flex flex-col items-center justify-center text-center">
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
