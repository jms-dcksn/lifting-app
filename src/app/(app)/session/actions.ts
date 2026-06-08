"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { EXERCISE_BY_ID } from "@/lib/strength/coefficients";
import { computeE1rm } from "@/lib/strength/e1rm";
import { recomputeStat, effectiveLoad } from "@/lib/strength/recompute";
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
// set_log is the source of truth; this keeps the cache from drifting. Personal
// coefficient (machine calibration) is preserved untouched here — it lands in P5.
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
    .select("weight, reps, rir")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("is_warmup", false);

  const { currentE1rm } = recomputeStat(def, sets ?? [], bodyweight);

  await supabase.from("user_exercise_stat").upsert(
    {
      user_id: userId,
      exercise_id: exerciseId,
      current_e1rm: currentE1rm,
      last_updated: new Date().toISOString(),
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

  // Resume an unfinished session rather than starting a duplicate.
  const { data: open } = await supabase
    .from("workout_session")
    .select("id")
    .eq("user_id", userId)
    .eq("program_id", program.id)
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

  const bodyweight = await getBodyweight(supabase, userId);

  // set_index is per (session, exercise): the position in this session's working sets.
  const { count: priorThisSession } = await supabase
    .from("set_log")
    .select("id", { count: "exact", head: true })
    .eq("session_id", input.sessionId)
    .eq("exercise_id", input.exerciseId);

  // First-ever set on a machine that needs calibration is a calibration set (P5 uses this).
  const { count: priorEver } = await supabase
    .from("set_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("exercise_id", input.exerciseId);

  const load = effectiveLoad(def, input.weight, bodyweight);
  const e1rm = load > 0 && input.reps > 0 ? computeE1rm(load, input.reps, input.rir) : null;

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
  const e1rm = load > 0 && input.reps > 0 ? computeE1rm(load, input.reps, input.rir) : null;

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
  topE1rm: { exerciseId: string; name: string; e1rm: number }[];
}

// Mark finished, return the summary (total working sets, top e1RM per lift).
export async function finishSession(sessionId: string): Promise<SessionSummary> {
  const { supabase, userId } = await requireUser();

  await supabase
    .from("workout_session")
    .update({ finished_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId);

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

  const topE1rm = [...best.entries()]
    .map(([exerciseId, e1rm]) => ({
      exerciseId,
      name: EXERCISE_BY_ID[exerciseId]?.name ?? exerciseId,
      e1rm,
    }))
    .sort((a, b) => b.e1rm - a.e1rm);

  revalidatePath("/");
  return { totalSets: sets?.length ?? 0, topE1rm };
}
