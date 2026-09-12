import type { createClient } from "./supabase/server";
import type { ExerciseDef } from "./strength/coefficients";
import { workoutRecords, type RecordSet } from "./strength/records";

const SELECT = "id, user_id, session_id, program_slot_id, exercise_id, equipment_instance_id, weight, reps, rir, e1rm, is_warmup, created_at, workout_session!inner(performed_at, finished_at)";
const PAGE_SIZE = 500;

// Both the live cards and completion flow use this read path. Page through all history:
// silently accepting Supabase's default row limit would produce false all-time records.
export async function loadWorkoutRecords(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string,
  startedAt: string,
  catalog: Record<string, ExerciseDef>,
) {
  const current: RecordSet[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from("set_log").select(SELECT)
      .eq("user_id", userId).eq("session_id", sessionId)
      .order("created_at").order("id").range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error("Unable to load workout records. Please try again.");
    current.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  const history: RecordSet[] = [];
  const exerciseIds = [...new Set(current.map((s) => s.exercise_id))];
  if (exerciseIds.length) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase.from("set_log").select(SELECT)
        .eq("user_id", userId).neq("session_id", sessionId).eq("is_warmup", false)
        .in("exercise_id", exerciseIds)
        .lt("workout_session.performed_at", startedAt)
        .lte("workout_session.finished_at", startedAt)
        .lt("created_at", startedAt)
        .order("created_at").order("id").range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error("Unable to load record history. Please try again.");
      history.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  return { current, history, achievements: workoutRecords([...history, ...current], userId, sessionId, startedAt, catalog) };
}
