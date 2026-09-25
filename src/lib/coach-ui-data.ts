import { loadStallAssessments } from "@/lib/stall-data";
import { bodyweightTrend, dateKey } from "@/lib/bodyweight";
import { loadWeightHistory } from "@/lib/weight-history";
import { createClient } from "@/lib/supabase/server";
import { getCatalogMap } from "@/lib/catalog";
import { getActiveProgram } from "@/lib/program";
import {
  buildCoachCheckInReport,
  formatCoachCheckIn,
  type CoachPhaseInput,
  type CoachSessionInput,
  type CoachSetInput,
  type CoachSlotInput,
} from "@/lib/coach-check-in";
import {
  buildCoachRecommendations,
  formatCoachRecommendations,
} from "@/lib/coach-recommendations";
import type { RecommendationDecision } from "@/lib/coach-recommendation-decisions";

type CoachQueryRow = {
  session_id: string;
  exercise_id: string;
  weight: number;
  reps: number;
  rir: number | null;
  e1rm: number | null;
  created_at: string;
  is_warmup: boolean;
  program_slot_id: string | null;
  set_index: number;
};

export async function loadCoachUi(userId: string) {
  const supabase = await createClient();
  const today = dateKey(new Date());
  const [
    { data: rows, error },
    { data: profile, error: profileError },
    { data: sessionRows, error: sessionError },
    bodyweightEntries,
    { data: dayRows, error: dayError },
    { data: slotRows, error: slotError },
    { data: phaseRows, error: phaseError },
    { data: decisionRows, error: decisionError },
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
    loadWeightHistory(supabase, userId, today),
    supabase.from("program_day").select("id, program_id, name").eq("user_id", userId),
    supabase
      .from("program_slot")
      .select("id, program_day_id, exercise_id, target_sets, rep_min, rep_max, target_rir")
      .eq("user_id", userId),
    supabase
      .from("program_phase")
      .select("id, program_id, position, name, description, week_start, week_end, target_rir_min, target_rir_max, set_multiplier")
      .eq("user_id", userId),
    supabase
      .from("coach_recommendation_decision")
      .select("recommendation_key, status, deferred_until")
      .eq("user_id", userId),
  ]);

  if (error) throw new Error(error.message);
  if (profileError) throw new Error(profileError.message);
  if (sessionError) throw new Error(sessionError.message);
  if (dayError) throw new Error(dayError.message);
  if (slotError) throw new Error(slotError.message);
  if (phaseError) throw new Error(phaseError.message);
  if (decisionError) throw new Error(decisionError.message);

  const [catalog, program] = await Promise.all([
    getCatalogMap(supabase, userId),
    getActiveProgram(supabase, userId),
  ]);
  const weightTrend = bodyweightTrend(bodyweightEntries, today);
  const bodyweight = weightTrend.latest?.weight ?? profile?.bodyweight ?? null;
  const dayById = new Map((dayRows ?? []).map((day) => [day.id, day]));
  const coachSessions: CoachSessionInput[] = (sessionRows ?? []).map((session) => ({
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
  const coachSets: CoachSetInput[] = ((rows ?? []) as CoachQueryRow[]).map((row) => ({
    sessionId: row.session_id,
    programSlotId: row.program_slot_id,
    exerciseId: row.exercise_id,
    setIndex: row.set_index,
    weight: row.weight,
    reps: row.reps,
    rir: row.rir,
    e1rm: row.e1rm,
    isWarmup: row.is_warmup,
    createdAt: row.created_at,
  }));
  const coachSlots: CoachSlotInput[] = (slotRows ?? []).flatMap((slot) => {
    const day = dayById.get(slot.program_day_id);
    if (!day) return [];
    return [{
      id: slot.id,
      programId: day.program_id,
      programDayId: slot.program_day_id,
      exerciseId: slot.exercise_id,
      targetSets: slot.target_sets,
      repMin: slot.rep_min,
      repMax: slot.rep_max,
      targetRir: slot.target_rir,
    }];
  });
  const coachPhases: CoachPhaseInput[] = (phaseRows ?? []).map((phase) => ({
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
  const coachReport = buildCoachCheckInReport({
    programName: program?.name,
    plannedSessions: program?.days.length,
    sessions: coachSessions,
    sets: coachSets,
    slots: coachSlots,
    phases: coachPhases,
    definitions: catalog,
    currentBodyweight: bodyweight,
    bodyweightTrend: weightTrend,
  });
  const stalls = await loadStallAssessments(supabase, userId, catalog, new Date(coachReport.generatedAt));
  const coachRecommendations = buildCoachRecommendations({
    stalls,
    report: coachReport,
    activeProgramId: program?.id ?? null,
    sessions: coachSessions,
    sets: coachSets,
    slots: coachSlots,
    phases: coachPhases,
    definitions: catalog,
    currentBodyweight: bodyweight,
  });
  const decisions: RecommendationDecision[] = (decisionRows ?? []).flatMap((row) => {
    if (row.status !== "accepted" && row.status !== "dismissed" && row.status !== "deferred") {
      return [];
    }
    return [{
      recommendationKey: row.recommendation_key,
      status: row.status,
      deferredUntil: row.deferred_until,
    }];
  });
  return {
    catalog,
    coachReport,
    coachRecommendations,
    coachCheckIn: `${formatCoachCheckIn(coachReport)}\n\n${formatCoachRecommendations(coachRecommendations)}`,
    decisions,
  };
}
