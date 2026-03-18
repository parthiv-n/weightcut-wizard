import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, addMonths, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { TrainingSummarySection } from "@/components/fightcamp/TrainingSummarySection";
import { CalendarMonthGrid } from "@/components/fightcamp/CalendarMonthGrid";
import { SessionCard } from "@/components/fightcamp/SessionCard";
import { FightCampLogForm, SESSION_TYPES } from "@/components/fightcamp/FightCampLogForm";
import { triggerHapticSelection } from "@/lib/haptics";
import { ShareButton } from "@/components/share/ShareButton";
import { ShareCardDialog } from "@/components/share/ShareCardDialog";
import { FightCampCalendarCard } from "@/components/share/cards/FightCampCalendarCard";
import { logger } from "@/lib/logger";
import { getUserColors, setUserColor } from "@/lib/sessionColors";
import { Skeleton } from "@/components/ui/skeleton-loader";

import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type FightCampCalendarRow = Tables<"fight_camp_calendar">;
type FightCampCalendarInsert = TablesInsert<"fight_camp_calendar">;

export default function FightCampCalendar() {
    const { userId, profile } = useUser();
    const { toast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [sessions, setSessions] = useState<FightCampCalendarRow[]>([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [sessions28d, setSessions28d] = useState<FightCampCalendarRow[]>([]);
    const [sessionLoggedTrigger, setSessionLoggedTrigger] = useState(0);

    // Form State
    const [sessionType, setSessionType] = useState(SESSION_TYPES[0]);
    const [duration, setDuration] = useState("60");
    const [rpe, setRpe] = useState([5]);
    const [intensityLevel, setIntensityLevel] = useState([3]);
    const [hasSoreness, setHasSoreness] = useState(false);
    const [sorenessLevel, setSorenessLevel] = useState([5]);
    const [sleepHours, setSleepHours] = useState("8");
    const [notes, setNotes] = useState("");

    // Edit state
    const [editingSession, setEditingSession] = useState<FightCampCalendarRow | null>(null);
    // Share state
    const [shareOpen, setShareOpen] = useState(false);
    const [shareTimeRange, setShareTimeRange] = useState<"day" | "week" | "month">("week");
    const [cardVariant, setCardVariant] = useState<"dark" | "transparent">("dark");
    // Custom session colors
    const [customColors, setCustomColors] = useState<Record<string, string>>({});

    const fetchSessions = useCallback(async () => {
        if (!userId) return;

        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('fight_camp_calendar')
                .select('*')
                .eq('user_id', userId)
                .gte('date', format(startOfMonth(currentDate), "yyyy-MM-dd"))
                .lte('date', format(endOfMonth(currentDate), "yyyy-MM-dd"));

            if (error) throw error;
            setSessions(data || []);
        } catch (error) {
            logger.error("Error fetching sessions", error);
            toast({
                title: "Error fetching sessions",
                description: "Could not load your calendar data.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    }, [userId, currentDate, toast]);

    const fetch28DaySessions = useCallback(async () => {
        if (!userId) return;
        try {
            const from = format(subDays(new Date(), 28), "yyyy-MM-dd");
            const to = format(new Date(), "yyyy-MM-dd");
            const { data, error } = await supabase
                .from('fight_camp_calendar')
                .select('*')
                .eq('user_id', userId)
                .gte('date', from)
                .lte('date', to);

            if (error) throw error;
            setSessions28d(data || []);
        } catch (error) {
            logger.error("Error fetching 28-day sessions", error);
        }
    }, [userId]);

    useEffect(() => { fetchSessions(); }, [fetchSessions]);
    useEffect(() => { fetch28DaySessions(); }, [fetch28DaySessions]);
    useEffect(() => { if (userId) setCustomColors(getUserColors(userId)); }, [userId]);

    // Auto-open Log Session dialog when navigated from Quick Log
    useEffect(() => {
        if (searchParams.get("openLogSession") === "true") {
            setSelectedDate(new Date());
            setIsAddModalOpen(true);
            searchParams.delete("openLogSession");
            setSearchParams(searchParams, { replace: true });
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
        setEditingSession(null);
    };

    const handleEditSession = (session: FightCampCalendarRow) => {
        setEditingSession(session);
        setSessionType(session.session_type);
        setDuration(String(session.duration_minutes));
        setRpe([session.rpe]);
        const il = session.intensity_level ?? (session.intensity === 'high' ? 5 : session.intensity === 'moderate' ? 3 : 1);
        setIntensityLevel([il]);
        setHasSoreness((session.soreness_level ?? 0) > 0);
        setSorenessLevel([(session.soreness_level ?? 0) > 0 ? session.soreness_level! : 5]);
        setSleepHours(String(session.sleep_hours ?? 8));
        setNotes(session.notes ?? "");
        setIsAddModalOpen(true);
    };

    const handleSaveSession = async () => {
        if (!userId) return;

        try {
            const intensityMap: Record<number, string> = { 1: 'low', 2: 'low', 3: 'moderate', 4: 'high', 5: 'high' };
            const payload: FightCampCalendarInsert = {
                user_id: userId,
                date: format(selectedDate, "yyyy-MM-dd"),
                session_type: sessionType,
                duration_minutes: parseInt(duration) || 0,
                rpe: rpe[0],
                intensity: intensityMap[intensityLevel[0]] || 'moderate',
                intensity_level: intensityLevel[0],
                soreness_level: hasSoreness ? sorenessLevel[0] : 0,
                sleep_hours: parseFloat(sleepHours) || 0,
                notes: notes.trim() || null,
                fatigue_level: null,
                sleep_quality: null,
                mobility_done: null,
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

            toast({
                title: editingSession ? "Session Updated" : "Session Saved",
                description: editingSession
                    ? "Your session has been updated."
                    : "Your training session has been logged successfully.",
            });

            setIsAddModalOpen(false);
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
            const { error } = await supabase
                .from('fight_camp_calendar')
                .delete()
                .eq('id', id);
            if (error) throw error;

            toast({ title: "Session Deleted", description: "Your training session has been removed." });
            setSessions(sessions.filter(s => s.id !== id));
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
        <div className="space-y-4 p-4 sm:p-5 md:p-6 max-w-7xl mx-auto pb-20 md:pb-6">
                {/* Calendar View */}
                <Card className="p-4 rounded-[20px] shadow-sm glass-card mb-6">
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
                            <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto rounded-[24px]">
                                <DialogHeader>
                                    <DialogTitle className="text-2xl font-bold">
                                        {editingSession ? 'Edit Session' : 'Log Session'}
                                    </DialogTitle>
                                </DialogHeader>
                                <FightCampLogForm
                                    isEditing={!!editingSession}
                                    userId={userId}
                                    sessionType={sessionType} setSessionType={setSessionType}
                                    duration={duration} setDuration={setDuration}
                                    rpe={rpe} setRpe={setRpe}
                                    intensityLevel={intensityLevel} setIntensityLevel={setIntensityLevel}
                                    hasSoreness={hasSoreness} setHasSoreness={setHasSoreness}
                                    sorenessLevel={sorenessLevel} setSorenessLevel={setSorenessLevel}
                                    sleepHours={sleepHours} setSleepHours={setSleepHours}
                                    notes={notes} setNotes={setNotes}
                                    onSave={handleSaveSession}
                                />
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="space-y-3">
                        {isLoading ? (
                            <div className="flex flex-col gap-3">
                                {[1, 2, 3].map(i => (
                                    <Card key={i} className="p-4 rounded-[20px] glass-card overflow-hidden relative border-border/10">
                                        <Skeleton className="w-2 h-full absolute left-0 top-0 rounded-l-[20px]" />
                                        <div className="ml-2 space-y-3">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <Skeleton className="w-5 h-5 rounded-full" />
                                                    <Skeleton className="h-4 w-24" />
                                                </div>
                                                <Skeleton className="h-4 w-4 rounded" />
                                            </div>
                                            <div className="flex gap-2">
                                                <Skeleton className="h-6 w-16 rounded-full" />
                                                <Skeleton className="h-6 w-14 rounded-full" />
                                                <Skeleton className="h-6 w-20 rounded-full" />
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        ) : sessionsForSelectedDate.length === 0 ? (
                            <Card className="p-8 rounded-[20px] glass-card border-dashed flex flex-col items-center justify-center text-foreground/70">
                                <p>No sessions logged today.</p>
                            </Card>
                        ) : (
                            sessionsForSelectedDate.map(session => (
                                <SessionCard
                                    key={session.id}
                                    session={session}
                                    customColors={customColors}
                                    userId={userId}
                                    onEdit={handleEditSession}
                                    onDelete={handleDeleteSession}
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

            {/* Share dialog with time range */}
            <ShareCardDialog
                open={shareOpen}
                onOpenChange={(v) => { setShareOpen(v); if (v) setCardVariant("dark"); }}
                transparent={cardVariant === "transparent"}
                title="Share Training Log"
                shareTitle="Training Log"
                shareText="Check out my training log on WeightCut Wizard"
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
                            <FightCampCalendarCard
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
