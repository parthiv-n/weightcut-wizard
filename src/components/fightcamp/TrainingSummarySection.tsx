import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { Brain, Loader2, ChevronDown, Trash2, CheckCircle, X, Dumbbell, Activity, Sparkles, Gem } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";
import { localCache } from "@/lib/localCache";
import { getSessionColor } from "@/lib/sessionColors";
import { useSubscription } from "@/hooks/useSubscription";
import { useAITask } from "@/contexts/AITaskContext";
import { AICompactOverlay } from "@/components/AICompactOverlay";
import { useGems } from "@/hooks/useGems";

type TrainingSummary = {
    sportSections: {
        sport: string;
        sessions_count: number;
        techniques: { name: string; steps: string[]; sparringTip: string; drillFlow?: string[] }[];
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
    customColors?: Record<string, string>;
}

function computeFingerprint(sessions: SessionRow[]): string {
    return sessions
        .filter(s => s.notes)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(s => `${s.id}:${s.notes}`)
        .join("|");
}

function mergeSummaries(existing: TrainingSummary, incoming: TrainingSummary): TrainingSummary {
    const merged = new Map<string, TrainingSummary["sportSections"][0]>();
    for (const section of existing.sportSections || []) {
        merged.set(section.sport, { ...section, techniques: [...section.techniques] });
    }
    for (const section of incoming.sportSections || []) {
        const prev = merged.get(section.sport);
        if (prev) {
            const existingNames = new Set(prev.techniques.map(t => t.name));
            const newTechniques = section.techniques.filter(t => !existingNames.has(t.name));
            prev.techniques.push(...newTechniques);
            prev.sessions_count = section.sessions_count;
        } else {
            merged.set(section.sport, { ...section, techniques: [...section.techniques] });
        }
    }
    return {
        sportSections: Array.from(merged.values()),
        weekOverview: incoming.weekOverview || existing.weekOverview,
    };
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

export function TrainingSummarySection({ userId, selectedDate, sessionLoggedTrigger, customColors }: TrainingSummarySectionProps) {
    const { toast } = useToast();
    const { gems, isPremium: gemsIsPremium } = useGems();
    const { checkAIAccess, openNoGemsDialog, onAICallSuccess, handleAILimitError } = useSubscription();
    const { tasks, addTask, completeTask, failTask, dismissTask } = useAITask();
    const [savedSummaries, setSavedSummaries] = useState<SavedSummaryRow[]>([]);
    const [weekSessions, setWeekSessions] = useState<SessionRow[]>([]);
    const [selectedWeekStart, setSelectedWeekStart] = useState<string>(
        format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd")
    );
    const [isLoading, setIsLoading] = useState(false);
    const aiTrainingTask = tasks.find(t => t.type === "training-summary" && t.status === "running");
    const isGenerating = isLoading || !!aiTrainingTask;

    // Pick up completed training summary from task context
    const handledSummaryTaskRef = useRef<string | null>(null);
    useEffect(() => {
      const done = tasks.find(t => t.status === "done" && t.type === "training-summary" && handledSummaryTaskRef.current !== t.id);
      if (done) {
        handledSummaryTaskRef.current = done.id;
        fetchAllSummaries();
        setIsSummaryOpen(true);
        dismissTask(done.id);
      }
    }, [tasks, dismissTask]);
    const [isSummaryOpen, setIsSummaryOpen] = useState(true);
    const abortRef = useRef<AbortController | null>(null);

    const calendarWeekStart = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd");

    // Sync selectedWeekStart when calendar week changes
    useEffect(() => {
        setSelectedWeekStart(calendarWeekStart);
    }, [calendarWeekStart]);

    // Fetch all saved summaries (cache-first)
    const fetchAllSummaries = useCallback(async () => {
        const cached = localCache.get<SavedSummaryRow[]>(userId, "training_summaries", 10 * 60 * 1000);
        if (cached) setSavedSummaries(cached);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
            .from("training_summaries")
            .select("id, week_start, summary_data, session_ids, notes_fingerprint, created_at, updated_at")
            .eq("user_id", userId)
            .order("week_start", { ascending: false })
            .limit(20);

        if (error) {
            logger.error("Error fetching summaries", error);
            return;
        }
        setSavedSummaries((data as SavedSummaryRow[]) || []);
        localCache.set(userId, "training_summaries", data || []);
    }, [userId]);

    // Fetch sessions for the current calendar week (for change detection)
    const fetchWeekSessions = useCallback(async (skipCache = false) => {
        const ws = startOfWeek(selectedDate, { weekStartsOn: 1 });
        const we = endOfWeek(selectedDate, { weekStartsOn: 1 });
        const weekKey = `training_week_${format(ws, "yyyy-MM-dd")}`;
        if (!skipCache) {
            const cached = localCache.get<SessionRow[]>(userId, weekKey, 5 * 60 * 1000);
            if (cached) { setWeekSessions(cached); return; }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
            .from("fight_camp_calendar")
            .select("id, date, session_type, duration_minutes, notes")
            .eq("user_id", userId)
            .gte("date", format(ws, "yyyy-MM-dd"))
            .lte("date", format(we, "yyyy-MM-dd"));

        if (error) {
            logger.error("Error fetching week sessions", error);
            return;
        }
        setWeekSessions((data as SessionRow[]) || []);
        localCache.set(userId, weekKey, data || []);
    }, [userId, selectedDate]);

    useEffect(() => {
        fetchAllSummaries();
    }, [fetchAllSummaries]);

    // Initial load — uses cache
    useEffect(() => {
        fetchWeekSessions();
    }, [fetchWeekSessions]);

    // Re-fetch on new session logged — bypass cache
    useEffect(() => {
        if (sessionLoggedTrigger > 0) fetchWeekSessions(true);
    }, [sessionLoggedTrigger]);

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
        if (sessionsWithNotes.length === 0) return "hidden";
        if (!selectedSummary) return "generate";
        const currentFingerprint = computeFingerprint(weekSessions);
        if (currentFingerprint !== selectedSummary.notes_fingerprint) return "update";
        return "up_to_date";
    }, [selectedWeekStart, calendarWeekStart, sessionsWithNotes, selectedSummary, weekSessions]);

    const handleCancel = () => {
        abortRef.current?.abort();
        setIsLoading(false);
    };

    const handleGenerateOrUpdate = async () => {
        if (sessionsWithNotes.length === 0) return;
        if (!checkAIAccess()) {
            openNoGemsDialog();
            return;
        }
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setIsLoading(true);

        const taskId = addTask({
            id: `training-summary-${Date.now()}`,
            type: "training-summary",
            label: "Generating Summary",
            steps: [
                { icon: Dumbbell, label: "Reviewing sessions" },
                { icon: Activity, label: "Analyzing performance" },
                { icon: Sparkles, label: "Writing summary" },
            ],
            returnPath: window.location.pathname,
        });

        try {
            // Only send sessions not already summarized (new entries since last summary)
            const alreadySummarized = new Set(selectedSummary?.session_ids || []);
            const sessionsToSend = sessionsWithNotes.filter(s => !alreadySummarized.has(s.id));
            // If no new sessions, nothing to do (shouldn't happen since fingerprint would match)
            if (sessionsToSend.length === 0) { setIsLoading(false); return; }

            const { data, error } = await supabase.functions.invoke("training-summary", {
                body: {
                    sessions: sessionsToSend.map(s => ({
                        date: s.date,
                        session_type: s.session_type,
                        duration_minutes: s.duration_minutes,
                        notes: s.notes,
                    })),
                },
                signal: controller.signal,
            });
            if (controller.signal.aborted) return;

            if (error) {
                if (await handleAILimitError(error)) { failTask(taskId, "Limit reached"); return; }
                throw error;
            }
            if (!data?.summary) throw new Error("No summary returned");

            onAICallSuccess();
            const fingerprint = computeFingerprint(weekSessions);
            const allSessionIds = sessionsWithNotes.map(s => s.id);

            // Upsert: insert or update
            if (selectedSummary) {
                // Merge new summary with existing — append new sport sections/techniques
                const merged = mergeSummaries(selectedSummary.summary_data, data.summary);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: updateErr } = await (supabase as any)
                    .from("training_summaries")
                    .update({
                        summary_data: merged,
                        session_ids: allSessionIds,
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
                        session_ids: allSessionIds,
                        notes_fingerprint: fingerprint,
                    }]);

                if (insertErr) throw insertErr;
            }

            // Bust cache and refresh immediately so summary appears live
            localCache.remove(userId, "training_summaries");
            await fetchAllSummaries();
            setIsSummaryOpen(true);
            completeTask(taskId, data.summary);
        } catch (error: any) {
            if (error?.name === 'AbortError' || controller.signal.aborted) return;
            logger.error("Error generating training summary", error);
            failTask(taskId, error?.message || "Could not generate your training summary");
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
            logger.error("Error deleting summary", error);
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
                                                ? "border border-dashed border-border text-foreground/75 hover:bg-accent/30"
                                                : "bg-accent/20 text-foreground/75"
                                    }
                                `}
                            >
                                {weekLabel(ws)}
                            </button>
                        );
                    })}
                </div>
            )}

            {aiTrainingTask && (
                <AICompactOverlay
                    isOpen={true}
                    isGenerating={true}
                    steps={aiTrainingTask.steps}
                    startedAt={aiTrainingTask.startedAt}                    title={aiTrainingTask.label}
                    onCancel={() => { abortRef.current?.abort(); dismissTask(aiTrainingTask.id); setIsLoading(false); }}
                />
            )}

            {/* Generate / Update button — only for current calendar week */}
            {buttonState !== "hidden" && (
                <button
                    onClick={buttonState !== "up_to_date" ? handleGenerateOrUpdate : undefined}
                    disabled={isGenerating || buttonState === "up_to_date"}
                    className="w-full p-4 rounded-2xl card-surface border border-border/50 flex items-center justify-center gap-2 hover:bg-accent/30 transition-all disabled:opacity-60"
                >
                    {isGenerating ? (
                        <div className="flex items-center gap-2 w-full justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            <span className="text-sm font-semibold text-muted-foreground">
                                Analyzing your sessions...
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleCancel(); }}
                                className="ml-auto flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-accent/30"
                            >
                                <X className="h-3.5 w-3.5" />
                                Cancel
                            </button>
                        </div>
                    ) : buttonState === "up_to_date" ? (
                        <>
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            <span className="text-sm font-semibold text-muted-foreground">Up to date</span>
                        </>
                    ) : (
                        <>
                            <Brain className="h-5 w-5 text-primary" />
                            <span className="text-sm font-semibold text-primary">
                                {buttonState === "update" ? "Update Training Summary" : "Generate Training Summary"}
                            </span>
                            {!gemsIsPremium && (
                                <span className="inline-flex items-center gap-0.5 ml-1.5 text-muted-foreground">
                                    <Gem className="h-3 w-3" />
                                    <span className="text-[10px] font-medium tabular-nums">{gems}</span>
                                </span>
                            )}
                        </>
                    )}
                </button>
            )}

            {/* Summary display */}
            {summaryToDisplay && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between w-full">
                        <button onClick={() => setIsSummaryOpen(!isSummaryOpen)} className="flex items-center gap-2">
                            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/70 transition-transform ${isSummaryOpen ? "" : "-rotate-90"}`} />
                            <span className="text-[13px] font-semibold text-foreground">Week Summary</span>
                        </button>
                        {selectedSummary && (
                            <button onClick={() => handleDeleteSummary(selectedSummary.id)}
                                className="h-8 w-8 flex items-center justify-center rounded-xl text-muted-foreground/30 active:text-destructive active:bg-destructive/10 transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {isSummaryOpen && (
                        <div className="space-y-3">
                            {summaryToDisplay.weekOverview && (
                                <p className="text-[13px] text-foreground/75 leading-relaxed">
                                    {(summaryToDisplay.weekOverview || '').replace(/\u2014/g, ' - ').replace(/\u2013/g, '-')}
                                </p>
                            )}

                            {summaryToDisplay.sportSections?.map(section => (
                                <div key={section.sport} className="rounded-2xl border-2 border-border/40 overflow-hidden">
                                    {/* Sport header */}
                                    <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border/10">
                                        <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: getSessionColor(section.sport, customColors) }} />
                                        <span className="text-[13px] font-semibold text-foreground">{section.sport}</span>
                                        <span className="text-[11px] text-muted-foreground/70 ml-auto tabular-nums">{section.sessions_count} session{section.sessions_count !== 1 ? "s" : ""}</span>
                                    </div>

                                    {/* Techniques */}
                                    <div className="divide-y divide-border/10">
                                        {section.techniques?.map((tech, i) => (
                                            <div key={i} className="px-3.5 py-3">
                                                <p className="text-[13px] font-medium text-foreground mb-2">{tech.name}</p>

                                                {tech.steps && tech.steps.length > 0 && (
                                                    <div className="space-y-1 mb-2.5">
                                                        {tech.steps.map((step, j) => (
                                                            <div key={j} className="flex items-start gap-2">
                                                                <div className="h-4 w-4 rounded-full bg-muted/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                                    <span className="text-[9px] font-bold text-muted-foreground tabular-nums">{j + 1}</span>
                                                                </div>
                                                                <p className="text-[12px] text-foreground/70 leading-relaxed">{(step || '').replace(/\u2014/g, ' - ').replace(/\u2013/g, '-')}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {tech.sparringTip && (
                                                    <div className="rounded-xl bg-primary/5 px-3 py-2">
                                                        <p className="text-[12px] text-foreground/75 leading-relaxed">
                                                            <span className="font-medium text-primary/70">Sparring tip</span> {(tech.sparringTip || '').replace(/\u2014/g, ' - ').replace(/\u2013/g, '-')}
                                                        </p>
                                                    </div>
                                                )}

                                                {tech.drillFlow && tech.drillFlow.length > 0 && (
                                                    <div className="flex items-center gap-1 flex-wrap mt-2">
                                                        {tech.drillFlow.map((step, k) => (
                                                            <div key={k} className="flex items-center gap-1">
                                                                {k > 0 && <span className="text-muted-foreground/30 text-[10px]">→</span>}
                                                                <span className="text-[11px] text-foreground/75 bg-muted/20 rounded-lg px-2 py-0.5">{step}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
