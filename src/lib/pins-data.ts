import type { createClient } from "./supabase/server";
import type { PinRow } from "./board";

function isMissingPinTable(error: { code?: string; message?: string }) {
  const message = error.message ?? "";
  return error.code === "PGRST205" || error.code === "42P01"
    || (/user_exercise_pin/.test(message) && /schema cache|does not exist/i.test(message));
}

export async function loadUserPinRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<PinRow[]> {
  const { data, error } = await supabase
    .from("user_exercise_pin")
    .select("exercise_id, position")
    .eq("user_id", userId)
    .order("position");
  // Pins are a display preference. A missing table must not take down Board, session, or history.
  if (error && isMissingPinTable(error)) return [];
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
