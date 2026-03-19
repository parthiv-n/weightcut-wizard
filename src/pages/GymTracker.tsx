import { useState, useCallback, useRef } from "react";
import { motion } from "motion/react";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { Dumbbell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  return (
    <div className="space-y-4 p-4 sm:p-5 md:p-6 max-w-7xl mx-auto pb-20 md:pb-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <div className="h-10 w-10 rounded-2xl bg-primary/15 flex items-center justify-center">
          <Dumbbell className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-xl font-bold">Gym Tracker</h1>
      </motion.div>

      {activeSession ? (
        /* Active workout */
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
      ) : (
        /* No active session — show start button + history */
        <motion.div
          variants={staggerContainer(60)}
          initial="hidden"
          animate="visible"
          className="space-y-4"
        >
          {/* Start workout */}
          <motion.div variants={staggerItem} className="glass-card rounded-2xl border border-border/50 p-4 space-y-3">
            <h2 className="font-semibold text-sm">Start Workout</h2>
            <div className="flex gap-2">
              <Select value={sessionType} onValueChange={(v) => setSessionType(v as SessionType)}>
                <SelectTrigger className="flex-1 h-11">
                  <SelectValue placeholder="Session type" />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleStartWorkout} className="h-11 gap-2 px-6">
                <Plus className="h-4 w-4" />
                Start
              </Button>
            </div>
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
