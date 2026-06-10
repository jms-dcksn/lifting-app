"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { computeE1rm } from "@/lib/strength/e1rm";
import { recomputeStat, effectiveLoad } from "@/lib/strength/recompute";
import { estimatePatternStrength, type ExerciseStat } from "@/lib/strength/recommend";
import { getActiveProgram } from "@/lib/program";

// auth.uid() for RLS; getClaims() is the trusted server-side check (see AGENTS.md).
async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");
  return { supabase, userId };
}

async function getBodyweight(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("profile")
    .select("bodyweight")
    .eq("id", userId)
    .maybeSingle();
  return data?.bodyweight ?? null;
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
) {
  const def = EXERCISE_BY_ID[exerciseId];
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
      const patternStrength = estimatePatternStrength(def.pattern, EXERCISE_BY_ID, others);
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
  const { supabase, userId } = await requireUser();

  const program = await getActiveProgram(supabase, userId);
  if (!program || program.days.length === 0) redirect("/program");

  // Resume an unfinished session rather than starting a duplicate. Sessions whose day was
  // deleted from the program (program_day_id nulled by FK) are unloadable — skip them.
  const { data: open } = await supabase
    .from("workout_session")
    .select("id")
    .eq("user_id", userId)
    .eq("program_id", program.id)
    .not("program_day_id", "is", null)
    .is("finished_at", null)
    .order("performed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) redirect(`/session/${open.id}`);

  const { count } = await supabase
    .from("workout_session")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("program_id", program.id)
    .not("finished_at", "is", null);

  const completed = count ?? 0;
  const dayIndex = completed % program.days.length;
  const week = Math.floor(completed / program.days.length) + 1;
  const day = program.days[dayIndex];

  const { data, error } = await supabase
    .from("workout_session")
    .insert({
      user_id: userId,
      program_id: program.id,
      program_day_id: day.id,
      week_index: week,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not start session");
  redirect(`/session/${data.id}`);
}

export interface LogSetInput {
  sessionId: string;
  programSlotId: string | null;
  exerciseId: string;
  weight: number;
  reps: number;
  rir: number;
}

// Compute e1RM, insert the set, refresh the derived stat. Returns the persisted row.
export async function logSet(input: LogSetInput) {
  const { supabase, userId } = await requireUser();
  const def = EXERCISE_BY_ID[input.exerciseId];
  if (!def) throw new Error(`Unknown exercise: ${input.exerciseId}`);

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
      getBodyweight(supabase, userId),
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
    })
    .select("id, exercise_id, weight, reps, rir, set_index, e1rm")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not log set");

  await recomputeAndUpsertStat(supabase, userId, input.exerciseId, bodyweight);
  revalidatePath(`/session/${input.sessionId}`);
  return data;
}

export interface EditSetInput {
  setId: string;
  weight: number;
  reps: number;
  rir: number;
}

export async function editSet(input: EditSetInput) {
  const { supabase, userId } = await requireUser();

  const { data: existing } = await supabase
    .from("set_log")
    .select("exercise_id, session_id")
    .eq("id", input.setId)
    .single();
  if (!existing) throw new Error("Set not found");

  const def = EXERCISE_BY_ID[existing.exercise_id];
  const bodyweight = await getBodyweight(supabase, userId);
  const load = def ? effectiveLoad(def, input.weight, bodyweight) : input.weight;
  const e1rm =
    load != null && load > 0 && input.reps > 0 ? computeE1rm(load, input.reps, input.rir) : null;

  const { error } = await supabase
    .from("set_log")
    .update({ weight: input.weight, reps: input.reps, rir: input.rir, e1rm })
    .eq("id", input.setId);
  if (error) throw new Error(error.message);

  await recomputeAndUpsertStat(supabase, userId, existing.exercise_id, bodyweight);
  revalidatePath(`/session/${existing.session_id}`);
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

  const bodyweight = await getBodyweight(supabase, userId);
  await recomputeAndUpsertStat(supabase, userId, existing.exercise_id, bodyweight);
  revalidatePath(`/session/${existing.session_id}`);
}

export interface SessionSummary {
  totalSets: number;
  // prevE1rm: best e1RM from the previous session of that exact exercise (null = first time).
  topE1rm: { exerciseId: string; name: string; e1rm: number; prevE1rm: number | null }[];
}

// Mark finished, return the summary (total working sets, top e1RM per lift, overload delta).
export async function finishSession(sessionId: string): Promise<SessionSummary> {
  const { supabase, userId } = await requireUser();

  const { data: session } = await supabase
    .from("workout_session")
    .select("performed_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session) throw new Error("Session not found");

  // `is finished_at null` keeps the original finish time when re-viewing the summary.
  const { error } = await supabase
    .from("workout_session")
    .update({ finished_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("finished_at", null);
  if (error) throw new Error(error.message);

  const { data: sets } = await supabase
    .from("set_log")
    .select("exercise_id, e1rm")
    .eq("session_id", sessionId)
    .eq("is_warmup", false);

  const best = new Map<string, number>();
  for (const set of sets ?? []) {
    if (set.e1rm == null) continue;
    const cur = best.get(set.exercise_id) ?? 0;
    if (set.e1rm > cur) best.set(set.exercise_id, set.e1rm);
  }

  // Overload signal: best e1RM from each exercise's most recent earlier session.
  const prevBest = new Map<string, number>();
  if (best.size > 0) {
    const { data: prior } = await supabase
      .from("set_log")
      .select("exercise_id, e1rm, session_id, workout_session!inner(performed_at)")
      .eq("user_id", userId)
      .neq("session_id", sessionId)
      .eq("is_warmup", false)
      .not("e1rm", "is", null)
      .in("exercise_id", [...best.keys()])
      .lt("workout_session.performed_at", session.performed_at);

    const latestSession = new Map<string, { performedAt: string; e1rm: number }>();
    for (const row of prior ?? []) {
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
      name: EXERCISE_BY_ID[exerciseId]?.name ?? exerciseId,
      e1rm,
      prevE1rm: prevBest.get(exerciseId) ?? null,
    }))
    .sort((a, b) => b.e1rm - a.e1rm);

  revalidatePath("/");
  return { totalSets: sets?.length ?? 0, topE1rm };
}
