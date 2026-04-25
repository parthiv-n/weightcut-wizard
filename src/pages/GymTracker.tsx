import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, ChevronRight, List, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useGymSessions } from "@/hooks/gym/useGymSessions";
import { useGymSets } from "@/hooks/gym/useGymSets";
import { useExerciseLibrary } from "@/hooks/gym/useExerciseLibrary";
import { useExercisePRs } from "@/hooks/gym/useExercisePRs";
import { useGymAnalytics } from "@/hooks/gym/useGymAnalytics";
import { usePreviousSets } from "@/hooks/gym/usePreviousSets";
import { useRoutines } from "@/hooks/gym/useRoutines";
import { ActiveSessionView } from "@/components/gym/ActiveSessionView";
import { SessionHistoryList } from "@/components/gym/SessionHistoryList";
import { SessionHistoryCalendar } from "@/components/gym/SessionHistoryCalendar";
import { SessionDetailSheet } from "@/components/gym/SessionDetailSheet";
import { SessionAnalyticsCard } from "@/components/gym/SessionAnalyticsCard";
import { ExercisePickerSheet } from "@/components/gym/ExercisePickerSheet";
import { ExerciseStatsSheet } from "@/components/gym/ExerciseStatsSheet";
import { CreateExerciseDialog } from "@/components/gym/CreateExerciseDialog";
import { RoutineLibrary } from "@/components/gym/RoutineLibrary";
import { RoutineGeneratorSheet } from "@/components/gym/RoutineGeneratorSheet";
import { ManualRoutineSheet } from "@/components/gym/ManualRoutineSheet";
import { SESSION_TYPES } from "@/data/exerciseDatabase";
import { triggerHaptic } from "@/lib/haptics";
import { useAITask } from "@/contexts/AITaskContext";
import { AICompactOverlay } from "@/components/AICompactOverlay";
import { ImpactStyle } from "@capacitor/haptics";
import type { SessionType, SessionWithSets, Exercise, SavedRoutine } from "@/pages/gym/types";

type GymTab = "workouts" | "routines" | "progress";
type HistoryView = "list" | "calendar";
const HISTORY_VIEW_KEY = "wcw_gym_history_view";

export default function GymTracker() {
  const { toast } = useToast();
  const {
    history, historyLoading, activeSession,
    startSession, finishSession, discardSession,
    deleteSession, updateActiveSession,
    updateCompletedSet, deleteCompletedSet,
  } = useGymSessions();

  const {
    addExerciseToSession, removeExerciseFromSession,
    addSet, updateSet, deleteSet, duplicateLastSet,
  } = useGymSets({ activeSession, updateActiveSession });

  const { exercises, filteredExercises, loading: exercisesLoading, addCustomExercise } = useExerciseLibrary();
  const { prs, checkAndUpdatePR, getPRForExercise } = useExercisePRs();
  const { analytics, fetchExerciseHistory } = useGymAnalytics(history);
  const previousSetsMap = usePreviousSets(activeSession, history);
  const {
    routines, routinesLoading, generatingRoutine,
    generateRoutine, saveRoutine, deleteRoutine, renameRoutine,
  } = useRoutines();

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<GymTab>(() => searchParams.get("tab") === "routines" ? "routines" : "workouts");
  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false);
  const [detailSession, setDetailSession] = useState<SessionWithSets | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statsExercise, setStatsExercise] = useState<Exercise | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [sessionType, setSessionType] = useState<SessionType>("Strength");
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [manualRoutineOpen, setManualRoutineOpen] = useState(false);
  const [historyView, setHistoryView] = useState<HistoryView>(() => {
    try {
      return (localStorage.getItem(HISTORY_VIEW_KEY) as HistoryView) === "calendar" ? "calendar" : "list";
    } catch {
      return "list";
    }
  });
  useEffect(() => {
    try { localStorage.setItem(HISTORY_VIEW_KEY, historyView); } catch { /* ignore */ }
  }, [historyView]);
  const newPRSetIdsRef = useRef(new Set<string>());

  const [startingWorkout, setStartingWorkout] = useState(false);
  const handleStartWorkout = useCallback(async () => {
    if (startingWorkout) return; // Debounce double-tap
    setStartingWorkout(true);
    try {
      await startSession(sessionType);
      // startSession surfaces its own error toast with the underlying message;
      // no need for a second generic toast here.
    } finally {
      setStartingWorkout(false);
    }
  }, [startSession, sessionType, startingWorkout]);

  const handleStartFromRoutine = useCallback(async (routine: SavedRoutine, dayFilter?: string) => {
    if (exercisesLoading) {
      toast({ description: "Loading exercises, please try again", variant: "destructive" });
      return;
    }

    const typeMap: Record<string, SessionType> = {
      hypertrophy: "Hypertrophy",
      strength: "Strength",
      explosiveness: "Explosiveness",
      conditioning: "Conditioning",
      powerlifting: "Powerlifting",
      circuit: "Circuit",
      endurance: "Endurance",
      mobility: "Mobility",
    };
    const sType = typeMap[routine.goal] || "Strength";
    const sessionId = await startSession(sType as SessionType);
    if (!sessionId) {
      toast({ description: "Failed to start session", variant: "destructive" });
      return;
    }

    // Filter exercises by day if specified
    const routineExercises = dayFilter
      ? routine.exercises.filter(re => re.day === dayFilter)
      : routine.exercises;

    if (routineExercises.length === 0) {
      toast({ description: "No exercises in this routine", variant: "destructive" });
      discardSession();
      return;
    }

    // Map muscle group to valid ExerciseCategory
    const muscleToCategory = (mg: string): import("@/pages/gym/types").ExerciseCategory => {
      const m = mg.toLowerCase();
      if (["chest", "shoulders", "triceps"].includes(m)) return "push";
      if (["back", "biceps", "lats"].includes(m)) return "pull";
      if (["legs", "quads", "hamstrings", "glutes", "calves"].includes(m)) return "legs";
      if (["core", "abs", "obliques"].includes(m)) return "core";
      if (["cardio"].includes(m)) return "cardio";
      return "full_body";
    };

    // Import routine exercises into the workout with empty sets
    const groups: import("@/pages/gym/types").ExerciseGroup[] = routineExercises.map((re, idx) => {
      const matched = (re.exercise_id && exercises.find(e => e.id === re.exercise_id))
        || exercises.find(e => e.name.toLowerCase() === re.name.toLowerCase());

      const exercise: import("@/pages/gym/types").Exercise = matched || {
        id: re.exercise_id || `routine-${idx}`,
        user_id: null,
        name: re.name,
        category: muscleToCategory(re.muscle_group),
        muscle_group: re.muscle_group,
        equipment: null,
        is_bodyweight: false,
        is_custom: false,
        created_at: new Date().toISOString(),
      };

      return {
        exercise,
        exerciseOrder: idx + 1,
        sets: [],
      };
    });

    updateActiveSession(prev => ({ ...prev, exerciseGroups: groups }));
    setTab("workouts");
  }, [startSession, exercises, exercisesLoading, updateActiveSession, discardSession, toast]);

  const handleAddSet = useCallback(async (exerciseOrder: number, data: any) => {
    const set = await addSet(exerciseOrder, data);
    if (set) {
      const prRecords = await checkAndUpdatePR(set);
      if (prRecords.length > 0) {
        newPRSetIdsRef.current.add(set.id);
      }
    }
  }, [addSet, checkAndUpdatePR]);

  const handleExerciseSelect = useCallback((exercise: Exercise) => {
    addExerciseToSession(exercise);
  }, [addExerciseToSession]);

  const handleSessionTap = useCallback((session: SessionWithSets) => {
    setDetailSession(session);
    setDetailOpen(true);
  }, []);

  const handleExerciseTap = useCallback((exerciseId: string) => {
    const exercise = exercises.find(e => e.id === exerciseId);
    if (exercise) {
      setStatsExercise(exercise);
      setStatsOpen(true);
    }
  }, [exercises]);

  // When history refreshes (after edits), re-sync the open detail session by id
  // so inline weight/reps edits become visible without re-opening the sheet.
  useEffect(() => {
    if (!detailOpen || !detailSession) return;
    const fresh = history.find(s => s.id === detailSession.id);
    if (fresh && fresh !== detailSession) setDetailSession(fresh);
  }, [history, detailOpen, detailSession]);

  const { tasks: aiTasks, dismissTask: aiDismiss } = useAITask();
  const gymAiTask = aiTasks.find(t => t.status === "running" && t.type === "gym-routine");

  // Detect completed AI routine generation (e.g. user navigated away during generation)
  const [completedRoutineResult, setCompletedRoutineResult] = useState<any>(null);
  const handledTaskRef = useRef<string | null>(null);
  useEffect(() => {
    const completedTask = aiTasks.find(
      t => t.status === "done" && t.type === "gym-routine" && t.result?.exercises
    );
    if (completedTask && handledTaskRef.current !== completedTask.id) {
      handledTaskRef.current = completedTask.id;
      setCompletedRoutineResult(completedTask.result);
      setTab("routines");
      setGeneratorOpen(true);
      // Dismiss after a short delay to ensure state is applied first
      setTimeout(() => aiDismiss(completedTask.id), 100);
    }
  }, [aiTasks, aiDismiss]);

  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const weeklyVolume = analytics.weeklyVolumes.length > 0
    ? analytics.weeklyVolumes[analytics.weeklyVolumes.length - 1].volume
    : 0;
  const formatVol = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`;

  return (
    <div className="animate-page-in space-y-2.5 px-5 py-3 sm:p-5 md:p-6 max-w-7xl mx-auto md:pb-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}>
      {gymAiTask && (
        <AICompactOverlay
          isOpen={true}
          isGenerating={true}
          steps={gymAiTask.steps}
            startedAt={gymAiTask.startedAt}          title={gymAiTask.label}
          onCancel={() => aiDismiss(gymAiTask.id)}
        />
      )}
      <div className="space-y-3">
        {/* Header */}
        <div>
          <p className="text-[13px] text-muted-foreground font-medium uppercase tracking-widest mb-0.5">{todayLabel}</p>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Gym
          </h1>
        </div>

        {/* Tab switcher — always visible */}
        <div className="flex gap-1 p-1 rounded-2xl bg-muted/30 border border-border">
          <button
            onClick={() => { setTab("workouts"); triggerHaptic(ImpactStyle.Light); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all relative ${
              tab === "workouts"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Workouts
            {activeSession && (
              <span className="absolute top-1.5 right-2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab("routines"); triggerHaptic(ImpactStyle.Light); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === "routines"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Routines
          </button>
          <button
            onClick={() => { setTab("progress"); triggerHaptic(ImpactStyle.Light); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === "progress"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            Progress
          </button>
        </div>

        {/* Tab content */}
        {tab === "workouts" ? (
          activeSession ? (
            <ActiveSessionView
              workout={activeSession}
              exercises={exercises}
              prs={prs}
              newPRSetIds={newPRSetIdsRef.current}
              previousSetsMap={previousSetsMap}
              onOpenExercisePicker={() => setExercisePickerOpen(true)}
              onAddSet={handleAddSet}
              onUpdateSet={updateSet}
              onDeleteSet={deleteSet}
              onDuplicateLastSet={duplicateLastSet}
              onRemoveExercise={removeExerciseFromSession}
              onFinish={finishSession}
              onDiscard={discardSession}
              onExerciseTap={handleExerciseTap}
            />
          ) : (
            <>
              {/* Quick stats row */}
              {analytics.totalSessions > 0 && (
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="card-surface rounded-2xl border border-border p-3 text-center">
                    <div className="display-number text-lg">{analytics.sessionsThisWeek}</div>
                    <div className="text-[13px] text-muted-foreground mt-0.5">This Week</div>
                  </div>
                  <div className="card-surface rounded-2xl border border-border p-3 text-center">
                    <div className="display-number text-lg">{analytics.avgDuration}<span className="text-xs text-muted-foreground font-normal">m</span></div>
                    <div className="text-[13px] text-muted-foreground mt-0.5">Avg Duration</div>
                  </div>
                  <div className="card-surface rounded-2xl border border-border p-3 text-center">
                    <div className="display-number text-lg">{formatVol(weeklyVolume)}<span className="text-xs text-muted-foreground font-normal">kg</span></div>
                    <div className="text-[13px] text-muted-foreground mt-0.5">Week Volume</div>
                  </div>
                </div>
              )}

              {/* Start workout card */}
              <div className="card-surface rounded-2xl border border-border p-3 space-y-2.5">
                <h2 className="font-semibold text-sm">Start Workout</h2>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1 snap-x snap-mandatory" style={{ WebkitOverflowScrolling: "touch" } as any}>
                  {SESSION_TYPES.map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        setSessionType(t as SessionType);
                        triggerHaptic(ImpactStyle.Light);
                      }}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-[13px] font-semibold transition-all snap-start ${
                        sessionType === t
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted/40 text-muted-foreground active:bg-muted/60"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleStartWorkout}
                  disabled={startingWorkout}
                  className="w-full h-12 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))" }}
                >
                  <Plus className="h-4.5 w-4.5" />
                  {startingWorkout ? "Starting..." : "Start Workout"}
                </button>
              </div>

              {/* Analytics card */}
              <SessionAnalyticsCard
                sessionsThisWeek={analytics.sessionsThisWeek}
                avgDuration={analytics.avgDuration}
                totalSessions={analytics.totalSessions}
                mostTrainedMuscle={analytics.mostTrainedMuscle}
                weeklyVolumes={analytics.weeklyVolumes}
              />

              {/* Session history */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-sm">Workout History</h2>
                  <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-muted/40 border border-border/30">
                    <button
                      onClick={() => { setHistoryView("list"); triggerHaptic(ImpactStyle.Light); }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-all ${
                        historyView === "list"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground"
                      }`}
                      aria-label="List view"
                    >
                      <List className="h-3 w-3" />
                      List
                    </button>
                    <button
                      onClick={() => { setHistoryView("calendar"); triggerHaptic(ImpactStyle.Light); }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-all ${
                        historyView === "calendar"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground"
                      }`}
                      aria-label="Calendar view"
                    >
                      <CalendarDays className="h-3 w-3" />
                      Calendar
                    </button>
                  </div>
                </div>
                {historyView === "list" ? (
                  <SessionHistoryList
                    sessions={history}
                    loading={historyLoading}
                    onSessionTap={handleSessionTap}
                  />
                ) : (
                  <SessionHistoryCalendar
                    sessions={history}
                    loading={historyLoading}
                    onSessionTap={handleSessionTap}
                  />
                )}
              </div>
            </>
          )
        ) : tab === "routines" ? (
          /* Routines tab */
          <RoutineLibrary
            routines={routines}
            loading={routinesLoading}
            onDelete={deleteRoutine}
            onRename={renameRoutine}
            onStartWorkout={handleStartFromRoutine}
            onOpenGenerator={() => setGeneratorOpen(true)}
            onOpenManualCreator={() => setManualRoutineOpen(true)}
          />
        ) : (
          /* Progress tab — only exercises with actual logged sets */
          (() => {
            // Derive unique exercises from completed session history — track best set (heaviest weight + its reps)
            const exerciseStats = new Map<string, { bestWeight: number; bestReps: number; exercise: typeof exercises[number] | undefined }>();
            for (const session of history) {
              for (const group of session.exerciseGroups) {
                for (const set of group.sets) {
                  if (set.is_warmup) continue;
                  const w = set.weight_kg ?? 0;
                  const r = set.reps ?? 0;
                  const prev = exerciseStats.get(group.exercise.id);
                  if (!prev) {
                    exerciseStats.set(group.exercise.id, { bestWeight: w, bestReps: r, exercise: exercises.find(e => e.id === group.exercise.id) || group.exercise as any });
                  } else if (w > prev.bestWeight) {
                    // New best weight — use this set's reps
                    prev.bestWeight = w;
                    prev.bestReps = r;
                  } else if (w === prev.bestWeight && r > prev.bestReps) {
                    // Same weight, more reps
                    prev.bestReps = r;
                  }
                }
              }
            }
            const loggedExercises = Array.from(exerciseStats.entries())
              .map(([id, stats]) => ({ id, exercise: stats.exercise!, bestWeight: stats.bestWeight, bestReps: stats.bestReps }))
              .filter(item => !!item.exercise);

            return (
              <div className="space-y-1">
                {loggedExercises.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-[13px] text-muted-foreground">No exercises logged yet</p>
                    <p className="text-[13px] text-muted-foreground/60 mt-0.5">Complete a workout to see your progress</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20">
                    {loggedExercises.map(({ id, exercise: ex, bestWeight, bestReps }) => (
                      <button
                        key={id}
                        onClick={() => { setStatsExercise(ex); setStatsOpen(true); triggerHaptic(ImpactStyle.Light); }}
                        className="w-full flex items-center gap-2.5 px-2 py-2 active:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate">{ex.name}</p>
                          <p className="text-[13px] text-muted-foreground">{ex.muscle_group?.replace("_", " ")}</p>
                        </div>
                        <div className="flex items-center gap-2 text-[13px] tabular-nums text-muted-foreground shrink-0">
                          {bestWeight > 0 ? (
                            <span><span className="font-semibold text-foreground">{bestWeight}</span>kg <span className="text-muted-foreground/60">× {bestReps}</span></span>
                          ) : bestReps > 0 ? (
                            <span><span className="font-semibold text-foreground">{bestReps}</span> reps</span>
                          ) : null}
                        </div>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>

      {/* Sheets + dialogs */}
      <ExercisePickerSheet
        open={exercisePickerOpen}
        onOpenChange={setExercisePickerOpen}
        exercises={exercises}
        loading={exercisesLoading}
        onSelect={handleExerciseSelect}
        onCreateCustom={() => setCreateExerciseOpen(true)}
      />

      <CreateExerciseDialog
        open={createExerciseOpen}
        onOpenChange={setCreateExerciseOpen}
        onSubmit={addCustomExercise}
      />

      <SessionDetailSheet
        session={detailSession}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onDelete={deleteSession}
        onUpdateSet={updateCompletedSet}
        onDeleteSet={deleteCompletedSet}
      />

      <ExerciseStatsSheet
        exercise={statsExercise}
        pr={statsExercise ? getPRForExercise(statsExercise.id) : null}
        open={statsOpen}
        onOpenChange={setStatsOpen}
        fetchHistory={fetchExerciseHistory}
      />

      <RoutineGeneratorSheet
        open={generatorOpen}
        onOpenChange={(open) => {
          setGeneratorOpen(open);
          if (!open) setCompletedRoutineResult(null);
        }}
        onGenerate={generateRoutine}
        onSave={saveRoutine}
        generating={generatingRoutine}
        completedResult={completedRoutineResult}
      />

      <ManualRoutineSheet
        open={manualRoutineOpen}
        onOpenChange={setManualRoutineOpen}
        exercises={exercises}
        onSave={saveRoutine}
      />
    </div>
  );
}
