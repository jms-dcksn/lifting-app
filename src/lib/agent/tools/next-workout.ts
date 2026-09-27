import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentBodyweight } from "@/lib/current-bodyweight";
import { loadNextWorkout } from "@/lib/next-workout";
import { getActiveProgram } from "@/lib/program";
import {
  selectProgressionReference,
  sessionTarget,
  type ProgressionPerformance,
} from "@/lib/strength/progression";
import type { ExerciseStat } from "@/lib/strength/recommend";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

type PriorSetRow = {
  session_id: string;
  program_slot_id: string | null;
  exercise_id: string;
  weight: number;
  reps: number;
  rir: number | null;
  e1rm: number | null;
  set_index: number;
  created_at: string;
  workout_session:
    | { performed_at: string; finished_at: string | null }
    | { performed_at: string; finished_at: string | null }[]
    | null;
};

export async function nextWorkout(supabase: Client, userId: string) {
  const program = await getActiveProgram(supabase, userId);
  if (!program || program.days.length === 0) {
    return { source: "nextWorkout" as const, workout: null };
  }
  const next = await loadNextWorkout(supabase, userId, program);
  const exerciseIds = [...new Set(next.slots.map((slot) => slot.exerciseId))];
  const [bodyweight, { data: statRows, error: statError }, progressionByExercise] = await Promise.all([
    getCurrentBodyweight(supabase, userId),
    supabase
      .from("user_exercise_stat")
      .select("exercise_id, current_e1rm, personal_coefficient, coeff_confidence_n")
      .eq("user_id", userId),
    loadProgressionByExercise(supabase, userId, exerciseIds),
  ]);
  if (statError) throw new Error(statError.message);
  const stats: ExerciseStat[] = (statRows ?? []).map((row) => ({
    exerciseId: row.exercise_id,
    currentE1rm: row.current_e1rm ?? 0,
    personalCoefficient: row.personal_coefficient,
    confidenceN: row.coeff_confidence_n,
  }));
  const slots = hydrateSlotTargets({
    slots: next.slots,
    catalog: next.catalog,
    stats,
    bodyweight,
    progressionByExercise,
  });
  return {
    source: "nextWorkout" as const,
    workout: {
      programName: program.name,
      dayName: next.day.name,
      week: next.week,
      completedSessions: next.completed,
      openSessionId: next.open?.id ?? null,
      slots,
    },
  };
}

export function hydrateSlotTargets(input: {
  slots: Array<{
    id: string;
    exerciseId: string;
    targetSets: number;
    prescription: { repMin: number; repMax: number; targetRir: number };
  }>;
  catalog: Record<string, ExerciseDef>;
  stats: ExerciseStat[];
  bodyweight: number | null;
  progressionByExercise: Record<string, ProgressionPerformance[]>;
}) {
  return input.slots.map((slot) => {
    const def = input.catalog[slot.exerciseId];
    const reference = selectProgressionReference(
      input.progressionByExercise[slot.exerciseId] ?? [],
      slot.id,
    );
    const target = def
      ? sessionTarget(
          def,
          slot.prescription,
          reference.selected,
          input.catalog,
          input.stats,
          input.bodyweight,
        )
      : null;
    return {
      slotId: slot.id,
      exerciseId: slot.exerciseId,
      exerciseName: def?.name ?? slot.exerciseId,
      targetSets: slot.targetSets,
      prescription: slot.prescription,
      target: target
        ? {
            weight: target.weight,
            targetReps: target.targetReps,
            targetRir: target.targetRir,
            source: target.source,
            confidence: target.confidence ?? null,
          }
        : null,
      targetEngine: "sessionTarget",
    };
  });
}

async function loadProgressionByExercise(
  supabase: Client,
  userId: string,
  exerciseIds: string[],
): Promise<Record<string, ProgressionPerformance[]>> {
  if (exerciseIds.length === 0) return {};
  const { data: priorSets, error } = await supabase
    .from("set_log")
    .select("session_id, program_slot_id, exercise_id, weight, reps, rir, e1rm, set_index, created_at, workout_session!inner(performed_at, finished_at)")
    .eq("user_id", userId)
    .eq("is_warmup", false)
    .in("exercise_id", exerciseIds)
    .not("workout_session.finished_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const firstByExposure = new Map<string, PriorSetRow>();
  for (const row of (priorSets ?? []) as PriorSetRow[]) {
    const key = `${row.session_id}:${row.program_slot_id ?? "adhoc"}:${row.exercise_id}`;
    const current = firstByExposure.get(key);
    if (!current || row.set_index < current.set_index || (
      row.set_index === current.set_index && row.created_at < current.created_at
    )) {
      firstByExposure.set(key, row);
    }
  }
  const progressionByExercise: Record<string, ProgressionPerformance[]> = {};
  for (const row of firstByExposure.values()) {
    const joined = Array.isArray(row.workout_session) ? row.workout_session[0] : row.workout_session;
    if (!joined?.finished_at) continue;
    const list = progressionByExercise[row.exercise_id] ?? [];
    list.push({
      programSlotId: row.program_slot_id,
      performedAt: joined.performed_at,
      weight: row.weight,
      reps: row.reps,
      rir: row.rir,
      e1rm: row.e1rm,
    });
    progressionByExercise[row.exercise_id] = list;
  }
  for (const list of Object.values(progressionByExercise)) {
    list.sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  }
  return progressionByExercise;
}
