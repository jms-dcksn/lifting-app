import { isLoggableExercise } from "./station";
import type { ExerciseDef } from "./strength/coefficients";
export const WORKOUT_TEXT_LIMIT = 2000;
export function normalizeWorkoutText(value: string | null): string | null {
  if(value !== null && typeof value !== "string") throw new Error("Enter plain text.");
  // Unicode code points match PostgreSQL char_length, including emoji.
  if(Array.from(value ?? "").length>WORKOUT_TEXT_LIMIT) throw new Error("Use 2,000 characters or fewer. Your draft is still here.");
  return value?.trim() || null;
}
export function supportsSetup(def: ExerciseDef | undefined, catalog: Record<string, ExerciseDef>): boolean {
  if(!def || !isLoggableExercise(def)) return false;
  const profile=def.stationProfile ?? (def.baseExerciseId ? catalog[def.baseExerciseId]?.stationProfile : undefined);
  return def.equipment==="machine" || def.equipment==="cable" || profile==="machine" || profile==="cable";
}
export type WorkoutExerciseDetail = { id: string; occurrence_id: string; exercise_id: string; equipment_instance_id: string | null; setup: string | null; note: string | null };
export type RememberedSetup = { id: string; exercise_id: string; equipment_instance_id: string | null; setup: string | null };
