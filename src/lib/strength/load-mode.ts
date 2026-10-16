import type { ExerciseDef } from "./coefficients";

export function validExerciseWeight(def: ExerciseDef, weight: number): boolean {
  if (!Number.isFinite(weight)) return false;
  if (def.loadMode === "reps_only") return weight === 0;
  if (def.loadMode === "assisted") return weight <= 0;
  return def.equipment === "bodyweight" || weight > 0;
}

export function boundedLoggedWeight(def: ExerciseDef, weight: number): number {
  return def.loadMode === "assisted" ? Math.min(0, weight) : weight;
}

export function formatExerciseSet(def: Pick<ExerciseDef, "loadMode"> & Partial<Pick<ExerciseDef, "equipment">> | undefined, weight: number, reps: number): string {
  if (def?.loadMode === "reps_only") return `${reps} reps`;
  if (def?.loadMode === "assisted") return `${Math.abs(weight)} lb assistance × ${reps}`;
  return `${weight} lb${def?.equipment === "bodyweight" ? " added" : ""} × ${reps}`;
}
