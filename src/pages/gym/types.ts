export type ExerciseCategory = "push" | "pull" | "legs" | "core" | "cardio" | "full_body";

export type MuscleGroup =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps"
  | "quads" | "hamstrings" | "glutes" | "calves" | "abs"
  | "forearms" | "traps" | "full_body" | "cardio";

export type Equipment =
  | "barbell" | "dumbbell" | "cable" | "machine"
  | "bodyweight" | "kettlebell" | "bands" | "none";

export type SessionType =
  | "Strength" | "Conditioning" | "Muay Thai S&C"
  | "Hypertrophy" | "Powerlifting" | "Circuit" | "Custom";

export type SessionStatus = "in_progress" | "completed";

export interface Exercise {
  id: string;
  user_id: string | null;
  name: string;
  category: ExerciseCategory;
  muscle_group: MuscleGroup;
  equipment: Equipment | null;
  is_bodyweight: boolean;
  is_custom: boolean;
  created_at: string;
}

export interface GymSession {
  id: string;
  user_id: string;
  date: string;
  session_type: SessionType;
  duration_minutes: number | null;
  notes: string | null;
  perceived_fatigue: number | null;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export interface GymSet {
  id: string;
  session_id: string;
  exercise_id: string;
  user_id: string;
  set_order: number;
  exercise_order: number;
  weight_kg: number | null;
  reps: number;
  rpe: number | null;
  is_warmup: boolean;
  is_bodyweight: boolean;
  assisted_weight_kg: number | null;
  notes: string | null;
  created_at: string;
}

export interface ExercisePR {
  id: string;
  user_id: string;
  exercise_id: string;
  max_weight_kg: number | null;
  max_reps: number | null;
  max_volume: number | null;
  estimated_1rm: number | null;
  best_set_id: string | null;
  updated_at: string;
}

export interface ExerciseGroup {
  exercise: Exercise;
  exerciseOrder: number;
  sets: GymSet[];
}

export interface ActiveWorkout {
  sessionId: string;
  sessionType: SessionType;
  startedAt: number;
  exerciseGroups: ExerciseGroup[];
}

export interface SessionWithSets extends GymSession {
  sets: GymSet[];
  exercises: Exercise[];
  exerciseGroups: ExerciseGroup[];
  totalVolume: number;
  exerciseCount: number;
}

export type PRType = "weight" | "reps" | "volume" | "1rm";

export interface PRRecord {
  type: PRType;
  value: number;
  previousValue: number | null;
}
