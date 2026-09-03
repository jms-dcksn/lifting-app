import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { bodyweightTrend, dateKey, type BodyweightEntry } from "./bodyweight";
import {
  buildCoachCheckInReport,
  COACH_REPORT_TIMEZONE,
  type CoachPhaseInput,
  type CoachSessionInput,
  type CoachSetInput,
  type CoachSlotInput,
} from "./coach-check-in";
import { weeklyResponse, type CoachWeeklyResponse } from "./coach-api";
import { buildCoachRecommendations } from "./coach-recommendations";
import { mergeCatalog, type DbExerciseRow } from "./catalog";
import type { Database } from "./supabase/types";

type Client = SupabaseClient<Database>;
type SetRow = Database["public"]["Tables"]["set_log"]["Row"];

export async function loadCoachWeekly(userId: string): Promise<CoachWeeklyResponse> {
  return loadCoachWeeklyWithClient(createCoachApiClient(), userId);
}

export async function loadCoachWeeklyWithClient(
  supabase: Client,
  userId: string,
  generatedAt = new Date(),
): Promise<CoachWeeklyResponse> {
  const [
    setsResult,
    profileResult,
    sessionsResult,
    bodyweightResult,
    daysResult,
    slotsResult,
    phasesResult,
    exercisesResult,
    programResult,
  ] = await Promise.all([
    supabase
      .from("set_log")
      .select("session_id, program_slot_id, exercise_id, set_index, weight, reps, rir, e1rm, created_at, is_warmup")
      .eq("user_id", userId)
      .eq("is_warmup", false)
      .order("created_at", { ascending: true }),
    supabase.from("profile").select("bodyweight").eq("id", userId).maybeSingle(),
    supabase
      .from("workout_session")
      .select("id, performed_at, finished_at, program_id, program_day_id, week_index, readiness, joint_pain, notes")
      .eq("user_id", userId),
    supabase
      .from("bodyweight_log")
      .select("id, logged_on, weight")
      .eq("user_id", userId)
      .order("logged_on", { ascending: false }),
    supabase
      .from("program_day")
      .select("id, program_id, name")
      .eq("user_id", userId),
    supabase
      .from("program_slot")
      .select("id, program_day_id, exercise_id, target_sets, rep_min, rep_max, target_rir")
      .eq("user_id", userId),
    supabase
      .from("program_phase")
      .select("id, program_id, position, name, description, week_start, week_end, target_rir_min, target_rir_max, set_multiplier")
      .eq("user_id", userId),
    supabase
      .from("exercise")
      .select("id, name, pattern, equipment, brand, machine_type, base_exercise_id, coefficient, is_reference, needs_calibration, increment")
      .eq("user_id", userId),
    supabase
      .from("program")
      .select("id, name")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  for (const result of [
    setsResult,
    profileResult,
    sessionsResult,
    bodyweightResult,
    daysResult,
    slotsResult,
    phasesResult,
    exercisesResult,
    programResult,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  const dayById = new Map((daysResult.data ?? []).map((day) => [day.id, day]));
  const sessions: CoachSessionInput[] = (sessionsResult.data ?? []).map((session) => ({
    id: session.id,
    performedAt: session.performed_at,
    finishedAt: session.finished_at,
    programId: session.program_id,
    programDayId: session.program_day_id,
    programDayName: session.program_day_id
      ? dayById.get(session.program_day_id)?.name ?? null
      : null,
    weekIndex: session.week_index,
    readiness: session.readiness,
    jointPain: session.joint_pain as CoachSessionInput["jointPain"],
    note: session.notes,
  }));
  const sets: CoachSetInput[] = ((setsResult.data ?? []) as Pick<
    SetRow,
    "session_id" | "program_slot_id" | "exercise_id" | "set_index" | "weight" | "reps" | "rir" | "e1rm" | "created_at" | "is_warmup"
  >[]).map((set) => ({
    sessionId: set.session_id,
    programSlotId: set.program_slot_id,
    exerciseId: set.exercise_id,
    setIndex: set.set_index,
    weight: set.weight,
    reps: set.reps,
    rir: set.rir,
    e1rm: set.e1rm,
    isWarmup: set.is_warmup,
    createdAt: set.created_at,
  }));
  const slots: CoachSlotInput[] = (slotsResult.data ?? []).flatMap((slot) => {
    const day = dayById.get(slot.program_day_id);
    return day ? [{
      id: slot.id,
      programId: day.program_id,
      programDayId: slot.program_day_id,
      exerciseId: slot.exercise_id,
      targetSets: slot.target_sets,
      repMin: slot.rep_min,
      repMax: slot.rep_max,
      targetRir: slot.target_rir,
    }] : [];
  });
  const phases: CoachPhaseInput[] = (phasesResult.data ?? []).map((phase) => ({
    id: phase.id,
    programId: phase.program_id,
    position: phase.position,
    name: phase.name,
    description: phase.description,
    weekStart: phase.week_start,
    weekEnd: phase.week_end,
    targetRirMin: phase.target_rir_min,
    targetRirMax: phase.target_rir_max,
    setMultiplier: phase.set_multiplier,
  }));
  const bodyweightEntries: BodyweightEntry[] = (bodyweightResult.data ?? []).map((entry) => ({
    id: entry.id,
    loggedOn: entry.logged_on,
    weight: entry.weight,
  }));
  const trend = bodyweightTrend(
    bodyweightEntries,
    dateKey(generatedAt, COACH_REPORT_TIMEZONE),
  );
  const currentBodyweight = trend.latest?.weight ?? profileResult.data?.bodyweight ?? null;
  const definitions = mergeCatalog((exercisesResult.data ?? []) as DbExerciseRow[]);
  const activeProgram = programResult.data;
  const report = buildCoachCheckInReport({
    generatedAt,
    programName: activeProgram?.name,
    plannedSessions: activeProgram
      ? (daysResult.data ?? []).filter((day) => day.program_id === activeProgram.id).length
      : 0,
    sessions,
    sets,
    slots,
    phases,
    definitions,
    currentBodyweight,
    bodyweightTrend: trend,
  });

  return weeklyResponse(report, buildCoachRecommendations({
    report,
    activeProgramId: activeProgram?.id ?? null,
    sessions,
    sets,
    slots,
    phases,
    definitions,
    currentBodyweight,
  }));
}

function createCoachApiClient(): Client {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error("Coach API database configuration is missing");

  return createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
