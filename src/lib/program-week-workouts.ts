import { loadNextWorkout, resolveWorkoutSlots } from "./next-workout";
import type { Program } from "./program";
import { collectIdPages } from "./pagination";
import { loadWorkoutTargetHistory } from "./workout-target-data";

export type ProgramWeekScope = "current_week" | "upcoming_week";
type Client = Parameters<typeof loadNextWorkout>[0];

/** A read-only projection from recorded evidence, never a simulation of future workouts. */
export async function loadProgramWeekWorkouts(client: Client, userId: string, program: Program, scope: ProgramWeekScope) {
  const asOf = new Date();
  const next = await loadNextWorkout(client, userId, program);
  const week = next.week + (scope === "upcoming_week" ? 1 : 0);
  const base = { scope, boundary: "program_week" as const, programId: program.id, programName: program.name,
    week, currentWeek: next.week, totalWeeks: program.weeks, historyAsOf: asOf.toISOString() };
  if (week > program.weeks) return { ...base, status: "beyond_program" as const, workouts: [], catalog: next.catalog };

  // Read saved week/day identity rather than guessing completed days from calendar dates.
  const completed = await collectIdPages(async after => {
    let query = client.from("workout_session").select("id, program_day_id")
      .eq("user_id", userId).eq("program_id", program.id).eq("week_index", week)
      .not("finished_at", "is", null).order("id").limit(500);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw new Error("Unable to load program-week completion. Please try again.");
    return data ?? [];
  });
  const reuseNext = (dayId: string) => scope === "current_week" && dayId === next.day.id;
  const otherSlotIds = program.days.filter(day => !reuseNext(day.id)).flatMap(day => day.slots.map(slot => slot.id));
  const [history, adaptations] = await Promise.all([
    otherSlotIds.length ? loadWorkoutTargetHistory(client, userId, next.catalog, asOf, otherSlotIds) : next.targetHistory,
    program.style === "fluid" && otherSlotIds.length ? collectIdPages(async after => {
      let query = client.from("movement_adaptation")
        .select("id, program_slot_id, action, new_exercise_id, new_rep_min, new_rep_max, created_at")
        .eq("user_id", userId).in("program_slot_id", otherSlotIds).order("id").limit(500);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) throw new Error("Unable to load program-week adaptations. Please try again.");
      return data ?? [];
    }).then(rows => rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))) : [],
  ]);
  const workouts = program.days.map((day, index) => {
    const isNext = reuseNext(day.id);
    const openSessionId = isNext ? next.open?.id ?? null : null;
    const completedSessionIds = completed.filter(session => session.program_day_id === day.id).map(session => session.id);
    const missingCompletion = scope === "current_week" && !next.open
      && index < next.completed % program.days.length && completedSessionIds.length === 0;
    const status = openSessionId ? "open" as const : completedSessionIds.length ? "completed" as const
      : missingCompletion ? "unknown" as const : "upcoming" as const;
    const slots = isNext ? next.slots : resolveWorkoutSlots({ program, day, week, choices: {}, logged: [],
      adaptations, targetHistory: history, catalog: next.catalog, stats: next.stats, bodyweight: next.bodyweight,
      defaultRestSeconds: next.defaultRestSeconds });
    return { programId: program.id, dayId: day.id, dayName: day.name, week, status, openSessionId, completedSessionIds,
      targetBasis: status === "completed" || status === "unknown" ? "not_applicable" as const
        : openSessionId ? "open_workout_pre_start_history" as const : "current_history_estimate" as const,
      slots };
  });
  return { ...base, status: "available" as const, workouts, catalog: next.catalog };
}
