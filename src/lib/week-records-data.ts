import type { createClient } from "./supabase/server";
import type { ExerciseDef } from "./strength/coefficients";
import { dateKey } from "./bodyweight";
import { inLocalDays } from "./app-chrome";
import { loadWorkoutRecords } from "./workout-records";
import { weekRecordChips, type WeekRecordChip } from "./board";
import type { ExerciseRecords } from "./strength/records";

export async function loadWeekRecordChips(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  catalog: Record<string, ExerciseDef>,
  now = new Date(),
): Promise<{ chips: WeekRecordChip[]; sessions: { sessionId: string; groups: ExerciseRecords[] }[] }> {
  const today = dateKey(now);
  const { data, error } = await supabase
    .from("workout_session")
    .select("id, performed_at, finished_at")
    .eq("user_id", userId)
    .not("finished_at", "is", null)
    .order("performed_at", { ascending: false })
    .limit(24);
  if (error) throw new Error("Unable to load this week's records. Please try again.");
  const windowed = (data ?? []).filter((session) => inLocalDays(session.performed_at, today, 7));
  const sessions: { sessionId: string; groups: ExerciseRecords[] }[] = [];
  for (const session of windowed) {
    const { achievements } = await loadWorkoutRecords(
      supabase,
      userId,
      session.id,
      session.performed_at,
      catalog,
    );
    if (achievements.length) sessions.push({ sessionId: session.id, groups: achievements });
  }
  return { chips: weekRecordChips(sessions), sessions };
}
