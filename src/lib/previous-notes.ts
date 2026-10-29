import type { createClient } from "./supabase/server";
import { collectIdPages } from "./pagination";

export type NotesCursor = { finishedAt: string; id: string };
export type NotesSelection = { exerciseId: string; equipmentInstanceId: string | null; excludeSessionId?: string; cursor?: NotesCursor | null };
const PAGE_SIZE = 10;

// Paginate workouts, not sets: even an occurrence with zero sets is evidence.
export async function loadPreviousNotes(db: Awaited<ReturnType<typeof createClient>>, userId: string, selection: NotesSelection) {
  let query = db.from("workout_session")
    .select("id,finished_at,workout_exercise_detail!inner(id,occurrence_id,exercise_id,equipment_instance_id,setup,note)")
    .eq("user_id", userId).eq("workout_exercise_detail.user_id", userId)
    .eq("workout_exercise_detail.exercise_id", selection.exerciseId)
    .not("finished_at", "is", null)
    .order("finished_at", {ascending:false}).order("id", {ascending:false}).limit(PAGE_SIZE);
  query = selection.equipmentInstanceId === null
    ? query.is("workout_exercise_detail.equipment_instance_id", null)
    : query.eq("workout_exercise_detail.equipment_instance_id", selection.equipmentInstanceId);
  if (selection.excludeSessionId) query = query.neq("id", selection.excludeSessionId);
  if (selection.cursor) {
    const {finishedAt, id} = selection.cursor;
    query = query.or(`finished_at.lt.${finishedAt},and(finished_at.eq.${finishedAt},id.lt.${id})`);
  }
  const {data:workouts,error} = await query;
  if (error) throw new Error("Could not load previous notes. Please try again.");
  let referenceQuery = db.from("exercise_setup").select("setup").eq("user_id",userId).eq("exercise_id",selection.exerciseId);
  referenceQuery = selection.equipmentInstanceId === null ? referenceQuery.is("equipment_instance_id",null) : referenceQuery.eq("equipment_instance_id",selection.equipmentInstanceId);
  const {data:reference,error:referenceError} = await referenceQuery.maybeSingle();
  if (referenceError) throw new Error("Could not load remembered setup. Please try again.");
  const equipment = selection.equipmentInstanceId ? await db.from("equipment_instance").select("label,gym").eq("user_id",userId).eq("id",selection.equipmentInstanceId).maybeSingle() : null;
  if(equipment?.error) throw new Error("Could not load equipment. Please try again.");
  const sets = workouts?.length ? await collectIdPages(async after => {
    let q = db.from("set_log").select("id,session_id,planned_slot_id,program_slot_id,setup_snapshot,created_at")
      .eq("user_id",userId).eq("exercise_id",selection.exerciseId).in("session_id",workouts.map(w=>w.id)).order("id").limit(500);
    q = selection.equipmentInstanceId === null ? q.is("equipment_instance_id",null) : q.eq("equipment_instance_id",selection.equipmentInstanceId);
    if(after) q=q.gt("id",after);
    const {data,error}=await q;
    if(error) throw new Error("Could not load set setup context. Please try again.");
    return data??[];
  }) : [];
  const last = workouts?.at(-1);
  return {
    remembered:reference?.setup??null,
    equipmentLabel:equipment?.data ? [equipment.data.label,equipment.data.gym].filter(Boolean).join(" · ") : null,
    workouts:(workouts??[]).map(w=>({id:w.id,finishedAt:w.finished_at,
      occurrences:w.workout_exercise_detail.sort((a,b)=>a.occurrence_id.localeCompare(b.occurrence_id)).map(d=>({...d,
        setContexts:sets.filter(s=>s.session_id===w.id && (s.planned_slot_id??s.program_slot_id)===d.occurrence_id && s.setup_snapshot!==null && s.setup_snapshot!==d.setup)
          .sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)),
      })),
    })),
    // A short server-capped page is not proof that history ended.
    nextCursor:last?.finished_at ? {finishedAt:last.finished_at,id:last.id} : null,
  };
}
export type PreviousNotesPage = Awaited<ReturnType<typeof loadPreviousNotes>>;
