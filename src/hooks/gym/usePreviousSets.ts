import { useMemo } from "react";
import type { ActiveWorkout, GymSet, SessionWithSets } from "@/pages/gym/types";

// Derives, for each exercise in the current active workout, the working sets
// from the most recent *different* completed session containing that exercise.
// Pure transformation over already-cached history — no network calls.
export function usePreviousSets(
  activeSession: ActiveWorkout | null,
  history: SessionWithSets[],
): Map<string, GymSet[]> {
  return useMemo(() => {
    const map = new Map<string, GymSet[]>();
    if (!activeSession) return map;

    for (const group of activeSession.exerciseGroups) {
      for (const session of history) {
        if (session.id === activeSession.sessionId) continue;
        const prevGroup = session.exerciseGroups.find(
          g => g.exercise.id === group.exercise.id,
        );
        if (prevGroup) {
          map.set(
            group.exercise.id,
            prevGroup.sets.filter(s => !s.is_warmup),
          );
          break;
        }
      }
    }

    return map;
  }, [activeSession, history]);
}
