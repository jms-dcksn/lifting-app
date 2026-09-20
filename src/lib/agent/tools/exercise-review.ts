import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatalogMap } from "@/lib/catalog";
import {
  groupReviewSessions,
  reviewChartPoints,
  reviewRecentWindow,
  reviewToday,
  withProgramNames,
} from "@/lib/exercise-review-sessions";
import {
  resolveReviewEquipment,
  reviewEquipmentChoices,
  reviewEquipmentLabel,
  rowsForReviewEquipment,
} from "@/lib/review-equipment";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

type SessionJoin = {
  performed_at: string;
  finished_at: string | null;
  program_id?: string | null;
};

export async function exerciseReview(
  supabase: Client,
  userId: string,
  input: { exerciseId?: string; name?: string; equipmentInstanceId?: string | null },
) {
  const catalog = await getCatalogMap(supabase, userId);
  const resolved = resolveExerciseIdentity(catalog, input);
  if (!("exerciseId" in resolved)) return resolved;
  const exerciseId = resolved.exerciseId;
  const def = catalog[exerciseId];

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
      equipmentInstanceId: row.equipment_instance_id ?? null,
    };
  });

  const now = new Date();
  const identities = reviewEquipmentChoices(history, now);
  const requested = input.equipmentInstanceId === undefined ? undefined : input.equipmentInstanceId;
  const selectedEquipment = resolveReviewEquipment(requested, history, now);
  const selectedHistory = rowsForReviewEquipment(history, selectedEquipment);
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
  let equipmentLabel: string | null = null;
  if (selectedEquipment) {
    const { data: instances, error: instanceError } = await supabase
      .from("equipment_instance")
      .select("id, label, gym")
      .eq("user_id", userId)
      .eq("id", selectedEquipment)
      .maybeSingle();
    if (instanceError) throw new Error(instanceError.message);
    equipmentLabel = reviewEquipmentLabel(instances ?? undefined, selectedEquipment);
  }

  return summarizeExerciseReview({
    exerciseId,
    exerciseName: def?.name ?? exerciseId,
    equipmentInstanceId: selectedEquipment,
    equipmentLabel,
    identities,
    sessions,
  });
}

export function summarizeExerciseReview(input: {
  exerciseId: string;
  exerciseName: string;
  equipmentInstanceId: string | null;
  equipmentLabel: string | null;
  identities: Array<string | null>;
  sessions: ReturnType<typeof withProgramNames>;
}) {
  const last = reviewToday(input.sessions);
  const recent = reviewRecentWindow(input.sessions);
  const chart = reviewChartPoints(input.sessions, "last8");
  return {
    source: "exerciseReview" as const,
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName,
    equipmentInstanceId: input.equipmentInstanceId,
    equipmentLabel: input.equipmentLabel,
    identityNote: "Exact exercise plus equipment instance. Instances are not blended.",
    last: last
      ? {
          dateKey: last.dateKey,
          programName: last.programName,
          bestE1rm: last.bestE1rm,
          sets: last.sets,
        }
      : null,
    recent21Days: recent,
    chartLast8: chart,
  };
}

export type ResolvedExerciseIdentity =
  | { exerciseId: string }
  | { source: "exerciseReview"; error: string }
  | {
      source: "exerciseReview";
      needsDisambiguation: true;
      matches: Array<{ id: string; name: string }>;
    };

export function resolveExerciseIdentity(
  catalog: Record<string, { id: string; name: string }>,
  input: { exerciseId?: string; name?: string },
): ResolvedExerciseIdentity {
  const knownId = input.exerciseId;
  if (knownId && catalog[knownId]) {
    return { exerciseId: knownId };
  }
  const needle = input.name?.trim().toLowerCase();
  if (!needle) {
    return {
      source: "exerciseReview" as const,
      error: "Need an exercise id or name.",
    };
  }
  const entries = Object.values(catalog);
  const exact = entries.find((def) => def.name.toLowerCase() === needle);
  if (exact) return { exerciseId: exact.id };
  const matches = entries.filter((def) =>
    def.name.toLowerCase().includes(needle) || needle.includes(def.name.toLowerCase()),
  );
  if (matches.length === 1) return { exerciseId: matches[0].id };
  if (matches.length === 0) {
    return {
      source: "exerciseReview" as const,
      error: `No exercise matched “${input.name}”.`,
    };
  }
  return {
    source: "exerciseReview" as const,
    needsDisambiguation: true,
    matches: matches.slice(0, 8).map((def) => ({ id: def.id, name: def.name })),
  };
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
