import type { GymSet, ExercisePR, PRRecord } from "@/pages/gym/types";

/** Total volume = sum of (weight * reps) for all working (non-warmup) sets */
export function calculateVolume(sets: GymSet[]): number {
  return sets
    .filter(s => !s.is_warmup)
    .reduce((total, s) => total + (s.weight_kg ?? 0) * s.reps, 0);
}

/** Epley formula: 1RM = weight * (1 + reps / 30) — only valid for reps <= 30 */
export function calculateEpley1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

/** Set volume = weight * reps */
export function calculateSetVolume(set: GymSet): number {
  return (set.weight_kg ?? 0) * set.reps;
}

/** Compare a set against existing PR and return which records were broken */
export function comparePR(
  set: GymSet,
  existingPR: ExercisePR | null
): PRRecord[] {
  const records: PRRecord[] = [];
  const weight = set.weight_kg ?? 0;
  const volume = calculateSetVolume(set);
  const e1rm = calculateEpley1RM(weight, set.reps);

  if (set.is_warmup) return records;

  if (weight > 0 && (existingPR === null || weight > (existingPR.max_weight_kg ?? 0))) {
    records.push({
      type: "weight",
      value: weight,
      previousValue: existingPR?.max_weight_kg ?? null,
    });
  }

  if (set.reps > (existingPR?.max_reps ?? 0)) {
    records.push({
      type: "reps",
      value: set.reps,
      previousValue: existingPR?.max_reps ?? null,
    });
  }

  if (volume > 0 && volume > (existingPR?.max_volume ?? 0)) {
    records.push({
      type: "volume",
      value: volume,
      previousValue: existingPR?.max_volume ?? null,
    });
  }

  if (e1rm > 0 && e1rm > (existingPR?.estimated_1rm ?? 0)) {
    records.push({
      type: "1rm",
      value: e1rm,
      previousValue: existingPR?.estimated_1rm ?? null,
    });
  }

  return records;
}

/** Format weight for display */
export function formatWeight(kg: number | null): string {
  if (kg === null || kg === 0) return "BW";
  return kg % 1 === 0 ? `${kg}` : `${kg.toFixed(1)}`;
}

/** Format volume for display (e.g., 12500 -> "12.5k") */
export function formatVolume(volume: number): string {
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}k`;
  return `${Math.round(volume)}`;
}
