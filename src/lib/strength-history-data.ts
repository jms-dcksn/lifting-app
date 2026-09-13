import type { createClient } from "./supabase/server";
import type { RecordSet } from "./strength/records";
import { monthlyWindows, type MonthlySession } from "./monthly-progress";
import { shiftDate } from "./weight-calendar";

type Client = Awaited<ReturnType<typeof createClient>>;
// UUID keyset pagination never assumes that the server honors our requested page size.
export async function loadMonthlyHistory(db: Client, userId: string, month: string, now = new Date()) {
  const windows = monthlyWindows(month, now);
  // Broad UTC bound includes every timezone offset. Pure report applies exact Chicago dates.
  const before = `${shiftDate(windows.current.end, 2)}T00:00:00Z`;
  const sessions: MonthlySession[] = [];
  let after: string | null = null;
  while (true) {
    let q = db.from("workout_session").select("id, user_id, performed_at, finished_at, program_id, program_day_id, week_index")
      .eq("user_id", userId).not("finished_at", "is", null).lte("finished_at", now.toISOString())
      .lt("performed_at", before).order("id").limit(500);
    if (after) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) throw new Error("Unable to load monthly workouts. Please try again.");
    if (!data?.length) break;
    sessions.push(...data);
    after = data[data.length - 1].id;
  }
  const sets: RecordSet[] = [];
  after = null;
  while (sessions.length) {
    let q = db.from("set_log")
      .select("id, user_id, session_id, program_slot_id, exercise_id, equipment_instance_id, weight, reps, rir, e1rm, is_warmup, created_at, workout_session!inner(performed_at, finished_at)")
      .eq("user_id", userId).eq("is_warmup", false)
      .not("workout_session.finished_at", "is", null).lte("workout_session.finished_at", now.toISOString())
      .lt("workout_session.performed_at", before).order("id").limit(500);
    if (after) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) throw new Error("Unable to load monthly lift history. Please try again.");
    if (!data?.length) break;
    sets.push(...data);
    after = data[data.length - 1].id;
  }
  return { sessions, sets };
}
