import { useState, useCallback, useRef } from "react";
import { motion } from "motion/react";
import { staggerContainer, staggerItem, springs } from "@/lib/motion";
import { Dumbbell, Plus, Calendar, Clock, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGymSessions } from "@/hooks/gym/useGymSessions";
import { useGymSets } from "@/hooks/gym/useGymSets";
import { useExerciseLibrary } from "@/hooks/gym/useExerciseLibrary";
import { useExercisePRs } from "@/hooks/gym/useExercisePRs";
import { useGymAnalytics } from "@/hooks/gym/useGymAnalytics";
import { ActiveSessionView } from "@/components/gym/ActiveSessionView";
import { SessionHistoryList } from "@/components/gym/SessionHistoryList";
import { SessionDetailSheet } from "@/components/gym/SessionDetailSheet";
import { SessionAnalyticsCard } from "@/components/gym/SessionAnalyticsCard";
import { ExercisePickerSheet } from "@/components/gym/ExercisePickerSheet";
import { ExerciseStatsSheet } from "@/components/gym/ExerciseStatsSheet";
import { CreateExerciseDialog } from "@/components/gym/CreateExerciseDialog";
import { SESSION_TYPES } from "@/data/exerciseDatabase";
import { triggerHaptic } from "@/lib/haptics";
import { ImpactStyle } from "@capacitor/haptics";
import type { SessionType, SessionWithSets, Exercise } from "@/pages/gym/types";

export default function GymTracker() {
  const {
    history, historyLoading, activeSession,
    startSession, finishSession, discardSession,
    deleteSession, updateActiveSession,
  } = useGymSessions();

  const {
    addExerciseToSession, removeExerciseFromSession,
    addSet, updateSet, deleteSet, duplicateLastSet,
  } = useGymSets({ activeSession, updateActiveSession });

  const { exercises, filteredExercises, loading: exercisesLoading, addCustomExercise } = useExerciseLibrary();
  const { prs, checkAndUpdatePR, getPRForExercise } = useExercisePRs();
  const { analytics, fetchExerciseHistory } = useGymAnalytics(history);

  const [exercisePickerOpen, setExercisePickerOpen] = useState(false);
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false);
  const [detailSession, setDetailSession] = useState<SessionWithSets | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statsExercise, setStatsExercise] = useState<Exercise | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [sessionType, setSessionType] = useState<SessionType>("Strength");
  const newPRSetIdsRef = useRef(new Set<string>());

  const handleStartWorkout = useCallback(async () => {
    await startSession(sessionType);
  }, [startSession, sessionType]);

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

  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long" });

  const weeklyVolume = analytics.weeklyVolumes.length > 0
    ? analytics.weeklyVolumes[analytics.weeklyVolumes.length - 1].volume
    : 0;
  const formatVol = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`;

  return (
    <div className="space-y-3 p-4 sm:p-5 md:p-6 max-w-7xl mx-auto pb-20 md:pb-6">
      {activeSession ? (
        <>
          {/* Header for active session */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springs.gentle}
            className="flex items-center gap-3"
          >
            <div className="h-10 w-10 rounded-2xl bg-primary/15 flex items-center justify-center">
              <Dumbbell className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold">Gym Tracker</h1>
          </motion.div>

          <ActiveSessionView
            workout={activeSession}
            exercises={exercises}
            prs={prs}
            newPRSetIds={newPRSetIdsRef.current}
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
        </>
      ) : (
        <motion.div
          variants={staggerContainer(60)}
          initial="hidden"
          animate="visible"
          className="space-y-5"
        >
          {/* Premium header */}
          <motion.div variants={staggerItem}>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mb-1">{todayLabel}</p>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
              Gym
            </h1>
          </motion.div>

          {/* Quick stats row */}
          {analytics.totalSessions > 0 && (
            <motion.div variants={staggerItem} className="grid grid-cols-3 gap-2.5">
              <div className="glass-card rounded-xl border border-border/50 p-3 text-center">
                <Calendar className="h-3.5 w-3.5 text-primary mx-auto mb-1.5" />
                <div className="display-number text-lg">{analytics.sessionsThisWeek}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">This Week</div>
              </div>
              <div className="glass-card rounded-xl border border-border/50 p-3 text-center">
                <Clock className="h-3.5 w-3.5 text-primary mx-auto mb-1.5" />
                <div className="display-number text-lg">{analytics.avgDuration}<span className="text-xs text-muted-foreground font-normal">m</span></div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Avg Duration</div>
              </div>
              <div className="glass-card rounded-xl border border-border/50 p-3 text-center">
                <Flame className="h-3.5 w-3.5 text-orange-400 mx-auto mb-1.5" />
                <div className="display-number text-lg">{formatVol(weeklyVolume)}<span className="text-xs text-muted-foreground font-normal">kg</span></div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Week Volume</div>
              </div>
            </motion.div>
          )}

          {/* Start workout card */}
          <motion.div variants={staggerItem} className="glass-card rounded-2xl border border-border/50 p-4 space-y-4">
            <h2 className="font-semibold text-sm">Start Workout</h2>

            {/* Session type pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
              {SESSION_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setSessionType(t as SessionType);
                    triggerHaptic(ImpactStyle.Light);
                  }}
                  className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 ${
                    sessionType === t
                      ? "bg-gradient-to-r from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/25"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted active:scale-95"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Start button */}
            <button
              onClick={handleStartWorkout}
              className="w-full h-12 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))" }}
            >
              <Plus className="h-4.5 w-4.5" />
              Start Workout
            </button>
          </motion.div>

          {/* Analytics card */}
          <SessionAnalyticsCard
            sessionsThisWeek={analytics.sessionsThisWeek}
            avgDuration={analytics.avgDuration}
            totalSessions={analytics.totalSessions}
            mostTrainedMuscle={analytics.mostTrainedMuscle}
            weeklyVolumes={analytics.weeklyVolumes}
          />

          {/* Session history */}
          <motion.div variants={staggerItem}>
            <h2 className="font-semibold text-sm mb-3">Workout History</h2>
            <SessionHistoryList
              sessions={history}
              loading={historyLoading}
              onSessionTap={handleSessionTap}
            />
          </motion.div>
        </motion.div>
      )}

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
      />

      <ExerciseStatsSheet
        exercise={statsExercise}
        pr={statsExercise ? getPRForExercise(statsExercise.id) : null}
        open={statsOpen}
        onOpenChange={setStatsOpen}
        fetchHistory={fetchExerciseHistory}
      />
    </div>
  );
}
