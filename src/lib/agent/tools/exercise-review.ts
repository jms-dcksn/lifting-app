import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatalogMap } from "@/lib/catalog";
import {
  movementId,
  movementMemberIds,
  movementTemplate,
  rollsUp,
} from "@/lib/strength/movement";
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
  const requestedId = resolved.exerciseId;
  const requestedDef = catalog[requestedId];
  const template = requestedDef ? movementTemplate(requestedDef, catalog) : undefined;
  const rolling = template ? rollsUp(template) : false;
  const exerciseId = requestedDef && rolling ? movementId(requestedDef) : requestedId;
  const def = catalog[exerciseId] ?? requestedDef;
  const memberIds = movementMemberIds(exerciseId, catalog);

  const { data: rows, error } = await supabase
    .from("set_log")
    .select("id, user_id, weight, reps, rir, e1rm, session_id, created_at, exercise_id, equipment_instance_id, program_slot_id, is_warmup, workout_session!inner(performed_at, finished_at, program_id)")
    .eq("user_id", userId)
    .in("exercise_id", memberIds)
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
  const identities = rolling ? [] : reviewEquipmentChoices(history, now);
  const requested = input.equipmentInstanceId === undefined ? undefined : input.equipmentInstanceId;
  const selectedEquipment = rolling
    ? null
    : resolveReviewEquipment(requested, history, now);
  const selectedHistory = rolling ? history : rowsForReviewEquipment(history, selectedEquipment);
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
    rolling,
  });
}

export function summarizeExerciseReview(input: {
  exerciseId: string;
  exerciseName: string;
  equipmentInstanceId: string | null;
  equipmentLabel: string | null;
  identities: Array<string | null>;
  sessions: ReturnType<typeof withProgramNames>;
  rolling?: boolean;
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
    identityNote: input.rolling
      ? "Movement scope across every station in this family. Machines and cables stay exact."
      : "Exact exercise plus equipment instance. Instances are not blended.",
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

function tokenizeExerciseName(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function catalogTokensByExercise(
  catalog: Record<string, { id: string; name: string }>,
): Map<string, string[]> {
  const tokensById = new Map<string, string[]>();
  for (const def of Object.values(catalog)) {
    tokensById.set(def.id, tokenizeExerciseName(def.name));
  }
  return tokensById;
}

function tokensAreSubset(subset: string[], superset: Set<string>): boolean {
  return subset.every((token) => superset.has(token));
}

type NameMatchCandidate = {
  def: { id: string; name: string };
  defTokens: string[];
  catalogSubsetOfQuery: boolean;
  querySubsetOfCatalog: boolean;
};

const EQUIPMENT_TOKENS = new Set([
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "weighted",
  "bodyweight",
]);

function rankNameMatchCandidates(candidates: NameMatchCandidate[]): NameMatchCandidate[] {
  return [...candidates].sort((left, right) => {
    if (left.catalogSubsetOfQuery !== right.catalogSubsetOfQuery) {
      return left.catalogSubsetOfQuery ? -1 : 1;
    }
    if (left.defTokens.length !== right.defTokens.length) {
      return right.defTokens.length - left.defTokens.length;
    }
    return left.def.name.localeCompare(right.def.name);
  });
}

function narrowByDefaultEquipment(
  queryTokens: string[],
  ranked: NameMatchCandidate[],
): NameMatchCandidate[] {
  const querySpecifiesEquipment = queryTokens.some((token) => EQUIPMENT_TOKENS.has(token));
  if (querySpecifiesEquipment || ranked.length <= 1) return ranked;

  const barbellMatches = ranked.filter((candidate) => candidate.defTokens.includes("barbell"));
  return barbellMatches.length > 0 ? barbellMatches : ranked;
}

export function resolveExerciseIdentity(
  catalog: Record<string, { id: string; name: string }>,
  input: { exerciseId?: string; name?: string },
): ResolvedExerciseIdentity {
  const knownId = input.exerciseId?.trim();
  if (knownId && catalog[knownId]) {
    return { exerciseId: knownId };
  }

  const needle = input.name?.trim();
  if (!needle) {
    if (knownId) {
      return {
        source: "exerciseReview" as const,
        error: `Unknown exercise id “${knownId}”. Pass a catalog name instead of inventing an id.`,
      };
    }
    return {
      source: "exerciseReview" as const,
      error: "Need an exercise id or name.",
    };
  }

  const entries = Object.values(catalog);
  const exact = entries.find((def) => def.name.toLowerCase() === needle.toLowerCase());
  if (exact) return { exerciseId: exact.id };

  const queryTokens = tokenizeExerciseName(needle);
  if (queryTokens.length === 0) {
    return {
      source: "exerciseReview" as const,
      error: `No exercise matched “${input.name}”.`,
    };
  }

  const tokensById = catalogTokensByExercise(catalog);
  const queryTokenSet = new Set(queryTokens);

  let candidates: NameMatchCandidate[] = [];
  for (const def of entries) {
    const defTokens = tokensById.get(def.id) ?? [];
    const defTokenSet = new Set(defTokens);
    const catalogSubsetOfQuery = tokensAreSubset(defTokens, queryTokenSet);
    const querySubsetOfCatalog = tokensAreSubset(queryTokens, defTokenSet);
    if (!catalogSubsetOfQuery && !querySubsetOfCatalog) continue;

    candidates.push({
      def,
      defTokens,
      catalogSubsetOfQuery,
      querySubsetOfCatalog,
    });
  }

  for (const token of queryTokens) {
    const withToken = candidates.filter((candidate) => candidate.defTokens.includes(token));
    const withoutToken = candidates.filter((candidate) => !candidate.defTokens.includes(token));
    if (withToken.length > 0 && withoutToken.length > 0) {
      candidates = withToken;
    }
  }

  const ranked = narrowByDefaultEquipment(queryTokens, rankNameMatchCandidates(candidates));
  if (ranked.length === 1) return { exerciseId: ranked[0].def.id };
  if (ranked.length === 0) {
    return {
      source: "exerciseReview" as const,
      error: `No exercise matched “${input.name}”.`,
    };
  }
  return {
    source: "exerciseReview" as const,
    needsDisambiguation: true,
    matches: ranked.slice(0, 8).map(({ def }) => ({ id: def.id, name: def.name })),
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
