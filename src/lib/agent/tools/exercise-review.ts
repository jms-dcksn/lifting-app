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
  const [catalog, loggedExerciseIds] = await Promise.all([
    getCatalogMap(supabase, userId),
    loggedExerciseIdsFor(supabase, userId),
  ]);
  const resolved = resolveExerciseIdentity(catalog, { ...input, loggedExerciseIds });
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
    .select("id, user_id, weight, reps, rir, e1rm, session_id, created_at, exercise_id, equipment_instance_id, program_slot_id, is_warmup, is_deload, workout_session!inner(performed_at, finished_at, program_id)")
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
      isDeload: row.is_deload,
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
          isDeload: last.isDeload ?? false,
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

const ALIASES: Record<string, readonly string[]> = {
  rdl: ["romanian", "deadlift"],
  rdls: ["romanian", "deadlift"],
  ohp: ["overhead", "press"],
  bss: ["bulgarian", "split"],
  db: ["dumbbell"],
  bb: ["barbell"],
  pullup: ["pull", "up"],
  pullups: ["pull", "up"],
  military: ["overhead"],
};

const EQUIPMENT_TOKENS = new Set([
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "weighted",
  "bodyweight",
]);

/** Query words that are not catalog tokens. `flat` means the incline names lose. */
const MODIFIER_REJECT: Record<string, string> = {
  flat: "incline",
};

const MIN_SCORE = 0.5;
const RESOLVE_MARGIN = 0.12;
const EXTRA_NAME_TOKEN = 0.07;

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function forms(token: string): string[] {
  const out = new Set([token]);
  if (token.length > 4 && token.endsWith("es")) out.add(token.slice(0, -2));
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) out.add(token.slice(0, -1));
  return [...out];
}

function expandAliases(tokens: string[]): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    const alias = ALIASES[token] ?? forms(token).map((form) => ALIASES[form]).find(Boolean);
    if (alias) out.push(...alias);
    else out.push(token);
  }
  return out;
}

function editDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i]![0] = i;
  for (let j = 0; j < cols; j++) dp[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + 1);
      }
    }
  }
  return dp[left.length]![right.length]!;
}

function tokenMatches(query: string, catalog: string): boolean {
  const queryForms = forms(query);
  const catalogForms = forms(catalog);
  if (queryForms.some((form) => catalogForms.includes(form))) return true;
  const longer = Math.max(query.length, catalog.length);
  const shorter = Math.min(query.length, catalog.length);
  return longer >= 5 && shorter >= 4 && editDistance(query, catalog) <= 1;
}

function joinsAround(tokens: string[], index: number): string[] {
  const joins: string[] = [];
  const push = (left: string, right: string) => {
    if (left in MODIFIER_REJECT || right in MODIFIER_REJECT) return;
    for (const a of forms(left)) {
      for (const b of forms(right)) joins.push(a + b);
    }
  };
  if (index > 0) push(tokens[index - 1]!, tokens[index]!);
  if (index + 1 < tokens.length) push(tokens[index]!, tokens[index + 1]!);
  return joins;
}

type CatalogDoc = {
  id: string;
  name: string;
  nameTokens: string[];
  tokens: string[];
};

function catalogDocs(catalog: Record<string, { id: string; name: string }>): CatalogDoc[] {
  return Object.values(catalog).map((def) => {
    const nameTokens = tokenize(def.name);
    return {
      id: def.id,
      name: def.name,
      nameTokens,
      tokens: [...nameTokens, ...tokenize(def.id)],
    };
  });
}

function tokenHitsDoc(token: string, joins: string[], docTokens: string[]): boolean {
  if (docTokens.some((catalog) => tokenMatches(token, catalog))) return true;
  return joins.some((join) => docTokens.some((catalog) => tokenMatches(join, catalog)));
}

function queryJoins(content: string[]): string[] {
  return content.flatMap((_, index) => joinsAround(content, index));
}

function nameTokenCovered(nameToken: string, content: string[], joins: string[]): boolean {
  return content.some((token) => tokenMatches(token, nameToken)) || joins.some((join) => tokenMatches(join, nameToken));
}

function nameIsCovered(nameTokens: string[], content: string[]): boolean {
  const joins = queryJoins(content);
  return nameTokens.every((nameToken) => nameTokenCovered(nameToken, content, joins));
}

function idf(token: string, docs: CatalogDoc[]): number {
  let seen = 0;
  for (const doc of docs) {
    if (doc.tokens.some((catalog) => forms(token).some((form) => forms(catalog).includes(form)))) seen++;
  }
  return Math.log((docs.length + 1) / (seen + 1)) + 1;
}

type ScoredName = { id: string; name: string; score: number; nameTokens: string[] };

function knownContent(content: string[], docs: CatalogDoc[]): string[] {
  const haystack = docs.flatMap((doc) => doc.tokens);
  return content.filter((token, index) => tokenHitsDoc(token, joinsAround(content, index), haystack));
}

function scoreNames(docs: CatalogDoc[], content: string[], rejected: string | undefined): ScoredName[] {
  const scoredContent = knownContent(content, docs);
  const weights = scoredContent.map((token) => idf(token, docs) ** 2);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const scored: ScoredName[] = [];
  for (const doc of docs) {
    if (rejected && doc.nameTokens.includes(rejected)) continue;
    let matched = 0;
    scoredContent.forEach((token, index) => {
      const at = content.indexOf(token);
      if (tokenHitsDoc(token, joinsAround(content, at), doc.tokens)) matched += weights[index] ?? 0;
    });
    if (total === 0 || matched === 0) continue;
    const joins = queryJoins(content);
    const uncovered = doc.nameTokens.filter((nameToken) => !nameTokenCovered(nameToken, content, joins)).length;
    const score = matched / total - uncovered * EXTRA_NAME_TOKEN;
    if (score >= MIN_SCORE) scored.push({ id: doc.id, name: doc.name, score, nameTokens: doc.nameTokens });
  }
  return scored.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
}

function preferBarbell(queryTokens: string[], content: string[], scored: ScoredName[]): ScoredName[] {
  if (queryTokens.some((token) => EQUIPMENT_TOKENS.has(token)) || scored.length <= 1) return scored;
  const barbell = scored.filter((row) => row.nameTokens.includes("barbell"));
  if (barbell.length === 0) return scored;
  return scored.filter((row) => {
    if (row.nameTokens.includes("barbell")) return true;
    return content.some((token, index) => {
      const joins = joinsAround(content, index);
      const hit = tokenHitsDoc(token, joins, row.nameTokens);
      const covered = barbell.some((other) => tokenHitsDoc(token, joins, other.nameTokens));
      return hit && !covered;
    });
  });
}

function preferLogged(scored: ScoredName[], logged: ReadonlySet<string> | null): ScoredName[] {
  if (!logged || logged.size === 0) return scored;
  const hit = scored.filter((row) => logged.has(row.id));
  return hit.length > 0 ? hit : scored;
}

function unknownTokenBlocks(content: string[], docs: CatalogDoc[]): boolean {
  const covered = docs.some((doc) => nameIsCovered(doc.nameTokens, content));
  if (covered) return false;
  return content.some((token, index) => !tokenHitsDoc(token, joinsAround(content, index), docs.flatMap((doc) => doc.tokens)));
}

async function loggedExerciseIdsFor(supabase: Client, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_exercise_stat")
    .select("exercise_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.exercise_id);
}

export function resolveExerciseIdentity(
  catalog: Record<string, { id: string; name: string }>,
  input: { exerciseId?: string; name?: string; loggedExerciseIds?: readonly string[] },
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

  const logged = input.loggedExerciseIds ? new Set(input.loggedExerciseIds) : null;
  const entries = Object.values(catalog);
  const exact = entries.find((def) => def.name.toLowerCase() === needle.toLowerCase());
  if (exact && (!logged || logged.size === 0 || logged.has(exact.id))) {
    return { exerciseId: exact.id };
  }

  const rawTokens = tokenize(needle);
  const queryTokens = expandAliases(rawTokens);
  const content = queryTokens.filter((token) => !(token in MODIFIER_REJECT));
  if (content.length === 0) {
    return {
      source: "exerciseReview" as const,
      error: `No exercise matched “${needle}”.`,
    };
  }

  const docs = catalogDocs(catalog);
  if (unknownTokenBlocks(content, docs)) {
    return {
      source: "exerciseReview" as const,
      error: `No exercise matched “${needle}”.`,
    };
  }

  const rejected = queryTokens.map((token) => MODIFIER_REJECT[token]).find(Boolean);
  const ranked = preferLogged(
    preferBarbell(queryTokens, content, scoreNames(docs, content, rejected)),
    logged,
  );
  const top = ranked[0];
  if (!top) {
    return {
      source: "exerciseReview" as const,
      error: `No exercise matched “${needle}”.`,
    };
  }
  const close = ranked.filter((row) => top.score - row.score < RESOLVE_MARGIN);
  if (close.length === 1) return { exerciseId: close[0]!.id };
  return {
    source: "exerciseReview" as const,
    needsDisambiguation: true,
    matches: close.slice(0, 8).map(({ id, name }) => ({ id, name })),
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
