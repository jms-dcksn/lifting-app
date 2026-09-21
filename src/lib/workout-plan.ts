import type { ExerciseDef } from "./strength/coefficients";

export const WORKOUT_PLAN_COOKIE = "next-workout-plan";

// Include the completed count: the same day in the next week is a different workout.
export function workoutPlanKey(userId: string, programId: string, dayId: string, completed: number) {
  return [userId, programId, dayId, completed].join(":");
}

export function readWorkoutPlan(
  raw: string | undefined,
  key: string,
  slots: { id: string }[],
  catalog: Record<string, ExerciseDef>,
): Record<string, string> {
  try {
    const draft = JSON.parse(raw ?? "null");
    if (draft?.key !== key || !draft.choices || typeof draft.choices !== "object") return {};
    return Object.fromEntries(slots.flatMap(({ id }) => {
      const exerciseId = draft.choices[id];
      const def = typeof exerciseId === "string" ? catalog[exerciseId] : undefined;
      return def && def.id === exerciseId && def.stationProfile !== "machine" ? [[id, def.id]] : [];
    }));
  } catch {
    return {};
  }
}
