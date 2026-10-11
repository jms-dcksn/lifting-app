// Identity → illustration. Keys are seeded catalog / template ids, not display names.
// Station variants inherit the template asset via baseExerciseId or the id prefix
// before `__` (canonical `base__brand__tag`, plus the owned fourth segment).

export const EXERCISE_VISUAL_SRC = {
  "bb-back-squat": "/exercises/bb-back-squat.jpg",
  "bb-bench": "/exercises/bb-bench.jpg",
  "bb-incline-bench": "/exercises/bb-incline-bench.jpg",
  "bb-rdl": "/exercises/bb-rdl.jpg",
  "db-shoulder-press": "/exercises/db-shoulder-press.jpg",
  "db-split-squat": "/exercises/db-split-squat.jpg",
  "hack-squat": "/exercises/hack-squat.jpg",
  "lat-pulldown": "/exercises/lat-pulldown.jpg",
  "seated-cable-row": "/exercises/seated-cable-row.jpg",
  "seated-leg-curl": "/exercises/seated-leg-curl.jpg",
} as const;

export type ExerciseVisualId = keyof typeof EXERCISE_VISUAL_SRC;
export type ExerciseVisualSize = "sm" | "lg";

export function exerciseVisualKey(
  exerciseId: string | null | undefined,
  baseExerciseId?: string | null,
): string | null {
  const candidates = [baseExerciseId, exerciseId, templateRoot(exerciseId)];
  for (const key of candidates) {
    if (key && key in EXERCISE_VISUAL_SRC) return key;
  }
  return null;
}

export function exerciseVisualSrc(
  exerciseId: string | null | undefined,
  baseExerciseId?: string | null,
): string | null {
  const key = exerciseVisualKey(exerciseId, baseExerciseId);
  return key ? EXERCISE_VISUAL_SRC[key as ExerciseVisualId] : null;
}

function templateRoot(exerciseId: string | null | undefined): string | null {
  if (!exerciseId || exerciseId.startsWith("custom-")) return null;
  const root = exerciseId.split("__")[0];
  return root && root !== exerciseId ? root : null;
}
