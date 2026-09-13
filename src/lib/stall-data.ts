import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { dateKey } from "./bodyweight";
import { loadMonthlyHistory } from "./strength-history-data";
import { buildStallAssessments, type StallHistory, type StallAdaptation } from "./stall-report";
import type { ExerciseDef } from "./strength/coefficients";

type Client = SupabaseClient<Database>;
type Table = "program_slot" | "program_day" | "program_phase" | "movement_adaptation";
// Metadata is paginated too: a missing adaptation must never join two unrelated phases.
async function allRows<T extends Table>(db: Client, userId: string, table: T) {
  const rows: Database["public"]["Tables"][T]["Row"][] = [];
  let after: string | null = null;
  while (true) {
    let query = db.from(table as Table).select("*").eq("user_id", userId).order("id").limit(500);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw new Error("Unable to load training context. Please try again.");
    if (!data?.length) break;
    // Generic table selection loses its row inference in supabase-js.
    const page = data as unknown as Database["public"]["Tables"][T]["Row"][];
    rows.push(...page);
    after = page[page.length - 1].id;
  }
  return rows;
}

export async function loadStallHistory(db: Client, userId: string, now = new Date(),
  history?: Awaited<ReturnType<typeof loadMonthlyHistory>>, endDate = dateKey(now)): Promise<StallHistory> {
  const saved = history ?? await loadMonthlyHistory(db, userId, endDate.slice(0, 7), now);
  if (!saved.sessions.length) return { userId, sessions: [], sets: [], slots: [], phases: [], adaptations: [] };
  const [slots, days, phases, adaptations] = await Promise.all([
    allRows(db, userId, "program_slot"), allRows(db, userId, "program_day"),
    allRows(db, userId, "program_phase"), allRows(db, userId, "movement_adaptation"),
  ]);
  const dayById = new Map(days.map(d => [d.id, d]));
  return { userId,
    sessions: saved.sessions.filter(s => s.user_id === userId && dateKey(new Date(s.performed_at)) <= endDate).map(s => ({
      id: s.id, performedAt: s.performed_at, finishedAt: s.finished_at,
      programId: s.program_id ?? null, programDayId: s.program_day_id ?? null, weekIndex: s.week_index ?? null,
    })),
    sets: saved.sets,
    slots: slots.flatMap(s => {
      const day = dayById.get(s.program_day_id);
      return day ? [{ id: s.id, programId: day.program_id, programDayId: day.id, exerciseId: s.exercise_id,
        targetSets: s.target_sets, repMin: s.rep_min, repMax: s.rep_max, targetRir: s.target_rir, plateauPatience: s.plateau_patience }] : [];
    }),
    phases: phases.map(p => ({ id: p.id, programId: p.program_id, position: p.position, name: p.name,
      description: p.description, weekStart: p.week_start, weekEnd: p.week_end,
      targetRirMin: p.target_rir_min, targetRirMax: p.target_rir_max, setMultiplier: p.set_multiplier })),
    adaptations: adaptations.filter(a => dateKey(new Date(a.created_at)) <= endDate).map(a => ({
      id: a.id, slotId: a.program_slot_id, exerciseId: a.exercise_id, action: a.action as StallAdaptation["action"],
      newExerciseId: a.new_exercise_id, newRepMin: a.new_rep_min, newRepMax: a.new_rep_max, createdAt: a.created_at,
    })),
  };
}

export async function loadStallAssessments(db: Client, userId: string, catalog: Record<string, ExerciseDef>, now = new Date(),
  history?: Awaited<ReturnType<typeof loadMonthlyHistory>>, endDate = dateKey(now)) {
  return buildStallAssessments(await loadStallHistory(db, userId, now, history, endDate), catalog, now);
}
