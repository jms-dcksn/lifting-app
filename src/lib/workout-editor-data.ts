import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { parseStoredPlan } from "./workout-editor";
import type { PlannedPerformance } from "./workout-editor-targets";
import { collectIdPages } from "./pagination";

export async function loadPlannedPerformances(db: SupabaseClient<Database>, userId: string, asOf: Date): Promise<PlannedPerformance[]> {
  const sessions = await collectIdPages(async after => {
    let q = db.from("workout_session").select("id,performed_at,finished_at,is_deload,plan_snapshot")
      .eq("user_id", userId).not("finished_at", "is", null).not("plan_snapshot", "is", null)
      .lt("performed_at", asOf.toISOString()).lte("finished_at", asOf.toISOString()).order("id").limit(500);
    if (after) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) throw new Error("Unable to load per-set workout history.");
    return data ?? [];
  });
  if (!sessions.length) return [];
  const byId = new Map(sessions.map(s => [s.id, s]));
  const rows = await collectIdPages(async after => {
    let q = db.from("set_log").select("id,session_id,program_slot_id,exercise_id,equipment_instance_id,weight,reps,rir,e1rm,planned_set_id,created_at")
      .eq("user_id", userId).not("planned_set_id", "is", null).eq("is_warmup", false).eq("is_deload", false)
      .lt("created_at", asOf.toISOString()).order("id").limit(500);
    if (after) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) throw new Error("Unable to load per-set performance.");
    return data ?? [];
  });
  return rows.flatMap(r => {
    const session = byId.get(r.session_id);
    if (!session || session.is_deload || !r.planned_set_id) return [];
    const plan = parseStoredPlan(session.plan_snapshot);
    const slot = plan.slots.find(s => s.sets.some(set => set.id === r.planned_set_id));
    const set = slot?.sets.find(s => s.id === r.planned_set_id);
    if (!slot || !set || slot.exerciseId !== r.exercise_id) return [];
    return [{ exerciseId: r.exercise_id, equipmentInstanceId: r.equipment_instance_id,
      sessionId: r.session_id, setId: r.id, programSlotId: r.program_slot_id,
      performedAt: session.performed_at, weight: r.weight, reps: r.reps, rir: r.rir, e1rm: r.e1rm,
      phaseId:plan.phase?.id??null,plannedSetId: r.planned_set_id, repMin: set.repMin, repMax: set.repMax, rirMin: set.rirMin, rirMax: set.rirMax }];
  });
}
