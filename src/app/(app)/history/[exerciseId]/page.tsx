import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCatalogMap } from "@/lib/catalog";
import { defaultCompoundIds, isExercisePinned } from "@/lib/board";
import { isLoggableExercise } from "@/lib/station";
import { dateKey } from "@/lib/bodyweight";
import { getCurrentBodyweight } from "@/lib/current-bodyweight";
import { loadUserPinRows } from "@/lib/pins-data";
import { isEligibleForPeriodTracking, loadPeriodObservationsInRange } from "@/lib/period-calendar";
import { groupReviewSessions, withProgramNames } from "@/lib/exercise-review-sessions";
import { reviewMonthParam } from "@/lib/review-month";
import { exerciseReviewHref } from "@/lib/exercise-review-href";
import {
  resolveReviewEquipment,
  reviewEquipmentChoiceLabel,
  reviewEquipmentChoices,
  reviewEquipmentLabel,
  reviewEquipmentParam,
  rowsForReviewEquipment,
} from "@/lib/review-equipment";
import type { ReviewMonthSource } from "@/lib/exercise-review-month-stats";
import type { MonthlySession } from "@/lib/monthly-progress";
import type { RecordSet } from "@/lib/strength/records";
import { ExerciseReview, type EquipmentChoice } from "./exercise-review";

type SessionJoin = {
  performed_at: string;
  finished_at: string | null;
  program_id?: string | null;
};

export default async function HistoryPage({
  params, searchParams,
}: {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<{ month?: string | string[]; equipment?: string | string[] }>;
}) {
  const { exerciseId } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const now = new Date();
  const catalog = await getCatalogMap(supabase, userId);
  const query = await searchParams;
  const reviewMonth = reviewMonthParam(query.month, now);
  const requestedEquipment = reviewEquipmentParam(query.equipment);
  const pinRows = await loadUserPinRows(supabase, userId);
  const def = catalog[exerciseId];
  const name = def?.name ?? exerciseId;
  const isBodyweight = def?.equipment === "bodyweight";
  const pin = isLoggableExercise(def)
    ? { exerciseId, pinned: isExercisePinned(pinRows, defaultCompoundIds(catalog), exerciseId), name }
    : undefined;

  const { data: rows, error } = await supabase
    .from("set_log")
    .select("id, user_id, weight, reps, rir, e1rm, session_id, created_at, exercise_id, equipment_instance_id, program_slot_id, is_warmup, workout_session!inner(performed_at, finished_at, program_id)")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("is_warmup", false)
    .not("workout_session.finished_at", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const history = (rows ?? []).map((row) => {
    const workout = sessionJoin(row.workout_session);
    return {
      id: row.id,
      sessionId: row.session_id,
      weight: row.weight,
      reps: row.reps,
      rir: row.rir,
      e1rm: row.e1rm,
      performedAt: workout.performed_at,
      finishedAt: workout.finished_at,
      programId: workout.program_id ?? null,
      userId: row.user_id ?? userId,
      exerciseId: row.exercise_id ?? exerciseId,
      equipmentInstanceId: row.equipment_instance_id ?? null,
      programSlotId: row.program_slot_id ?? null,
      isWarmup: row.is_warmup ?? false,
      createdAt: row.created_at,
    };
  });

  const identities = reviewEquipmentChoices(history, now);
  const selectedEquipment = resolveReviewEquipment(requestedEquipment, history, now);
  const selectedHistory = rowsForReviewEquipment(history, selectedEquipment);
  const instanceIds = identities.filter((id): id is string => id != null);
  const instanceLabels = new Map<string, { label: string | null; gym: string | null }>();
  if (instanceIds.length > 0) {
    const { data: instances, error: instanceError } = await supabase
      .from("equipment_instance")
      .select("id, label, gym")
      .eq("user_id", userId)
      .in("id", instanceIds);
    if (instanceError) throw new Error(instanceError.message);
    for (const instance of instances ?? []) {
      instanceLabels.set(instance.id, { label: instance.label, gym: instance.gym });
    }
  }
  const equipmentLabel = reviewEquipmentLabel(instanceLabels.get(selectedEquipment ?? ""), selectedEquipment);
  const equipmentChoices: EquipmentChoice[] | undefined = identities.length > 1
    ? identities.map((id) => ({
        id,
        label: reviewEquipmentChoiceLabel(instanceLabels.get(id ?? ""), id),
        href: exerciseReviewHref({
          exerciseId,
          equipmentInstanceId: id,
          month: reviewMonth,
        }),
        selected: id === selectedEquipment,
      }))
    : undefined;

  const grouped = groupReviewSessions(selectedHistory, now);
  const programIds = [...new Set(grouped.map((session) => session.programId).filter((id): id is string => id != null))];
  const programNames = new Map<string, string>();
  if (programIds.length > 0) {
    const { data: programs, error: programError } = await supabase
      .from("program")
      .select("id, name")
      .in("id", programIds);
    if (programError) throw new Error(programError.message);
    for (const program of programs ?? []) {
      const label = program.name?.trim();
      if (label) programNames.set(program.id, label);
    }
  }
  const sessions = withProgramNames(grouped, programNames);

  if (!def && sessions.length === 0 && identities.length === 0) {
    return <ExerciseReview status="missing" reviewMonth={reviewMonth} />;
  }
  if (sessions.length === 0) {
    return (
      <ExerciseReview
        status="empty"
        name={name}
        reviewMonth={reviewMonth}
        pin={pin}
        equipmentLabel={equipmentLabel}
        equipmentChoices={equipmentChoices}
      />
    );
  }

  const bodyweight = isBodyweight ? await getCurrentBodyweight(supabase, userId) : null;
  const monthlySessions = monthlySessionsFrom(selectedHistory, userId);
  const monthSource: ReviewMonthSource = {
    userId,
    exerciseId,
    equipmentInstanceId: selectedEquipment,
    catalog: def ? { [exerciseId]: def } : {},
    sessions: monthlySessions,
    sets: recordSetsFrom(selectedHistory, userId),
    bodyweight,
  };

  const periodEligible = await isEligibleForPeriodTracking(supabase, userId);
  const periodDates = periodEligible
    ? (await loadPeriodObservationsInRange(
        supabase,
        userId,
        sessions[0].dateKey,
        dateKey(now),
      )).map((observation) => observation.observedOn)
    : [];

  return (
    <ExerciseReview
      status="ready"
      name={name}
      isBodyweight={isBodyweight}
      sessions={sessions}
      reviewMonth={reviewMonth}
      pin={pin}
      now={now}
      periodEligible={periodEligible}
      periodDates={periodDates}
      monthSource={monthSource}
      equipmentLabel={equipmentLabel}
      equipmentChoices={equipmentChoices}
    />
  );
}

function sessionJoin(value: SessionJoin | SessionJoin[] | null | undefined): SessionJoin {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) return { performed_at: "", finished_at: null, program_id: null };
  return {
    performed_at: row.performed_at,
    finished_at: row.finished_at,
    program_id: row.program_id ?? null,
  };
}

function monthlySessionsFrom(
  rows: { sessionId: string; performedAt: string; finishedAt: string | null; programId: string | null }[],
  userId: string,
): MonthlySession[] {
  const sessions = new Map<string, MonthlySession>();
  for (const row of rows) {
    if (!sessions.has(row.sessionId)) {
      sessions.set(row.sessionId, {
        id: row.sessionId,
        user_id: userId,
        performed_at: row.performedAt,
        finished_at: row.finishedAt,
        program_id: row.programId,
      });
    }
  }
  return [...sessions.values()];
}

function recordSetsFrom(
  rows: {
    id: string;
    sessionId: string;
    weight: number;
    reps: number;
    rir: number | null;
    e1rm: number | null;
    performedAt: string;
    finishedAt: string | null;
    userId: string;
    exerciseId: string;
    equipmentInstanceId: string | null;
    programSlotId: string | null;
    isWarmup: boolean;
    createdAt: string;
  }[],
  userId: string,
): RecordSet[] {
  return rows.map((row) => ({
    id: row.id,
    user_id: userId,
    session_id: row.sessionId,
    exercise_id: row.exerciseId,
    equipment_instance_id: row.equipmentInstanceId,
    program_slot_id: row.programSlotId,
    weight: row.weight,
    reps: row.reps,
    rir: row.rir,
    e1rm: row.e1rm,
    is_warmup: row.isWarmup,
    created_at: row.createdAt,
    workout_session: { performed_at: row.performedAt, finished_at: row.finishedAt },
  }));
}
