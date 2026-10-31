import { collectIdPages } from "./pagination";
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
  sessionId?: string,
) {
  let query = supabase.from("set_log")
    .select("id, exercise_id, weight, reps, rir, is_warmup, is_deload, created_at, tempo, note, setup_snapshot, session_id, planned_slot_id, program_slot_id, equipment_instance_id")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds);
  if (sessionId) query = query.neq("session_id", sessionId);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(10);
  if (error) throw new Error("Unable to load exercise history. Please try again.");
  const details = data?.length ? await collectIdPages(async after=>{
    let query=supabase.from("workout_exercise_detail").select("id,session_id,occurrence_id,exercise_id,equipment_instance_id,note")
      .eq("user_id",userId).in("session_id",[...new Set(data.map(r=>r.session_id))]).order("id").limit(500);
    if(after) query=query.gt("id",after);
    const {data: rows,error: detailError}=await query;if(detailError) throw new Error("Unable to load exercise observations. Please try again.");return rows??[];
  }) : [];
  return (data??[]).map(row=>({...row,exercise_note:details.find(d=>d.session_id===row.session_id && d.occurrence_id===(row.planned_slot_id??row.program_slot_id) && d.exercise_id===row.exercise_id && d.equipment_instance_id===row.equipment_instance_id)?.note??null}));
}
