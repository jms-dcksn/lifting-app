import type { ExerciseDef } from "@/lib/strength/coefficients";
import type { createClient } from "@/lib/supabase/server";

// Match explicit exercise families, never the broader movement pattern.
// Variants join via baseExerciseId — machines, cables, and barbell stations alike.
export function exerciseFamilyIds(exerciseId: string, catalog: Record<string, ExerciseDef>) {
  const baseId = catalog[exerciseId]?.baseExerciseId ?? exerciseId;
  return [...new Set([baseId, exerciseId, ...Object.values(catalog)
    .filter((def) => def.baseExerciseId === baseId)
    .map((def) => def.id)])];
}

// Latest finished identity in the family. Browse / tile numbers only — do not merge PRs.
export function latestFamilyMember<T extends { exerciseId: string; lastPerformedAt?: string }>(
  exerciseId: string,
  catalog: Record<string, ExerciseDef>,
  items: T[],
): T | undefined {
  const family = new Set(exerciseFamilyIds(exerciseId, catalog));
  return items
    .filter((item) => family.has(item.exerciseId))
    .sort((a, b) => {
      const byTime = (b.lastPerformedAt ?? "").localeCompare(a.lastPerformedAt ?? "");
      return byTime !== 0 ? byTime : a.exerciseId.localeCompare(b.exerciseId);
    })[0];
}

export async function loadExerciseHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  exerciseIds: string[],
  sessionId: string,
) {
  const { data, error } = await supabase.from("set_log")
    .select("id, exercise_id, weight, reps, rir, is_warmup, created_at")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds)
    .neq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(10);
  if (error) throw new Error("Unable to load exercise history. Please try again.");
  return data ?? [];
}
