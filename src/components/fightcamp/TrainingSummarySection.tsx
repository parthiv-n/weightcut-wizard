import { useState, useEffect, useCallback, useMemo } from "react";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { Brain, Loader2, ChevronDown, Trash2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type TrainingSummary = {
    sportSections: {
        sport: string;
        sessions_count: number;
        techniques: { name: string; steps: string[]; sparringTip: string }[];
    }[];
    weekOverview: string;
};

type SavedSummaryRow = {
    id: string;
    week_start: string;
    summary_data: TrainingSummary;
    session_ids: string[];
    notes_fingerprint: string;
    created_at: string;
    updated_at: string;
};

type SessionRow = {
    id: string;
    date: string;
    session_type: string;
    duration_minutes: number;
    notes: string | null;
};

type ButtonState = "hidden" | "generate" | "update" | "up_to_date";

interface TrainingSummarySectionProps {
    userId: string;
    selectedDate: Date;
    sessionLoggedTrigger: number;
}

const sportColors: Record<string, string> = {
    "BJJ": "bg-blue-500",
    "Muay Thai": "bg-red-500",
    "Wrestling": "bg-amber-500",
    "Sparring": "bg-orange-500",
    "Strength": "bg-green-500",
    "Conditioning": "bg-emerald-500",
};

function computeFingerprint(sessions: SessionRow[]): string {
    return sessions
        .filter(s => s.notes)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(s => `${s.id}:${s.notes}`)
        .join("|");
}

function weekLabel(weekStartStr: string): string {
    const start = new Date(weekStartStr + "T00:00:00");
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    if (sameMonth) {
        return `${format(start, "MMM d")}-${format(end, "d")}`;
    }
    return `${format(start, "MMM d")}-${format(end, "MMM d")}`;
}

export function TrainingSummarySection({ userId, selectedDate, sessionLoggedTrigger }: TrainingSummarySectionProps) {
    const { toast } = useToast();
    const [savedSummaries, setSavedSummaries] = useState<SavedSummaryRow[]>([]);
    const [weekSessions, setWeekSessions] = useState<SessionRow[]>([]);
    const [selectedWeekStart, setSelectedWeekStart] = useState<string>(
        format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd")
    );
    const [isLoading, setIsLoading] = useState(false);
    const [isSummaryOpen, setIsSummaryOpen] = useState(true);

    const calendarWeekStart = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd");

    // Sync selectedWeekStart when calendar week changes
    useEffect(() => {
        setSelectedWeekStart(calendarWeekStart);
    }, [calendarWeekStart]);

    // Fetch all saved summaries
    const fetchAllSummaries = useCallback(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
            .from("training_summaries")
            .select("*")
            .eq("user_id", userId)
            .order("week_start", { ascending: false });

        if (error) {
            console.error("Error fetching summaries:", error);
            return;
        }
        setSavedSummaries((data as SavedSummaryRow[]) || []);
    }, [userId]);

    // Fetch sessions for the current calendar week (for change detection)
    const fetchWeekSessions = useCallback(async () => {
        const ws = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const we = endOfWeek(selectedDate, { weekStartsOn: 1 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
            .from("fight_camp_calendar")
            .select("id, date, session_type, duration_minutes, notes")
            .eq("user_id", userId)
            .gte("date", format(ws, "yyyy-MM-dd"))
            .lte("date", format(we, "yyyy-MM-dd"));

        if (error) {
            console.error("Error fetching week sessions:", error);
            return;
        }
        setWeekSessions((data as SessionRow[]) || []);
    }, [userId, selectedDate]);

    useEffect(() => {
        fetchAllSummaries();
    }, [fetchAllSummaries]);

    useEffect(() => {
        fetchWeekSessions();
    }, [fetchWeekSessions, sessionLoggedTrigger]);

    // Build gallery chips — all saved weeks + current calendar week (deduped)
    const galleryWeeks = useMemo(() => {
        const weekSet = new Set<string>();
        weekSet.add(calendarWeekStart);
        savedSummaries.forEach(s => weekSet.add(s.week_start));
        return Array.from(weekSet).sort((a, b) => b.localeCompare(a));
    }, [calendarWeekStart, savedSummaries]);

    // Currently selected summary
    const selectedSummary = useMemo(
        () => savedSummaries.find(s => s.week_start === selectedWeekStart) ?? null,
        [savedSummaries, selectedWeekStart]
    );

    // Sessions with notes for the current calendar week
    const sessionsWithNotes = useMemo(
        () => weekSessions.filter(s => s.notes),
        [weekSessions]
    );

    // Change detection — only for the current calendar week
    const buttonState: ButtonState = useMemo(() => {
        if (selectedWeekStart !== calendarWeekStart) return "hidden";
        if (sessionsWithNotes.length === 0) return "hidden";
        if (!selectedSummary) return "generate";
        const currentFingerprint = computeFingerprint(weekSessions);
        if (currentFingerprint !== selectedSummary.notes_fingerprint) return "update";
        return "up_to_date";
    }, [selectedWeekStart, calendarWeekStart, sessionsWithNotes, selectedSummary, weekSessions]);

    const handleGenerateOrUpdate = async () => {
        if (sessionsWithNotes.length === 0) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke("training-summary", {
                body: {
                    sessions: sessionsWithNotes.map(s => ({
                        date: s.date,
                        session_type: s.session_type,
                        duration_minutes: s.duration_minutes,
                        notes: s.notes,
                    })),
                },
            });

            if (error) throw error;
            if (!data?.summary) throw new Error("No summary returned");

            const fingerprint = computeFingerprint(weekSessions);
            const sessionIds = weekSessions.filter(s => s.notes).map(s => s.id);

            // Upsert: insert or update
            if (selectedSummary) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: updateErr } = await (supabase as any)
                    .from("training_summaries")
                    .update({
                        summary_data: data.summary,
                        session_ids: sessionIds,
                        notes_fingerprint: fingerprint,
                    })
                    .eq("id", selectedSummary.id);

                if (updateErr) throw updateErr;
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: insertErr } = await (supabase as any)
                    .from("training_summaries")
                    .insert([{
                        user_id: userId,
                        week_start: calendarWeekStart,
                        summary_data: data.summary,
                        session_ids: sessionIds,
                        notes_fingerprint: fingerprint,
                    }]);

                if (insertErr) throw insertErr;
            }

            await fetchAllSummaries();
            setIsSummaryOpen(true);
        } catch (error) {
            console.error("Error generating training summary:", error);
            toast({
                title: "Error generating summary",
                description: "Could not generate your training summary. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteSummary = async (id: string) => {
        // Optimistic remove
        setSavedSummaries(prev => prev.filter(s => s.id !== id));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
            .from("training_summaries")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("Error deleting summary:", error);
            toast({
                title: "Error deleting summary",
                description: "Could not delete the summary. Please try again.",
                variant: "destructive",
            });
            await fetchAllSummaries(); // revert
        }
    };

    // Nothing to show if no saved summaries and no sessions with notes
    if (galleryWeeks.length <= 1 && sessionsWithNotes.length === 0 && !selectedSummary) {
        return null;
    }

    const summaryToDisplay = selectedSummary?.summary_data ?? null;

    return (
        <div className="mt-6 space-y-4">
            {/* Gallery — horizontal week chips */}
            {galleryWeeks.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                    {galleryWeeks.map(ws => {
                        const isSelected = ws === selectedWeekStart;
                        const isSaved = savedSummaries.some(s => s.week_start === ws);
                        const isCurrent = ws === calendarWeekStart;

                        return (
                            <button
                                key={ws}
                                onClick={() => {
                                    setSelectedWeekStart(ws);
                                    setIsSummaryOpen(true);
                                }}
                                className={`
                                    flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                                    ${isSelected
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : isSaved
                                            ? "bg-accent/40 text-foreground/70 hover:bg-accent/60"
                                            : isCurrent
                                                ? "border border-dashed border-border text-foreground/50 hover:bg-accent/30"
                                                : "bg-accent/20 text-foreground/50"
                                    }
                                `}
                            >
                                {weekLabel(ws)}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Generate / Update button — only for current calendar week */}
            {buttonState !== "hidden" && (
                <button
                    onClick={buttonState !== "up_to_date" ? handleGenerateOrUpdate : undefined}
                    disabled={isLoading || buttonState === "up_to_date"}
                    className="w-full p-4 rounded-2xl glass-card border border-border/50 flex items-center justify-center gap-2 hover:bg-accent/30 transition-all disabled:opacity-60"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            <span className="text-sm font-semibold text-muted-foreground">
                                Analyzing your sessions...
                            </span>
                        </>
                    ) : buttonState === "up_to_date" ? (
                        <>
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            <span className="text-sm font-semibold text-muted-foreground">Up to date</span>
                        </>
                    ) : (
                        <>
                            <Brain className="h-5 w-5 text-primary" />
                            <span className="text-sm font-semibold bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
                                {buttonState === "update" ? "Update Training Summary" : "Generate Training Summary"}
                            </span>
                        </>
                    )}
                </button>
            )}

            {/* Summary display */}
            {summaryToDisplay && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between w-full">
                        <button
                            onClick={() => setIsSummaryOpen(!isSummaryOpen)}
                            className="flex items-center gap-2"
                        >
                            <ChevronDown
                                className={`h-4 w-4 text-muted-foreground transition-transform ${isSummaryOpen ? "" : "-rotate-90"}`}
                            />
                            <span className="text-sm font-semibold text-muted-foreground">
                                Week Summary
                            </span>
                        </button>
                        {selectedSummary && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteSummary(selectedSummary.id)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>

                    {isSummaryOpen && (
                        <div className="space-y-3">
                            {summaryToDisplay.weekOverview && (
                                <p className="text-sm text-muted-foreground italic px-1">
                                    {summaryToDisplay.weekOverview}
                                </p>
                            )}

                            {summaryToDisplay.sportSections?.map(section => {
                                const barColor = sportColors[section.sport] || "bg-primary";

                                return (
                                    <Card
                                        key={section.sport}
                                        className="p-4 rounded-[20px] shadow-sm glass-card overflow-hidden relative border-border/10"
                                    >
                                        <div className={`absolute top-0 left-0 w-2 h-full ${barColor}`} />
                                        <div className="ml-2">
                                            <h4 className="font-bold text-base text-foreground mb-3">
                                                {section.sport}
                                                <span className="text-xs text-muted-foreground font-normal ml-2">
                                                    {section.sessions_count} session{section.sessions_count !== 1 ? "s" : ""}
                                                </span>
                                            </h4>

                                            <div className="space-y-4">
                                                {section.techniques?.map((tech, i) => (
                                                    <div key={i}>
                                                        <h5 className="font-semibold text-sm text-foreground/90 mb-1.5">
                                                            {tech.name}
                                                        </h5>
                                                        <ol className="list-decimal list-inside space-y-0.5 text-xs text-foreground/80 mb-2">
                                                            {tech.steps?.map((step, j) => (
                                                                <li key={j}>{step}</li>
                                                            ))}
                                                        </ol>
                                                        <div className="bg-primary/10 border border-primary/20 rounded-xl px-3 py-2 text-xs text-foreground/80">
                                                            <span className="font-semibold text-primary">
                                                                Sparring tip:
                                                            </span>{" "}
                                                            {tech.sparringTip}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
