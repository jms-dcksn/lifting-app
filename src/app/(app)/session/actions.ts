"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { loadNextWorkout } from "@/lib/next-workout";
import { WORKOUT_PLAN_COOKIE } from "@/lib/workout-plan";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCatalogMap } from "@/lib/catalog";
import { exerciseFamilyIds, loadExerciseHistory } from "@/lib/exercise-history";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import { loadWorkoutRecords } from "@/lib/workout-records";
import { historicalBodyweight, validSetNumbers, type ExerciseRecords } from "@/lib/strength/records";
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

export async function getExerciseHistory(exerciseId: string, sessionId: string) {
  const { supabase, userId } = await requireUser();
  const catalog = await getCatalogMap(supabase, userId);
  if (!catalog[exerciseId]) throw new Error("Exercise not found. Please reopen history.");
  const rows = await loadExerciseHistory(supabase, userId, exerciseFamilyIds(exerciseId, catalog), sessionId);
  return rows.map((row) => ({ ...row, name: catalog[row.exercise_id]?.name ?? row.exercise_id }));
}

// Rebuild user_exercise_stat.current_e1rm for one exercise from its set_log rows.
// set_log is the source of truth; this keeps the cache from drifting.
//
// Machine calibration: exercises with arbitrary load units (needsCalibration) get a
// personal coefficient = observed e1RM / pattern strength estimated from the OTHER
// logged variants. It anchors on the first calibration session (re-anchored while only
// one session exists, so edits/deletes of that session stay consistent) and is then held
// fixed — later machine progress moves pattern strength, not the coefficient.
// coeff_confidence_n tracks distinct sessions, growing trust in the personal coefficient
// over the population prior (shrinkage in recommend.ts) and graduating confidence.
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
    .eq("is_warmup", false);

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
  const { supabase, userId } = await requireUser();

  const program = await getActiveProgram(supabase, userId);
  if (!program || program.days.length === 0) redirect("/program");

  const next = await loadNextWorkout(supabase, userId, program);
  if (next.open) redirect(`/session/${next.open.id}`);
  if (planKey && planKey !== next.key) redirect("/workout/next");
  const { day, week, choices } = next;

  const { data, error } = await supabase
    .from("workout_session")
    .insert({
      user_id: userId,
      program_id: program.id,
      program_day_id: day.id,
      week_index: week,
      exercise_swaps: choices,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not start session");
  (await cookies()).delete(WORKOUT_PLAN_COOKIE);
  revalidatePath("/");
  redirect(`/session/${data.id}`);
}

export interface LogSetInput {
  sessionId: string;
  programSlotId: string | null;
  exerciseId: string;
  weight: number;
  reps: number;
  rir: number;
  idempotencyKey?: string;
}

// Compute e1RM, insert the set, refresh the derived stat. Returns the persisted row.
export async function logSet(input: LogSetInput) {
  const { supabase, userId } = await requireUser();
  const catalog = await getCatalogMap(supabase, userId);
  const def = catalog[input.exerciseId];
  if (!def) throw new Error(`Unknown exercise: ${input.exerciseId}`);

  if (!validSetNumbers(input) || input.rir == null || (def.equipment !== "bodyweight" && input.weight <= 0) || def.machineTemplate) {
    throw new Error("Enter a valid weight, whole-number reps, and RIR from 0 to 5.");
  }

  // set_index is per (session, slot) so a duplicated exercise across two slots keeps
  // independent set chains; ad-hoc sets (no slot) fall back to per (session, exercise).
  let setIndexQuery = supabase
    .from("set_log")
    .select("id", { count: "exact", head: true })
    .eq("session_id", input.sessionId);
  setIndexQuery = input.programSlotId
    ? setIndexQuery.eq("program_slot_id", input.programSlotId)
    : setIndexQuery.eq("exercise_id", input.exerciseId);

  const [{ data: session }, bodyweight, { count: priorThisSession }, { count: priorEver }] =
    await Promise.all([
      // The session id comes from the client — confirm it is this user's session.
      supabase
        .from("workout_session")
        .select("id")
        .eq("id", input.sessionId)
        .eq("user_id", userId)
        .maybeSingle(),
      getCurrentBodyweight(supabase, userId),
      setIndexQuery,
      // First-ever set on a machine that needs calibration is a calibration set (P5 uses this).
      supabase
        .from("set_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("exercise_id", input.exerciseId),
    ]);
  if (!session) throw new Error("Session not found");

  const load = effectiveLoad(def, input.weight, bodyweight);
  const e1rm =
    load != null && load > 0 && input.reps > 0 ? computeE1rm(load, input.reps, input.rir) : null;

  const { data, error } = await supabase
    .from("set_log")
    .insert({
      user_id: userId,
      session_id: input.sessionId,
      program_slot_id: input.programSlotId,
      exercise_id: input.exerciseId,
      set_index: priorThisSession ?? 0,
      weight: input.weight,
      reps: input.reps,
      rir: input.rir,
      e1rm,
      is_calibration: !!def.needsCalibration && (priorEver ?? 0) === 0,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select("id, exercise_id, weight, reps, rir, set_index, e1rm")
    .single();

  // Idempotent insert: on unique constraint violation, return existing row.
  if (error?.code === "23505" && input.idempotencyKey) {
    const { data: existing, error: readError } = await supabase
      .from("set_log")
      .select("id, exercise_id, weight, reps, rir, set_index, e1rm")
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
  setId: string;
  weight: number;
  reps: number;
  rir: number;
}

export async function editSet(input: EditSetInput) {
  const { supabase, userId } = await requireUser();
  if (!validSetNumbers(input) || input.rir == null) throw new Error("Enter a valid weight, whole-number reps, and RIR from 0 to 5.");

  const { data: existing } = await supabase
    .from("set_log")
    .select("exercise_id, session_id, weight, reps, rir, e1rm")
    .eq("user_id", userId)
    .eq("id", input.setId)
    .single();
  if (!existing) throw new Error("Set not found");

  const catalog = await getCatalogMap(supabase, userId);
  const def = catalog[existing.exercise_id];
  const bodyweight = await getCurrentBodyweight(supabase, userId);
  if (!def || (def.equipment !== "bodyweight" && input.weight <= 0)) throw new Error("Invalid exercise or load");
  // Preserve the bodyweight used by the original saved set, including historical edits.
  // If it was unknown then, keep e1RM unknown rather than substituting today's weigh-in.
  const setBodyweight = def.equipment === "bodyweight" ? historicalBodyweight(existing) : bodyweight;
  const load = effectiveLoad(def, input.weight, setBodyweight);
  const e1rm =
    load != null && load > 0 && input.reps > 0 ? computeE1rm(load, input.reps, input.rir) : null;

  const { error } = await supabase
    .from("set_log")
    .update({ weight: input.weight, reps: input.reps, rir: input.rir, e1rm })
    .eq("id", input.setId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  let recomputeWarning: string | null = null;
  try {
    await recomputeAndUpsertStat(supabase, userId, existing.exercise_id, bodyweight, catalog);
  } catch {
    recomputeWarning = "Set saved, but couldn't update exercise stats. Your progress tracking may be temporarily out of sync.";
  }
  revalidateSession(existing.session_id);
  revalidatePath("/analytics");
  revalidatePath("/analytics/month");
  revalidatePath("/history/[exerciseId]", "page");
  return { recomputeWarning };
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
  revalidateSession(existing.session_id);
  revalidatePath("/analytics");
  revalidatePath("/analytics/month");
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

  const best = new Map<string, number>();
  for (const set of sets) {
    if (set.is_warmup || set.e1rm == null) continue;
    const cur = best.get(set.exercise_id) ?? 0;
    if (set.e1rm > cur) best.set(set.exercise_id, set.e1rm);
  }

  // Overload signal: best e1RM from each exercise's most recent earlier session.
  const prevBest = new Map<string, number>();
  if (best.size > 0) {
    const latestSession = new Map<string, { performedAt: string; e1rm: number }>();
    for (const row of prior) {
      if (row.e1rm == null) continue;
      const at = row.workout_session.performed_at;
      const cur = latestSession.get(row.exercise_id);
      if (!cur || at > cur.performedAt) {
        latestSession.set(row.exercise_id, { performedAt: at, e1rm: row.e1rm as number });
      } else if (at === cur.performedAt && (row.e1rm as number) > cur.e1rm) {
        cur.e1rm = row.e1rm as number;
      }
    }
    for (const [exerciseId, v] of latestSession) prevBest.set(exerciseId, v.e1rm);
  }

  const topE1rm = [...best.entries()]
    .map(([exerciseId, e1rm]) => ({
      exerciseId,
      name: catalog[exerciseId]?.name ?? exerciseId,
      e1rm,
      prevE1rm: prevBest.get(exerciseId) ?? null,
    }))
    .sort((a, b) => b.e1rm - a.e1rm);

  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/analytics/month");
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

// Fluid programs: record an accepted plateau intervention (rep-range change or swap) to the
// append-only movement_adaptation log. The resulting ladder step is 0 after a swap (fresh
// movement) or +1 after a rep change. The folded prescription advances, so the suggestion
// self-clears next load.
export async function acceptAdaptation(input: {
  sessionId: string;
  programSlotId: string;
  exerciseId: string;
  action: "rep_change" | "swap";
  ladderStep: number;
  newExerciseId?: string;
  newRepMin?: number;
  newRepMax?: number;
}): Promise<void> {
  const { supabase, userId } = await requireUser();

  const resultingStep = input.action === "swap" ? 0 : input.ladderStep + 1;

  const { error } = await supabase.from("movement_adaptation").insert({
    user_id: userId,
    program_slot_id: input.programSlotId,
    exercise_id: input.exerciseId,
    action: input.action,
    new_exercise_id: input.newExerciseId ?? null,
    new_rep_min: input.newRepMin ?? null,
    new_rep_max: input.newRepMax ?? null,
    ladder_step: resultingStep,
  });
  if (error) throw new Error(error.message);

  if (input.action === "swap" && input.newExerciseId) {
    await swapSessionExercise({ sessionId: input.sessionId, programSlotId: input.programSlotId,
      exerciseId: input.newExerciseId, scope: "workout" });
  }
  revalidateSession(input.sessionId);
}

// "Keep going": snooze the suggestion for SNOOZE_EXPOSURES more exposures.
export async function dismissAdaptation(input: {
  programSlotId: string;
  exerciseId: string;
}): Promise<void> {
  const { supabase, userId } = await requireUser();

  const { error } = await supabase.from("movement_adaptation").insert({
    user_id: userId,
    program_slot_id: input.programSlotId,
    exercise_id: input.exerciseId,
    action: "dismiss",
  });
  if (error) throw new Error(error.message);
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
  if (!exercise || exercise.machineTemplate) throw new Error("Choose a specific exercise or machine first.");
  const { error } = await supabase.rpc("swap_session_exercise", {
    p_session_id: input.sessionId,
    p_slot_id: input.programSlotId,
    p_exercise_id: exercise.id,
    p_pattern: exercise.pattern,
    p_scope: input.scope,
  });
  if (error) throw new Error(error.message);
  revalidateSession(input.sessionId);
  if (input.scope === "program") {
    revalidatePath("/");
    revalidatePath("/program", "layout");
  }
}
