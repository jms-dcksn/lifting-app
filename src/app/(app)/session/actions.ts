"use server";

import { normalizeWorkoutText, supportsSetup } from "@/lib/workout-details";
import { resolveTempo, tempoSchema, type Tempo } from "@/lib/tempo";
import { refreshCoachInbox } from "@/lib/coach-inbox-data";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { loadNextWorkout } from "@/lib/next-workout";
import { WORKOUT_PLAN_COOKIE } from "@/lib/workout-plan";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCatalogMap } from "@/lib/catalog";
import { exerciseFamilyIds, loadExerciseHistory } from "@/lib/exercise-history";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import { isLoggableExercise } from "@/lib/station";
import { loadWorkoutRecords } from "@/lib/workout-records";
import { historicalBodyweight, validSetNumbers, type ExerciseRecords } from "@/lib/strength/records";
import { comparisonKey, comparisonScope } from "@/lib/strength/movement";
import { validExerciseWeight } from "@/lib/strength/load-mode";
import { computeE1rm } from "@/lib/strength/e1rm";
import { recomputeStat, effectiveLoad } from "@/lib/strength/recompute";
import { estimatePatternStrength, type ExerciseStat } from "@/lib/strength/recommend";
import { getActiveProgram } from "@/lib/program";
import { getCurrentBodyweight } from "@/lib/current-bodyweight";
import {
  normalizeJointPain,
  normalizeSessionNote,
  validateReadiness,
  type JointPain,
  type SessionFeedback,
} from "@/lib/session-feedback";

// auth.uid() for RLS; getClaims() is the trusted server-side check (see AGENTS.md).
async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

function revalidateSession(sessionId: string) {
  revalidatePath(`/session/${sessionId}`);
  revalidatePath(`/session/${sessionId}/recap`);
}

export async function getExerciseHistory(exerciseId: string, sessionId?: string) {
  const { supabase, userId } = await requireUser();
  const catalog = await getCatalogMap(supabase, userId);
  if (!catalog[exerciseId]) throw new Error("Exercise not found. Please reopen history.");
  const rows = await loadExerciseHistory(supabase, userId, exerciseFamilyIds(exerciseId, catalog), sessionId);
  return rows.map((row) => ({ ...row, name: catalog[row.exercise_id]?.name ?? row.exercise_id }));
}

// Rebuild user_exercise_stat.current_e1rm for one exercise from its set_log rows.
// set_log is the source of truth; this keeps the cache from drifting.
//
// Calibration (needsCalibration): arbitrary load units — machines and cable brand
// variants. personal_coefficient = observed e1RM / pattern strength from OTHER
// exact-id stats. Anchors on the first session (re-anchored while only one session
// exists) and then holds. Barbell bench/rack/platform variants are ordinary lb and
// skip this branch. Leftover flat template rows are a different exercise_id, so a
// new cable variant still calibrates. No rewrite of those leftover set_log rows.
async function recomputeAndUpsertStat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  exerciseId: string,
  bodyweight: number | null,
  catalog: Record<string, ExerciseDef>,
) {
  const def = catalog[exerciseId];
  if (!def) return;
  const { data: sets } = await supabase
    .from("set_log")
    .select("weight, reps, rir, session_id")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("is_warmup", false)
    .eq("is_deload", false);

  const { currentE1rm } = recomputeStat(def, sets ?? [], bodyweight);

  let calibration: { personal_coefficient: number | null; coeff_confidence_n: number } | null =
    null;
  if (def.needsCalibration) {
    const sessionCount = new Set((sets ?? []).map((s) => s.session_id)).size;
    const { data: statRows } = await supabase
      .from("user_exercise_stat")
      .select("exercise_id, current_e1rm, personal_coefficient, coeff_confidence_n")
      .eq("user_id", userId);

    let personal =
      statRows?.find((r) => r.exercise_id === exerciseId)?.personal_coefficient ?? null;
    if (currentE1rm == null) {
      personal = null; // all sets gone — recalibrate on the next first set
    } else if (personal == null || sessionCount <= 1) {
      const others: ExerciseStat[] = (statRows ?? [])
        .filter((r) => r.exercise_id !== exerciseId)
        .map((r) => ({
          exerciseId: r.exercise_id,
          currentE1rm: r.current_e1rm ?? 0,
          personalCoefficient: r.personal_coefficient,
          confidenceN: r.coeff_confidence_n,
        }));
      const patternStrength = estimatePatternStrength(def.pattern, catalog, others);
      if (patternStrength) personal = currentE1rm / patternStrength;
    }
    calibration = {
      personal_coefficient: personal,
      coeff_confidence_n: currentE1rm == null ? 0 : sessionCount,
    };
  }

  await supabase.from("user_exercise_stat").upsert(
    {
      user_id: userId,
      exercise_id: exerciseId,
      current_e1rm: currentE1rm,
      last_updated: new Date().toISOString(),
      ...(calibration ?? {}),
    },
    { onConflict: "user_id,exercise_id" },
  );
}

// Resume an in-progress session or start the next one. Day/week derive from the count of
// finished sessions of the active program; days run in sequence.
export async function startNextSession() {
  return startSession();
}

export async function startPlannedSession(planKey: string) {
  return startSession(planKey);
}

async function startSession(planKey?: string) {
  let destination: string;
  try { destination = await upcomingSessionDestination(planKey); }
  catch (error) {
    console.error("Workout start failed", error);
    destination = "/workout/next?startError=1";
  }
  redirect(destination);
}

export async function preparePlannedWorkout(planKey:string):Promise<{destination:string}|{error:string}> {
  try { return {destination:await upcomingSessionDestination(planKey)}; }
  catch(error) { return {error:error instanceof Error?error.message:"Could not start. Your saved workout is still available. Try again."}; }
}

async function upcomingSessionDestination(planKey?: string) {
  const supabase=await createClient();
  const {data:claims}=await supabase.auth.getClaims();
  const userId=claims?.claims?.sub;
  if(!userId) return "/login";

  const program = await getActiveProgram(supabase, userId);
  if (!program || program.days.length === 0) return "/program";

  const next = await loadNextWorkout(supabase, userId, program);
  if (next.open) return `/session/${next.open.id}`;
  if (planKey && planKey !== next.key) return "/workout/next";
  const { data: sessionId, error } = await supabase.rpc("start_workout_plan", {
    p_program: program.id, p_day: next.day.id, p_completed: next.completed,
    p_source: next.sourceRevision, p_revision: next.planRevision,
    p_plan: {...next.editorPlan, slots: next.editorPlan.slots.map(slot => ({...slot, resolvedTempo: resolveTempo(next.catalog[slot.exerciseId], slot.tempo)}))} as unknown as import("@/lib/supabase/types").Json,
  });
  if (error || !sessionId) throw new Error(error?.message ?? "Could not start session");
  (await cookies()).delete(WORKOUT_PLAN_COOKIE);
  revalidatePath("/");
  return `/session/${sessionId}`;
}

const SET_RETURN_COLUMNS = "id, exercise_id, weight, reps, rir, set_index, e1rm, tempo, note, setup_snapshot, edit_revision";

export interface LogSetInput {
  equipmentInstanceId?: string | null;
  note?: string | null;
  sessionId: string;
  programSlotId: string | null;
  exerciseId: string;
  weight: number;
  reps: number;
  rir: number;
  idempotencyKey?: string;
  plannedSlotId?: string;
  plannedSetId?: string;
  tempo?: Tempo | null;
}

// Compute e1RM, insert the set, refresh the derived stat. Returns the persisted row.
export async function logSet(input: LogSetInput) {
  const { supabase, userId } = await requireUser();
  // A retry reads saved details; it never reinterprets changed prescriptions or text.
  if (input.idempotencyKey) {
    const {data: saved,error} = await supabase.from("set_log").select(SET_RETURN_COLUMNS)
      .eq("user_id",userId).eq("session_id",input.sessionId).eq("idempotency_key",input.idempotencyKey).maybeSingle();
    if(error) throw new Error("Could not check this set. Your draft is still here. Try again.");
    if(saved) {
      revalidateSession(input.sessionId);
      revalidatePath("/history/[exerciseId]","page");
      return {...saved,recomputeWarning:null};
    }
  }
  const note = normalizeWorkoutText(input.note ?? null);
  const catalog = await getCatalogMap(supabase, userId);
  const def = catalog[input.exerciseId];
  if (!def) throw new Error(`Unknown exercise: ${input.exerciseId}`);

  if (!isLoggableExercise(def)) {
    throw new Error("Choose a specific exercise or machine first.");
  }
  if (!validSetNumbers(input) || input.rir == null || !validExerciseWeight(def, input.weight)) {
    throw new Error("Enter a valid weight, whole-number reps, and RIR from 0 to 5.");
  }

  // set_index is per (session, slot) so a duplicated exercise across two slots keeps
  // independent set chains; ad-hoc sets (no slot) fall back to per (session, exercise).
  let setIndexQuery = supabase
    .from("set_log")
    .select("id", { count: "exact", head: true })
    .eq("session_id", input.sessionId);
  if (input.plannedSlotId) setIndexQuery = setIndexQuery.eq("planned_slot_id", input.plannedSlotId);
  else setIndexQuery = input.programSlotId
    ? setIndexQuery.eq("program_slot_id", input.programSlotId)
    : setIndexQuery.eq("exercise_id", input.exerciseId);

  const [{ data: session }, bodyweight, { count: priorThisSession }, { count: priorEver }] =
    await Promise.all([
      // The session id comes from the client — confirm it is this user's session.
      supabase
        .from("workout_session")
        .select("id, is_deload, plan_snapshot")
        .eq("id", input.sessionId)
        .eq("user_id", userId)
        .maybeSingle(),
      getCurrentBodyweight(supabase, userId),
      setIndexQuery,
      // First exact-id set on a needsCalibration exercise (machine or cable variant).
      supabase
        .from("set_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("exercise_id", input.exerciseId)
        .eq("is_deload", false)
        .eq("is_warmup", false),
    ]);
  if (!session) throw new Error("Session not found");

  let equipmentInstanceId: string | null = null;
  let tempo: Tempo | null = input.tempo === null ? null : resolveTempo(def, input.tempo === undefined ? undefined : tempoSchema.parse(input.tempo));
  if (session.plan_snapshot && input.plannedSlotId) {
    const { parseStoredPlan } = await import("@/lib/workout-editor");
    const slot = parseStoredPlan(session.plan_snapshot).slots.find(s=>s.id===input.plannedSlotId);
    if (!slot) throw new Error("Exercise is not in this saved workout.");
    if (slot.exerciseId===input.exerciseId) equipmentInstanceId=slot.equipmentInstanceId??null;
    if (input.tempo === undefined) tempo = slot.exerciseId === input.exerciseId ? slot.resolvedTempo ?? resolveTempo(def, slot.tempo) : resolveTempo(def, slot.tempo);
  }

  if (input.equipmentInstanceId !== undefined && session.plan_snapshot && input.equipmentInstanceId !== equipmentInstanceId) throw new Error("Equipment changed. Reopen this workout.");
  if (!session.plan_snapshot && input.equipmentInstanceId) {
    const {data:equipment}=await supabase.from("equipment_instance").select("id").eq("id",input.equipmentInstanceId).eq("user_id",userId).eq("exercise_id",input.exerciseId).maybeSingle();
    if(!equipment) throw new Error("Equipment unavailable. Reopen this workout.");
    equipmentInstanceId=equipment.id;
  }
  const load = effectiveLoad(def, input.weight, bodyweight);
  const e1rm =
    load != null && load > 0 && input.reps > 0 ? computeE1rm(load, input.reps, input.rir) : null;

  const { data, error } = await supabase
    .from("set_log")
    .insert({
      user_id: userId,
      session_id: input.sessionId,
      program_slot_id: input.programSlotId,
      planned_slot_id: input.plannedSlotId ?? null,
      planned_set_id: input.plannedSetId ?? null,
      equipment_instance_id: equipmentInstanceId,
      exercise_id: input.exerciseId,
      set_index: priorThisSession ?? 0,
      tempo,
      note,
      weight: input.weight,
      reps: input.reps,
      rir: input.rir,
      e1rm,
      is_deload: session.is_deload ?? false,
      is_calibration: !session.is_deload && !!def.needsCalibration && (priorEver ?? 0) === 0,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select(SET_RETURN_COLUMNS)
    .single();

  // Idempotent insert: on unique constraint violation, return existing row.
  if (error?.code === "23505" && input.idempotencyKey) {
    const { data: existing, error: readError } = await supabase
      .from("set_log")
      .select(SET_RETURN_COLUMNS)
      .eq("session_id", input.sessionId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (readError || !existing) throw new Error("Could not retrieve existing set");
    revalidateSession(input.sessionId);
    revalidatePath("/history/[exerciseId]", "page");
    return { ...existing, recomputeWarning: null };
  }

  if (error || !data) throw new Error(error?.message ?? "Could not log set");

  let recomputeWarning: string | null = null;
  try {
    await recomputeAndUpsertStat(supabase, userId, input.exerciseId, bodyweight, catalog);
  } catch {
    recomputeWarning = "Set saved, but couldn't update exercise stats. Your progress tracking may be temporarily out of sync.";
  }
  revalidateSession(input.sessionId);
  revalidatePath("/history/[exerciseId]", "page");
  return { ...data, recomputeWarning };
}

export interface EditSetInput {
  detailsOnly?: boolean;
  note?: string | null;
  expectedRevision?: number;
  tempo?: Tempo | null;
  setId: string;
  weight: number;
  reps: number;
  rir: number;
}

export async function editSet(input: EditSetInput) {
  const { supabase, userId } = await requireUser();
  if (!input.detailsOnly && (!validSetNumbers(input) || input.rir == null)) throw new Error("Enter a valid weight, whole-number reps, and RIR from 0 to 5.");
  const patch = {
    ...(input.tempo === undefined ? {} : {tempo:input.tempo === null ? null : tempoSchema.parse(input.tempo)}),
    ...(input.note === undefined ? {} : {note:normalizeWorkoutText(input.note)}),
  };
  const { data: existing } = await supabase.from("set_log")
    .select("id, exercise_id, session_id, weight, reps, rir, e1rm, tempo, note, edit_revision")
    .eq("user_id", userId).eq("id", input.setId).single();
  if (!existing) throw new Error("Set not found");
  const numericChanged=!input.detailsOnly && (existing.weight!==input.weight || existing.reps!==input.reps || existing.rir!==input.rir);
  const detailsChanged=(patch.tempo!==undefined && JSON.stringify(patch.tempo)!==JSON.stringify(existing.tempo))
    || (patch.note!==undefined && patch.note!==existing.note);
  // Lost-response replay succeeds without a second write, even after its revision advanced.
  if(!numericChanged && !detailsChanged) {
    revalidateSession(existing.session_id);
    revalidatePath("/history/[exerciseId]","page");
    return {recomputeWarning:null};
  }
  if(input.expectedRevision!==undefined && (!Number.isInteger(input.expectedRevision) || input.expectedRevision!==existing.edit_revision)) {
    throw new Error("This set changed elsewhere. Cancel and reopen to review it. Your draft is still here.");
  }

  let e1rm=existing.e1rm;
  let bodyweight:number|null=null;
  let catalog:Record<string,ExerciseDef>={};
  if(numericChanged) {
    catalog=await getCatalogMap(supabase,userId);
    const def=catalog[existing.exercise_id];
    bodyweight=await getCurrentBodyweight(supabase,userId);
    if(!def || !validExerciseWeight(def,input.weight)) throw new Error("Invalid exercise or load");
    const setBodyweight=def.equipment==="bodyweight"?historicalBodyweight(existing):bodyweight;
    const load=effectiveLoad(def,input.weight,setBodyweight);
    e1rm=load!=null && load>0 && input.reps>0?computeE1rm(load,input.reps,input.rir):null;
  }
  const { data: saved, error } = await supabase.from("set_log")
    .update({...patch,...(numericChanged?{weight:input.weight,reps:input.reps,rir:input.rir,e1rm}:{})})
    .eq("id", input.setId).eq("user_id", userId).eq("edit_revision",existing.edit_revision)
    .select("id").maybeSingle();
  if(error) throw new Error(error.message);
  if(!saved) throw new Error("This set changed elsewhere. Cancel and reopen to review it. Your draft is still here.");
  let recomputeWarning:string|null=null;
  if(numericChanged) {
    try { await recomputeAndUpsertStat(supabase,userId,existing.exercise_id,bodyweight,catalog); }
    catch { recomputeWarning="Set saved, but couldn't update exercise stats. Your progress tracking may be temporarily out of sync."; }
    await refreshCoachInbox(supabase,userId);
    for(const path of ["/analytics","/analytics/month","/analytics/volume","/analytics/coach"]) revalidatePath(path);
  }
  revalidateSession(existing.session_id);
  revalidatePath("/history/[exerciseId]","page");
  return {recomputeWarning};
}

export async function saveWorkoutExerciseDetail(input: {
  sessionId:string;slotId:string;exerciseId:string;equipmentInstanceId:string|null;
  kind:"setup"|"note";text:string|null;expected:string|null;remember:boolean;referenceExpected:string|null;
}):Promise<void> {
  const {supabase,userId}=await requireUser();
  const catalog=await getCatalogMap(supabase,userId);
  if(!catalog[input.exerciseId]) throw new Error("Exercise unavailable. Your draft is still here.");
  if(input.kind!=="setup" && input.kind!=="note") throw new Error("Invalid detail");
  if(input.kind==="setup" && !supportsSetup(catalog[input.exerciseId],catalog)) throw new Error("Choose a specific machine or cable first.");
  const {error}=await supabase.rpc("save_workout_exercise_detail",{
    p_session:input.sessionId,p_slot:input.slotId,p_exercise:input.exerciseId,p_equipment:input.equipmentInstanceId,
    p_kind:input.kind,p_text:normalizeWorkoutText(input.text),p_expected:normalizeWorkoutText(input.expected),
    p_remember:input.kind==="setup" && input.remember,p_reference_expected:normalizeWorkoutText(input.referenceExpected),
  });
  if(error) throw new Error(error.message);
  revalidateSession(input.sessionId);
  revalidatePath("/history/[exerciseId]","page");
}

export async function deleteSet(setId: string) {
  const { supabase, userId } = await requireUser();

  const { data: existing } = await supabase
    .from("set_log")
    .select("exercise_id, session_id")
    .eq("id", setId)
    .single();
  if (!existing) return;

  const { error } = await supabase.from("set_log").delete().eq("id", setId);
  if (error) throw new Error(error.message);

  const catalog = await getCatalogMap(supabase, userId);
  const bodyweight = await getCurrentBodyweight(supabase, userId);
  let recomputeWarning: string | null = null;
  try {
    await recomputeAndUpsertStat(supabase, userId, existing.exercise_id, bodyweight, catalog);
  } catch {
    recomputeWarning = "Set deleted, but couldn't update exercise stats. Your progress tracking may be temporarily out of sync.";
  }
  await refreshCoachInbox(supabase, userId);
  revalidateSession(existing.session_id);
  revalidatePath("/analytics");
  revalidatePath("/analytics/month");
  revalidatePath("/analytics/volume");
  revalidatePath("/analytics/coach");
  revalidatePath("/history/[exerciseId]", "page");
  return { recomputeWarning };
}

export async function retryRecomputeStat(input: { exerciseId: string; sessionId: string }): Promise<{ success: boolean; warning: string | null }> {
  const { supabase, userId } = await requireUser();
  const catalog = await getCatalogMap(supabase, userId);
  const bodyweight = await getCurrentBodyweight(supabase, userId);
  
  try {
    await recomputeAndUpsertStat(supabase, userId, input.exerciseId, bodyweight, catalog);
    revalidateSession(input.sessionId);
    return { success: true, warning: null };
  } catch {
    return { success: false, warning: "Still couldn't update stats. Try again or continue — this won't affect your saved sets." };
  }
}

export interface SessionSummary {
  achievements: ExerciseRecords[];
  totalSets: number;
  feedback: SessionFeedback;
  // prevE1rm: best e1RM from the previous session of that exact exercise (null = first time).
  topE1rm: { exerciseId: string; name: string; e1rm: number; prevE1rm: number | null }[];
}

export async function saveSessionReadiness(input: {
  sessionId: string;
  readiness: number;
}): Promise<number> {
  const { supabase, userId } = await requireUser();
  const readiness = validateReadiness(input.readiness);

  const [{ data: session }, { count: loggedSets }] = await Promise.all([
    supabase
      .from("workout_session")
      .select("id")
      .eq("id", input.sessionId)
      .eq("user_id", userId)
      .is("finished_at", null)
      .maybeSingle(),
    supabase
      .from("set_log")
      .select("id", { count: "exact", head: true })
      .eq("session_id", input.sessionId)
      .eq("user_id", userId),
  ]);
  if (!session) throw new Error("Open session not found");
  if ((loggedSets ?? 0) > 0) throw new Error("Readiness can only be logged before the first set");

  const { error } = await supabase
    .from("workout_session")
    .update({ readiness })
    .eq("id", input.sessionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  revalidateSession(input.sessionId);
  return readiness;
}

export async function updateSessionFeedback(input: {
  sessionId: string;
  jointPain: JointPain | null;
  note: string | null;
}): Promise<Pick<SessionFeedback, "jointPain" | "note">> {
  const { supabase, userId } = await requireUser();
  const jointPain = normalizeJointPain(input.jointPain);
  const note = normalizeSessionNote(input.note);

  const { data, error } = await supabase
    .from("workout_session")
    .update({ joint_pain: jointPain, notes: note })
    .eq("id", input.sessionId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Session not found");

  await refreshCoachInbox(supabase, userId);
  revalidateSession(input.sessionId);
  revalidatePath("/analytics");
  return { jointPain, note };
}

// Mark finished, return the summary (total working sets, top e1RM per lift, overload delta).
export async function finishSession(
  sessionId: string,
  feedback?: { jointPain: JointPain | null; note: string | null },
): Promise<SessionSummary> {
  const { supabase, userId } = await requireUser();
  const catalog = await getCatalogMap(supabase, userId);

  const { data: session } = await supabase
    .from("workout_session")
    .select("performed_at, finished_at, readiness, joint_pain, notes")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session) throw new Error("Session not found");

  const jointPain = feedback ? normalizeJointPain(feedback.jointPain) : normalizeJointPain(session.joint_pain);
  const note = feedback ? normalizeSessionNote(feedback.note) : session.notes;

  const { current: sets, history: prior, achievements } = await loadWorkoutRecords(
    supabase, userId, sessionId, session.performed_at, catalog,
  );

  if (feedback) {
    const { error } = await supabase
      .from("workout_session")
      .update({ joint_pain: jointPain, notes: note })
      .eq("id", sessionId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  // `is finished_at null` keeps the original finish time when re-viewing the summary.
  const { error } = await supabase
    .from("workout_session")
    .update({ finished_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("finished_at", null);
  if (error) throw new Error(error.message);

  const best = new Map<string, { e1rm: number; exerciseId: string }>();
  for (const set of sets) {
    if (set.is_warmup || set.e1rm == null) continue;
    const scope = comparisonScope(set, catalog);
    const key = comparisonKey(scope);
    const exerciseId = scope.kind === "movement" ? scope.movementId : scope.exerciseId;
    const cur = best.get(key);
    if (!cur || set.e1rm > cur.e1rm) best.set(key, { e1rm: set.e1rm, exerciseId });
  }

  // Overload signal: best e1RM from each movement's most recent earlier session.
  const prevBest = new Map<string, number>();
  if (best.size > 0) {
    const latestSession = new Map<string, { performedAt: string; e1rm: number }>();
    for (const row of prior) {
      if (row.e1rm == null) continue;
      const key = comparisonKey(comparisonScope(row, catalog));
      const at = row.workout_session.performed_at;
      const cur = latestSession.get(key);
      if (!cur || at > cur.performedAt) {
        latestSession.set(key, { performedAt: at, e1rm: row.e1rm as number });
      } else if (at === cur.performedAt && (row.e1rm as number) > cur.e1rm) {
        cur.e1rm = row.e1rm as number;
      }
    }
    for (const [key, v] of latestSession) prevBest.set(key, v.e1rm);
  }

  const topE1rm = [...best.entries()]
    .map(([key, { e1rm, exerciseId }]) => ({
      exerciseId,
      name: catalog[exerciseId]?.name ?? exerciseId,
      e1rm,
      prevE1rm: prevBest.get(key) ?? null,
    }))
    .sort((a, b) => b.e1rm - a.e1rm);

  await refreshCoachInbox(supabase, userId);
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/analytics/month");
  revalidatePath("/analytics/volume");
  revalidatePath("/analytics/coach");
  revalidatePath("/history/[exerciseId]", "page");
  revalidateSession(sessionId);
  return {
    totalSets: sets.filter((s) => !s.is_warmup).length,
    achievements,
    topE1rm,
    feedback: {
      readiness: session.readiness,
      jointPain,
      note,
    },
  };
}

// The RPC checks session/slot ownership and saves both scopes in one transaction.
export async function swapSessionExercise(input: {
  sessionId: string;
  programSlotId: string;
  exerciseId: string;
  scope: "workout" | "program";
}): Promise<void> {
  const { supabase, userId } = await requireUser();
  if (input.scope !== "workout" && input.scope !== "program") throw new Error("Invalid swap scope");
  const catalog = await getCatalogMap(supabase, userId);
  const exercise = catalog[input.exerciseId];
  if (!isLoggableExercise(exercise)) throw new Error("Choose a specific exercise or machine first.");
  const { error } = await supabase.rpc("swap_session_exercise", {
    p_session_id: input.sessionId,
    p_slot_id: input.programSlotId,
    p_exercise_id: exercise.id,
    p_pattern: exercise.pattern,
    p_scope: input.scope,
  });
  if (error) throw new Error(error.message);
  await refreshCoachInbox(supabase, userId);
  revalidateSession(input.sessionId);
  if (input.scope === "program") {
    revalidatePath("/");
    revalidatePath("/program", "layout");
  }
}

// Program-scope swap before a session exists (planner). Uses the same slot/adaptation writes
// as swap_session_exercise(scope='program') without touching workout_session.
export async function swapProgramSlotExercise(input: {
  programSlotId: string;
  exerciseId: string;
}): Promise<void> {
  const { supabase, userId } = await requireUser();
  const catalog = await getCatalogMap(supabase, userId);
  const exercise = catalog[input.exerciseId];
  if (!isLoggableExercise(exercise)) throw new Error("Choose a specific exercise or machine first.");
  const { error } = await supabase.rpc("swap_program_slot_exercise", {
    p_slot_id: input.programSlotId,
    p_exercise_id: exercise.id,
    p_pattern: exercise.pattern,
  });
  if (error) throw new Error(error.message);
  await refreshCoachInbox(supabase, userId);
  revalidatePath("/");
  revalidatePath("/workout/next");
  revalidatePath("/program", "layout");
}
