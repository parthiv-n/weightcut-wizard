import type { ExerciseCategory, MuscleGroup, Equipment } from "@/pages/gym/types";

export interface SeedExercise {
  name: string;
  category: ExerciseCategory;
  muscle_group: MuscleGroup;
  equipment: Equipment | null;
  is_bodyweight: boolean;
}

export const EXERCISE_DATABASE: SeedExercise[] = [
  // Chest (Push)
  { name: "Barbell Bench Press", category: "push", muscle_group: "chest", equipment: "barbell", is_bodyweight: false },
  { name: "Incline Barbell Bench Press", category: "push", muscle_group: "chest", equipment: "barbell", is_bodyweight: false },
  { name: "Dumbbell Bench Press", category: "push", muscle_group: "chest", equipment: "dumbbell", is_bodyweight: false },
  { name: "Incline Dumbbell Press", category: "push", muscle_group: "chest", equipment: "dumbbell", is_bodyweight: false },
  { name: "Decline Bench Press", category: "push", muscle_group: "chest", equipment: "barbell", is_bodyweight: false },
  { name: "Dumbbell Flyes", category: "push", muscle_group: "chest", equipment: "dumbbell", is_bodyweight: false },
  { name: "Cable Flyes", category: "push", muscle_group: "chest", equipment: "cable", is_bodyweight: false },
  { name: "Machine Chest Press", category: "push", muscle_group: "chest", equipment: "machine", is_bodyweight: false },
  { name: "Push-Up", category: "push", muscle_group: "chest", equipment: "bodyweight", is_bodyweight: true },
  { name: "Dips (Chest)", category: "push", muscle_group: "chest", equipment: "bodyweight", is_bodyweight: true },
  // Shoulders (Push)
  { name: "Overhead Press", category: "push", muscle_group: "shoulders", equipment: "barbell", is_bodyweight: false },
  { name: "Dumbbell Shoulder Press", category: "push", muscle_group: "shoulders", equipment: "dumbbell", is_bodyweight: false },
  { name: "Arnold Press", category: "push", muscle_group: "shoulders", equipment: "dumbbell", is_bodyweight: false },
  { name: "Lateral Raise", category: "push", muscle_group: "shoulders", equipment: "dumbbell", is_bodyweight: false },
  { name: "Cable Lateral Raise", category: "push", muscle_group: "shoulders", equipment: "cable", is_bodyweight: false },
  { name: "Front Raise", category: "push", muscle_group: "shoulders", equipment: "dumbbell", is_bodyweight: false },
  { name: "Face Pull", category: "pull", muscle_group: "shoulders", equipment: "cable", is_bodyweight: false },
  { name: "Reverse Pec Deck", category: "pull", muscle_group: "shoulders", equipment: "machine", is_bodyweight: false },
  { name: "Upright Row", category: "push", muscle_group: "shoulders", equipment: "barbell", is_bodyweight: false },
  { name: "Machine Shoulder Press", category: "push", muscle_group: "shoulders", equipment: "machine", is_bodyweight: false },
  // Triceps (Push)
  { name: "Tricep Pushdown", category: "push", muscle_group: "triceps", equipment: "cable", is_bodyweight: false },
  { name: "Overhead Tricep Extension", category: "push", muscle_group: "triceps", equipment: "cable", is_bodyweight: false },
  { name: "Skull Crushers", category: "push", muscle_group: "triceps", equipment: "barbell", is_bodyweight: false },
  { name: "Close-Grip Bench Press", category: "push", muscle_group: "triceps", equipment: "barbell", is_bodyweight: false },
  { name: "Dips (Triceps)", category: "push", muscle_group: "triceps", equipment: "bodyweight", is_bodyweight: true },
  { name: "Dumbbell Kickbacks", category: "push", muscle_group: "triceps", equipment: "dumbbell", is_bodyweight: false },
  // Back (Pull)
  { name: "Barbell Row", category: "pull", muscle_group: "back", equipment: "barbell", is_bodyweight: false },
  { name: "Dumbbell Row", category: "pull", muscle_group: "back", equipment: "dumbbell", is_bodyweight: false },
  { name: "Seated Cable Row", category: "pull", muscle_group: "back", equipment: "cable", is_bodyweight: false },
  { name: "Lat Pulldown", category: "pull", muscle_group: "back", equipment: "cable", is_bodyweight: false },
  { name: "Pull-Up", category: "pull", muscle_group: "back", equipment: "bodyweight", is_bodyweight: true },
  { name: "Chin-Up", category: "pull", muscle_group: "back", equipment: "bodyweight", is_bodyweight: true },
  { name: "T-Bar Row", category: "pull", muscle_group: "back", equipment: "barbell", is_bodyweight: false },
  { name: "Pendlay Row", category: "pull", muscle_group: "back", equipment: "barbell", is_bodyweight: false },
  { name: "Machine Row", category: "pull", muscle_group: "back", equipment: "machine", is_bodyweight: false },
  { name: "Straight Arm Pulldown", category: "pull", muscle_group: "back", equipment: "cable", is_bodyweight: false },
  { name: "Deadlift", category: "pull", muscle_group: "back", equipment: "barbell", is_bodyweight: false },
  // Biceps (Pull)
  { name: "Barbell Curl", category: "pull", muscle_group: "biceps", equipment: "barbell", is_bodyweight: false },
  { name: "Dumbbell Curl", category: "pull", muscle_group: "biceps", equipment: "dumbbell", is_bodyweight: false },
  { name: "Hammer Curl", category: "pull", muscle_group: "biceps", equipment: "dumbbell", is_bodyweight: false },
  { name: "Preacher Curl", category: "pull", muscle_group: "biceps", equipment: "barbell", is_bodyweight: false },
  { name: "Cable Curl", category: "pull", muscle_group: "biceps", equipment: "cable", is_bodyweight: false },
  { name: "Incline Dumbbell Curl", category: "pull", muscle_group: "biceps", equipment: "dumbbell", is_bodyweight: false },
  { name: "Concentration Curl", category: "pull", muscle_group: "biceps", equipment: "dumbbell", is_bodyweight: false },
  { name: "EZ-Bar Curl", category: "pull", muscle_group: "biceps", equipment: "barbell", is_bodyweight: false },
  // Traps
  { name: "Barbell Shrug", category: "pull", muscle_group: "traps", equipment: "barbell", is_bodyweight: false },
  { name: "Dumbbell Shrug", category: "pull", muscle_group: "traps", equipment: "dumbbell", is_bodyweight: false },
  { name: "Rack Pull", category: "pull", muscle_group: "traps", equipment: "barbell", is_bodyweight: false },
  // Forearms
  { name: "Wrist Curl", category: "pull", muscle_group: "forearms", equipment: "barbell", is_bodyweight: false },
  { name: "Reverse Wrist Curl", category: "pull", muscle_group: "forearms", equipment: "barbell", is_bodyweight: false },
  { name: "Farmer's Walk", category: "pull", muscle_group: "forearms", equipment: "dumbbell", is_bodyweight: false },
  // Quads (Legs)
  { name: "Barbell Squat", category: "legs", muscle_group: "quads", equipment: "barbell", is_bodyweight: false },
  { name: "Front Squat", category: "legs", muscle_group: "quads", equipment: "barbell", is_bodyweight: false },
  { name: "Leg Press", category: "legs", muscle_group: "quads", equipment: "machine", is_bodyweight: false },
  { name: "Leg Extension", category: "legs", muscle_group: "quads", equipment: "machine", is_bodyweight: false },
  { name: "Hack Squat", category: "legs", muscle_group: "quads", equipment: "machine", is_bodyweight: false },
  { name: "Bulgarian Split Squat", category: "legs", muscle_group: "quads", equipment: "dumbbell", is_bodyweight: false },
  { name: "Goblet Squat", category: "legs", muscle_group: "quads", equipment: "dumbbell", is_bodyweight: false },
  { name: "Lunges", category: "legs", muscle_group: "quads", equipment: "dumbbell", is_bodyweight: false },
  { name: "Walking Lunges", category: "legs", muscle_group: "quads", equipment: "dumbbell", is_bodyweight: false },
  { name: "Pistol Squat", category: "legs", muscle_group: "quads", equipment: "bodyweight", is_bodyweight: true },
  // Hamstrings (Legs)
  { name: "Romanian Deadlift", category: "legs", muscle_group: "hamstrings", equipment: "barbell", is_bodyweight: false },
  { name: "Leg Curl", category: "legs", muscle_group: "hamstrings", equipment: "machine", is_bodyweight: false },
  { name: "Stiff-Leg Deadlift", category: "legs", muscle_group: "hamstrings", equipment: "barbell", is_bodyweight: false },
  { name: "Good Morning", category: "legs", muscle_group: "hamstrings", equipment: "barbell", is_bodyweight: false },
  { name: "Nordic Hamstring Curl", category: "legs", muscle_group: "hamstrings", equipment: "bodyweight", is_bodyweight: true },
  { name: "Dumbbell Romanian Deadlift", category: "legs", muscle_group: "hamstrings", equipment: "dumbbell", is_bodyweight: false },
  // Glutes (Legs)
  { name: "Hip Thrust", category: "legs", muscle_group: "glutes", equipment: "barbell", is_bodyweight: false },
  { name: "Cable Kickback", category: "legs", muscle_group: "glutes", equipment: "cable", is_bodyweight: false },
  { name: "Glute Bridge", category: "legs", muscle_group: "glutes", equipment: "bodyweight", is_bodyweight: true },
  { name: "Sumo Deadlift", category: "legs", muscle_group: "glutes", equipment: "barbell", is_bodyweight: false },
  // Calves (Legs)
  { name: "Standing Calf Raise", category: "legs", muscle_group: "calves", equipment: "machine", is_bodyweight: false },
  { name: "Seated Calf Raise", category: "legs", muscle_group: "calves", equipment: "machine", is_bodyweight: false },
  { name: "Donkey Calf Raise", category: "legs", muscle_group: "calves", equipment: "machine", is_bodyweight: false },
  // Core
  { name: "Plank", category: "core", muscle_group: "abs", equipment: "bodyweight", is_bodyweight: true },
  { name: "Hanging Leg Raise", category: "core", muscle_group: "abs", equipment: "bodyweight", is_bodyweight: true },
  { name: "Cable Crunch", category: "core", muscle_group: "abs", equipment: "cable", is_bodyweight: false },
  { name: "Ab Wheel Rollout", category: "core", muscle_group: "abs", equipment: "none", is_bodyweight: false },
  { name: "Russian Twist", category: "core", muscle_group: "abs", equipment: "none", is_bodyweight: false },
  { name: "Decline Sit-Up", category: "core", muscle_group: "abs", equipment: "bodyweight", is_bodyweight: true },
  { name: "Pallof Press", category: "core", muscle_group: "abs", equipment: "cable", is_bodyweight: false },
  { name: "Dragon Flag", category: "core", muscle_group: "abs", equipment: "bodyweight", is_bodyweight: true },
  // Full Body
  { name: "Clean and Press", category: "full_body", muscle_group: "full_body", equipment: "barbell", is_bodyweight: false },
  { name: "Kettlebell Swing", category: "full_body", muscle_group: "full_body", equipment: "kettlebell", is_bodyweight: false },
  { name: "Thruster", category: "full_body", muscle_group: "full_body", equipment: "barbell", is_bodyweight: false },
  { name: "Burpee", category: "full_body", muscle_group: "full_body", equipment: "bodyweight", is_bodyweight: true },
];

export const SESSION_TYPES = [
  "Strength",
  "Conditioning",
  "Muay Thai S&C",
  "Hypertrophy",
  "Powerlifting",
  "Circuit",
  "Custom",
] as const;

export const CATEGORIES = [
  { value: "push", label: "Push" },
  { value: "pull", label: "Pull" },
  { value: "legs", label: "Legs" },
  { value: "core", label: "Core" },
  { value: "cardio", label: "Cardio" },
  { value: "full_body", label: "Full Body" },
] as const;

export const MUSCLE_GROUPS = [
  { value: "chest", label: "Chest" },
  { value: "back", label: "Back" },
  { value: "shoulders", label: "Shoulders" },
  { value: "biceps", label: "Biceps" },
  { value: "triceps", label: "Triceps" },
  { value: "quads", label: "Quads" },
  { value: "hamstrings", label: "Hamstrings" },
  { value: "glutes", label: "Glutes" },
  { value: "calves", label: "Calves" },
  { value: "abs", label: "Abs" },
  { value: "forearms", label: "Forearms" },
  { value: "traps", label: "Traps" },
  { value: "full_body", label: "Full Body" },
] as const;

export const EQUIPMENT_OPTIONS = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "cable", label: "Cable" },
  { value: "machine", label: "Machine" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "bands", label: "Bands" },
  { value: "none", label: "None" },
] as const;
