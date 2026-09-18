import type { createClient } from "./supabase/server";
import type { PinRow } from "./board";

export async function loadUserPinRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<PinRow[]> {
  const { data, error } = await supabase
    .from("user_exercise_pin")
    .select("exercise_id, position")
    .eq("user_id", userId)
    .order("position");
  if (error) throw new Error("Unable to load pins. Please try again.");
  return (data ?? []).map((row) => ({ exerciseId: row.exercise_id, position: row.position }));
}

export async function loadTrainedExerciseIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("user_exercise_stat")
    .select("exercise_id")
    .eq("user_id", userId);
  if (error) throw new Error("Unable to load trained lifts. Please try again.");
  return (data ?? []).map((row) => row.exercise_id);
}
