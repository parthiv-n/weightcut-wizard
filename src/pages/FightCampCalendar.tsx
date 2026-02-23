import { useState, useEffect, useCallback, useRef } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, subMonths, addMonths, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Activity, Moon, Ruler, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RecoveryDashboard } from "@/components/fightcamp/RecoveryDashboard";

// Type definitions for fight_camp_calendar table
type FightCampCalendarInsert = {
    date: string;
    session_type: string;
    duration_minutes: number;
    rpe: number;
    intensity: string;
    intensity_level: number;
    soreness_level: number;
    sleep_hours: number;
    user_id: string;
    // Rest day fields
    fatigue_level?: number | null;
    sleep_quality?: string | null;
    mobility_done?: boolean | null;
};

type FightCampCalendarRow = FightCampCalendarInsert & {
    id: string;
    created_at: string;
};

const SESSION_TYPES = [
    "BJJ", "Muay Thai", "Wrestling", "Sparring", "Strength", "Conditioning", "Recovery", "Rest"
];

export default function FightCampCalendar() {
    const { userId } = useUser();
    const { toast } = useToast();
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
    // Rest day form state
    const [fatigue, setFatigue] = useState([5]);
    const [sleepQuality, setSleepQuality] = useState<'good' | 'poor'>('good');
    const [mobilityDone, setMobilityDone] = useState(false);

    const isRestDay = sessionType === 'Rest';

    const fetchSessions = useCallback(async () => {
        if (!userId) return;

        setIsLoading(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any)
                .from('fight_camp_calendar')
                .select('*')
                .eq('user_id', userId)
                .gte('date', format(startOfMonth(currentDate), "yyyy-MM-dd"))
                .lte('date', format(endOfMonth(currentDate), "yyyy-MM-dd"));

            if (error) throw error;
            setSessions((data as FightCampCalendarRow[]) || []);
        } catch (error) {
            console.error("Error fetching sessions:", error);
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any)
                .from('fight_camp_calendar')
                .select('*')
                .eq('user_id', userId)
                .gte('date', from)
                .lte('date', to);

            if (error) throw error;
            setSessions28d((data as FightCampCalendarRow[]) || []);
        } catch (error) {
            console.error("Error fetching 28-day sessions:", error);
        }
    }, [userId]);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    useEffect(() => {
        fetch28DaySessions();
    }, [fetch28DaySessions]);

    const handleSaveSession = async () => {
        if (!userId) return;

        try {
            const intensityMap: Record<number, string> = { 1: 'low', 2: 'low', 3: 'moderate', 4: 'high', 5: 'high' };
            const payload: FightCampCalendarInsert = {
                user_id: userId,
                date: format(selectedDate, "yyyy-MM-dd"),
                session_type: sessionType,
                duration_minutes: isRestDay ? 0 : (parseInt(duration) || 0),
                rpe: isRestDay ? 1 : rpe[0],
                intensity: intensityMap[intensityLevel[0]] || 'moderate',
                intensity_level: isRestDay ? 1 : intensityLevel[0],
                soreness_level: hasSoreness ? sorenessLevel[0] : 0,
                sleep_hours: parseFloat(sleepHours) || 0,
                // Rest day fields
                fatigue_level: isRestDay ? fatigue[0] : null,
                sleep_quality: isRestDay ? sleepQuality : null,
                mobility_done: isRestDay ? mobilityDone : null,
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
                .from('fight_camp_calendar')
                .insert([payload]);

            if (error) throw error;

            toast({
                title: isRestDay ? "Rest Day Logged" : "Session Saved",
                description: isRestDay
                    ? "Your rest day has been recorded."
                    : "Your training session has been logged successfully.",
            });

            setIsAddModalOpen(false);
            fetchSessions();
            fetch28DaySessions();
            setSessionLoggedTrigger(prev => prev + 1);

            // Reset form
            setSessionType(SESSION_TYPES[0]);
            setDuration("60");
            setRpe([5]);
            setIntensityLevel([3]);
            setHasSoreness(false);
            setSorenessLevel([5]);
            setFatigue([5]);
            setSleepQuality('good');
            setMobilityDone(false);

        } catch (error) {
            console.error("Error saving session:", error);
            toast({
                title: "Error saving session",
                description: "Could not save your session. Please try again.",
                variant: "destructive"
            });
        }
    };

    const handleDeleteSession = async (id: string) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
                .from('fight_camp_calendar')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast({
                title: "Session Deleted",
                description: "Your training session has been removed.",
            });

            // Optimistic update
            setSessions(sessions.filter(s => s.id !== id));
            fetch28DaySessions();
        } catch (error) {
            console.error("Error deleting session:", error);
            toast({
                title: "Error deleting session",
                description: "Could not remove the session. Please try again.",
                variant: "destructive"
            });
        }
    };

    const daysInMonth = eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate)
    });

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

    const sessionsForSelectedDate = sessions.filter(s => s.date === format(selectedDate, 'yyyy-MM-dd'));

    return (
        <div className="space-y-4 p-4 sm:p-5 md:p-6 max-w-7xl mx-auto pb-20 md:pb-6">
                {/* Recovery Dashboard */}
                {sessions28d.length > 0 && userId && (
                    <RecoveryDashboard sessions28d={sessions28d as any} userId={userId} sessionLoggedAt={sessionLoggedTrigger} />
                )}

                {/* Calendar View */}
                <Card className="p-4 rounded-[20px] shadow-sm glass-card mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold">{format(currentDate, "MMMM yyyy")}</h2>
                        <div className="flex gap-2">
                            <Button variant="ghost" size="icon" onClick={prevMonth} className="rounded-full h-8 w-8">
                                <ChevronLeft className="h-5 w-5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={nextMonth} className="rounded-full h-8 w-8">
                                <ChevronRight className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center mb-2">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                            <div key={i} className="text-xs font-semibold text-muted-foreground">{day}</div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {daysInMonth.map((day, i) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const hasSession = sessions.some(s => s.date === dateStr);
                            const isSelected = isSameDay(day, selectedDate);
                            const isToday = isSameDay(day, new Date());

                            return (
                                <div
                                    key={day.toISOString()}
                                    className="aspect-square flex flex-col items-center justify-center relative touch-target"
                                    onClick={() => setSelectedDate(day)}
                                >
                                    <div className={`
                    w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium transition-all
                    ${isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}
                    ${isToday && !isSelected ? 'text-primary font-bold' : ''}
                  `}>
                                        {format(day, 'd')}
                                    </div>
                                    {hasSession && (
                                        <div className="absolute bottom-1 w-1 h-1 rounded-full bg-primary drop-shadow-sm" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </Card>

                {/* Selected Date Details */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold">{format(selectedDate, "EEEE, MMM do")}</h3>
                        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                            <DialogTrigger asChild>
                                <Button className="rounded-full h-10 w-10 p-0 shadow-md">
                                    <Plus className="h-5 w-5" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto rounded-[24px]">
                                <DialogHeader>
                                    <DialogTitle className="text-2xl font-bold">Log Session</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-4 py-3">

                                    {/* Session Type — pill chips */}
                                    <div className="space-y-2">
                                        <Label className="text-sm font-semibold text-muted-foreground">SESSION TYPE</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {SESSION_TYPES.map(type => (
                                                <button
                                                    key={type}
                                                    onClick={() => setSessionType(type)}
                                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all
                                                        ${sessionType === type
                                                            ? 'bg-primary text-primary-foreground shadow-sm'
                                                            : 'bg-accent/40 text-foreground/70 hover:bg-accent/60'}`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {!isRestDay && (
                                        <>
                                            {/* Duration — compact stepper */}
                                            <div className="flex items-center justify-between bg-accent/20 px-4 py-3 rounded-2xl border border-border/50">
                                                <Label className="text-sm font-semibold text-muted-foreground">DURATION</Label>
                                                <div className="flex items-center gap-3">
                                                    <button onClick={() => setDuration(String(Math.max(0, parseInt(duration) - 5)))}
                                                        className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-base font-medium hover:bg-muted transition-colors">
                                                        −
                                                    </button>
                                                    <span className="text-xl font-bold display-number w-12 text-center">{duration}<span className="text-xs text-muted-foreground ml-0.5">m</span></span>
                                                    <button onClick={() => setDuration(String(parseInt(duration) + 5))}
                                                        className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-base font-medium hover:bg-muted transition-colors">
                                                        +
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Intensity — 1-5 slider */}
                                            <div className="space-y-2 bg-accent/30 p-3 rounded-2xl">
                                                <div className="flex justify-between items-center">
                                                    <Label className="text-sm font-semibold flex items-center gap-1">
                                                        <Ruler className="h-4 w-4 text-primary" /> INTENSITY
                                                    </Label>
                                                    <span className="font-bold text-lg">{intensityLevel[0]}</span>
                                                </div>
                                                <Slider
                                                    value={intensityLevel}
                                                    onValueChange={setIntensityLevel}
                                                    max={5}
                                                    min={1}
                                                    step={1}
                                                    className="py-2"
                                                />
                                                <div className="flex justify-between text-xs text-muted-foreground font-medium">
                                                    <span>1 (Easy)</span>
                                                    <span>3 (Mod)</span>
                                                    <span>5 (Max)</span>
                                                </div>
                                            </div>

                                            {/* RPE */}
                                            <div className="space-y-2 bg-accent/30 p-3 rounded-2xl">
                                                <div className="flex justify-between items-center">
                                                    <Label className="text-sm font-semibold flex items-center gap-1">
                                                        <Activity className="h-4 w-4 text-primary" /> RPE
                                                    </Label>
                                                    <span className="font-bold text-lg">{rpe[0]}</span>
                                                </div>
                                                <Slider
                                                    value={rpe}
                                                    onValueChange={setRpe}
                                                    max={10}
                                                    min={1}
                                                    step={1}
                                                    className="py-2"
                                                />
                                                <div className="flex justify-between text-xs text-muted-foreground font-medium">
                                                    <span>1 (Light)</span>
                                                    <span>10 (Max)</span>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* Soreness — shown for both training and rest days */}
                                    <div className="space-y-2 bg-accent/30 p-3 rounded-2xl">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-sm font-semibold">SORENESS</Label>
                                            {!isRestDay && <Switch checked={hasSoreness} onCheckedChange={setHasSoreness} />}
                                        </div>

                                        {(isRestDay || hasSoreness) && (
                                            <div className="pt-2">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-sm font-medium">Level</span>
                                                    <span className="font-bold text-lg">{sorenessLevel[0]}</span>
                                                </div>
                                                <Slider
                                                    value={sorenessLevel}
                                                    onValueChange={setSorenessLevel}
                                                    max={10}
                                                    min={1}
                                                    step={1}
                                                    className="py-2"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Rest Day specific fields */}
                                    {isRestDay && (
                                        <>
                                            {/* Fatigue */}
                                            <div className="space-y-2 bg-accent/30 p-3 rounded-2xl">
                                                <div className="flex justify-between items-center">
                                                    <Label className="text-sm font-semibold">FATIGUE</Label>
                                                    <span className="font-bold text-lg">{fatigue[0]}</span>
                                                </div>
                                                <Slider
                                                    value={fatigue}
                                                    onValueChange={setFatigue}
                                                    max={10}
                                                    min={1}
                                                    step={1}
                                                    className="py-2"
                                                />
                                                <div className="flex justify-between text-xs text-muted-foreground font-medium">
                                                    <span>1 (Fresh)</span>
                                                    <span>10 (Exhausted)</span>
                                                </div>
                                            </div>

                                            {/* Sleep Quality */}
                                            <div className="space-y-2">
                                                <Label className="text-sm font-semibold text-muted-foreground">SLEEP QUALITY</Label>
                                                <div className="flex gap-1.5">
                                                    {(['good', 'poor'] as const).map(quality => (
                                                        <button
                                                            key={quality}
                                                            onClick={() => setSleepQuality(quality)}
                                                            className={`flex-1 py-2 rounded-full text-sm font-medium capitalize transition-all
                                                                ${sleepQuality === quality
                                                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                                                    : 'bg-accent/40 text-foreground/70 hover:bg-accent/60'}`}
                                                        >
                                                            {quality === 'good' ? '😴 Good' : '😵 Poor'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Mobility */}
                                            <div className="flex items-center justify-between bg-accent/20 px-4 py-3 rounded-2xl border border-border/50">
                                                <Label className="text-sm font-semibold text-muted-foreground">MOBILITY WORK DONE?</Label>
                                                <Switch checked={mobilityDone} onCheckedChange={setMobilityDone} />
                                            </div>
                                        </>
                                    )}

                                    {/* Sleep — compact stepper (shown for all) */}
                                    <div className="flex items-center justify-between bg-accent/20 px-4 py-3 rounded-2xl border border-border/50">
                                        <Label className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                                            <Moon className="h-3.5 w-3.5" /> SLEEP
                                        </Label>
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => setSleepHours(String(Math.max(0, parseFloat(sleepHours) - 0.5)))}
                                                className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-base font-medium hover:bg-muted transition-colors">
                                                −
                                            </button>
                                            <span className="text-xl font-bold display-number w-12 text-center">{sleepHours}<span className="text-xs text-muted-foreground ml-0.5">h</span></span>
                                            <button onClick={() => setSleepHours(String(parseFloat(sleepHours) + 0.5))}
                                                className="h-7 w-7 rounded-full border border-border flex items-center justify-center text-base font-medium hover:bg-muted transition-colors">
                                                +
                                            </button>
                                        </div>
                                    </div>

                                    <Button
                                        className="w-full h-12 rounded-2xl text-lg font-bold mt-2 shadow-lg"
                                        onClick={handleSaveSession}
                                    >
                                        {isRestDay ? 'Log Rest Day' : 'Save Session'}
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <div className="space-y-3">
                        {isLoading ? (
                            <div className="text-center py-8 text-muted-foreground">Loading...</div>
                        ) : sessionsForSelectedDate.length === 0 ? (
                            <Card className="p-8 rounded-[20px] glass-card border-dashed flex flex-col items-center justify-center text-foreground/70">
                                <p>No sessions logged today.</p>
                            </Card>
                        ) : (
                            sessionsForSelectedDate.map(session => {
                                const isRest = session.session_type === 'Rest';
                                const il = session.intensity_level ?? (session.intensity === 'high' ? 5 : session.intensity === 'moderate' ? 3 : 1);
                                const barColor = il >= 4 ? 'bg-red-500' : il >= 3 ? 'bg-yellow-500' : 'bg-green-500';

                                return (
                                    <Card key={session.id} className="p-4 rounded-[20px] shadow-sm glass-card overflow-hidden relative border-border/10">
                                        <div className={`absolute top-0 left-0 w-2 h-full ${isRest ? 'bg-blue-500' : barColor}`} />

                                        <div className="flex justify-between items-start ml-2">
                                            <div>
                                                <h4 className="font-bold text-lg text-foreground">{session.session_type}</h4>
                                                {isRest ? (
                                                    <div className="flex items-center gap-3 text-sm text-foreground/80 mt-1 font-medium flex-wrap">
                                                        {session.sleep_quality && <span>Sleep: {session.sleep_quality}</span>}
                                                        {session.fatigue_level && <><span>•</span><span>Fatigue: {session.fatigue_level}/10</span></>}
                                                        {session.mobility_done && <><span>•</span><span>Mobility ✓</span></>}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-3 text-sm text-foreground/80 mt-1 font-medium">
                                                        <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {session.duration_minutes} min</span>
                                                        <span>•</span>
                                                        <span>RPE {session.rpe}</span>
                                                        <span>•</span>
                                                        <span>Int {il}/5</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mt-1 -mr-2"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteSession(session.id);
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                                {session.sleep_hours > 0 && (
                                                    <div className="text-xs text-foreground/80 flex items-center justify-end gap-1 mt-1 font-medium">
                                                        <Moon className="w-3 h-3 text-primary" /> {session.sleep_hours}h
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {session.soreness_level > 0 && (
                                            <div className="mt-3 ml-2 text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 px-2 py-1 rounded-md inline-block font-medium">
                                                Soreness Level: {session.soreness_level}/10
                                            </div>
                                        )}
                                    </Card>
                                );
                            })
                        )}
                    </div>
                </div>

        </div>
    );
}
