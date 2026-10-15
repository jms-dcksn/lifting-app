import type { SupabaseClient } from "@supabase/supabase-js";
import { getCatalogMap } from "@/lib/catalog";
import { movementId, movementMemberIds, movementTemplate, rollsUp } from "@/lib/strength/movement";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import { groupReviewSessions, reviewChartPoints, reviewRecentWindow, reviewToday, withProgramNames } from "@/lib/exercise-review-sessions";
import { reviewEquipmentChoices, reviewEquipmentLabel } from "@/lib/review-equipment";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;
type MatchDefinition = Pick<ExerciseDef, "id" | "name"> & Partial<ExerciseDef>;
type SessionJoin = { performed_at: string; finished_at: string | null; program_id?: string | null };
export type ReviewInput = {
  exerciseId?: string;
  name?: string;
  equipmentInstanceId?: string | null;
  all?: boolean;
  offset?: number;
  matchOffset?: number;
  matchKeys?: string[];
};
const PAGE_SIZE = 500;
export const REVIEW_BATCH_SIZE = 3;
export const REVIEW_MATCH_PAGE_SIZE = 30;

type HistoryRow = Parameters<typeof groupReviewSessions>[0][number] & {
  exerciseId: string;
  equipmentInstanceId: string | null;
};

export async function exerciseReview(supabase: Client, userId: string, input: ReviewInput) {
  const catalog = await getCatalogMap(supabase, userId);
  const resolved = resolveExerciseIdentity(catalog, input);
  if ("error" in resolved) return { ...resolved, selectionStatus: "no_match" as const, matches: [] };
  const ids = "exerciseId" in resolved ? [resolved.exerciseId] : resolved.matches.map((match) => match.id);
  const memberIds = [...new Set(ids.flatMap((id) => movementMemberIds(id, catalog)))];
  const history: HistoryRow[] = [];
  // Chunk ids to bound URL length; paginate to cover the server's row limit.
  for (let chunk = 0; chunk < memberIds.length; chunk += 100) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase.from("set_log")
        .select("id, user_id, weight, reps, rir, e1rm, session_id, created_at, exercise_id, equipment_instance_id, is_warmup, is_deload, workout_session!inner(performed_at, finished_at, program_id)")
        .eq("user_id", userId).in("exercise_id", memberIds.slice(chunk, chunk + 100))
        .eq("is_warmup", false).not("workout_session.finished_at", "is", null)
        .order("id", { ascending: true }).range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        if (row.user_id !== userId || row.is_warmup) continue;
        const workout = sessionJoin(row.workout_session);
        history.push({ id: row.id, sessionId: row.session_id, exerciseId: row.exercise_id,
          weight: row.weight, reps: row.reps, rir: row.rir, e1rm: row.e1rm, isDeload: row.is_deload,
          performedAt: workout.performed_at, finishedAt: workout.finished_at,
          programId: workout.program_id ?? null, equipmentInstanceId: row.equipment_instance_id ?? null });
      }
      if ((data?.length ?? 0) < PAGE_SIZE) break;
    }
  }
  const now = new Date();
  const discovered = reviewCandidates(catalog, ids, history, input, now);
  const candidates = input.all && input.matchKeys
    ? discovered.filter((candidate) => input.matchKeys!.includes(candidate.key)) : discovered;
  if (input.all && input.matchKeys?.some((key) => !candidates.some((candidate) => candidate.key === key))) {
    return { source: "exerciseReview" as const, selectionStatus: "no_match" as const, matches: [],
      error: "A prior choice is no longer available for this user/request. Search again before summarizing all." };
  }
  const instanceIds = [...new Set(candidates.flatMap((candidate) => candidate.equipmentInstanceId ? [candidate.equipmentInstanceId] : []))];
  const labels = new Map<string, string>();
  for (let start = 0; start < instanceIds.length; start += 100) {
    const { data, error } = await supabase.from("equipment_instance").select("id, label, gym")
      .eq("user_id", userId).in("id", instanceIds.slice(start, start + 100));
    if (error) throw new Error(error.message);
    for (const instance of data ?? []) labels.set(instance.id, reviewEquipmentLabel(instance, instance.id)!);
  }
  const matches = candidates.map(({ sessions, ...candidate }) => {
    const equipmentLabel = candidate.equipmentInstanceId ? labels.get(candidate.equipmentInstanceId) ?? candidate.equipmentInstanceId : null;
    return { ...candidate, name: equipmentLabel ? `${candidate.name} — ${equipmentLabel}` : candidate.name,
      equipmentLabel, history: historyAvailability(sessions) };
  });
  const logged = matches.filter((match) => match.history.loggedSetCount > 0);
  const selected = matches.length === 1 ? matches[0] : logged.length === 1 ? logged[0] : undefined;
  const selectionStatus = input.all ? "all" : matches.length === 1
    ? input.exerciseId ? "explicit" : "unique"
    : selected ? "preferred_history" : "clarification_needed";
  const matchOffset = Math.max(0, Math.floor(input.matchOffset ?? 0));
  const visibleMatches = matches.slice(matchOffset, matchOffset + REVIEW_MATCH_PAGE_SIZE);
  const nextMatchOffset = matchOffset + visibleMatches.length < matches.length ? matchOffset + visibleMatches.length : null;
  const base = { source: "exerciseReview" as const, requested: input, asOf: now.toISOString(),
    matches: visibleMatches, totalMatches: matches.length, matchOffset, nextMatchOffset,
    matchesComplete: matches.length <= REVIEW_MATCH_PAGE_SIZE,
    selectionStatus: !input.all && matches.length > REVIEW_MATCH_PAGE_SIZE ? "more_matches" : selectionStatus,
    needsDisambiguation: !input.all && !selected,
    recommendation: selected ? { id: selected.id, equipmentInstanceId: selected.equipmentInstanceId,
      reason: matches.length === 1 ? "only_relevant_match" : "only_match_with_logged_sets" } : null };
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const chosen = input.all ? candidates.slice(offset, offset + REVIEW_BATCH_SIZE)
    : selected && matches.length <= REVIEW_MATCH_PAGE_SIZE ? candidates.filter((candidate) => candidate.key === selected.key) : [];
  const programIds = [...new Set(chosen.flatMap((candidate) => candidate.sessions.flatMap((session) => session.programId ? [session.programId] : [])))];
  const programNames = new Map<string, string>();
  for (let start = 0; start < programIds.length; start += 100) {
    const { data, error } = await supabase.from("program").select("id, name")
      .eq("user_id", userId).in("id", programIds.slice(start, start + 100));
    if (error) throw new Error(error.message);
    for (const program of data ?? []) if (program.name?.trim()) programNames.set(program.id, program.name.trim());
  }
  const reviews = chosen.map((candidate) => summarizeExerciseReview({ exerciseId: candidate.id,
    exerciseName: catalog[candidate.id]?.name ?? candidate.name,
    equipmentInstanceId: candidate.equipmentInstanceId,
    equipmentLabel: candidate.equipmentInstanceId ? labels.get(candidate.equipmentInstanceId) ?? candidate.equipmentInstanceId : null,
    sessions: withProgramNames(candidate.sessions, programNames), rolling: candidate.scope === "movement", now }));
  if (input.all) return { ...base, reviews, nextOffset: offset + chosen.length < candidates.length ? offset + chosen.length : null,
    totalMatches: candidates.length };
  return reviews[0] ? { ...base, ...reviews[0] } : base;
}

function reviewCandidates(catalog: Record<string, ExerciseDef>, ids: string[], history: HistoryRow[], input: ReviewInput, now: Date) {
  const candidates = new Map<string, { key: string; id: string; name: string; scope: "movement" | "station";
    equipmentInstanceId: string | null; sessions: ReturnType<typeof groupReviewSessions> }>();
  for (const requestedId of ids) {
    const requested = catalog[requestedId]!;
    const rolling = rollsUp(movementTemplate(requested, catalog));
    const id = rolling ? movementId(requested) : requestedId;
    const members = new Set(movementMemberIds(id, catalog));
    const rows = history.filter((row) => members.has(row.exerciseId));
    const equipment = rolling ? [null] : input.equipmentInstanceId !== undefined
      ? [input.equipmentInstanceId] : reviewEquipmentChoices(rows, now);
    if (equipment.length === 0) equipment.push(null);
    for (const equipmentInstanceId of equipment) {
      const key = rolling ? `movement:${id}` : `station:${id}:${equipmentInstanceId ?? ""}`;
      if (candidates.has(key)) continue;
      candidates.set(key, { key, id, name: catalog[id]?.name ?? requested.name,
        scope: rolling ? "movement" : "station", equipmentInstanceId,
        sessions: groupReviewSessions(rolling ? rows : rows.filter((row) => row.equipmentInstanceId === equipmentInstanceId), now) });
    }
  }
  return [...candidates.values()];
}

export function historyAvailability(sessions: ReturnType<typeof groupReviewSessions>) {
  const points = reviewChartPoints(sessions, "all");
  return { loggedSetCount: sessions.reduce((sum, session) => sum + session.sets.length, 0),
    sessionCount: sessions.length, eligiblePointCount: points.length,
    latestActivityDate: sessions.at(-1)?.dateKey ?? null, latestEligibleDate: points.at(-1)?.dateKey ?? null };
}

export function summarizeExerciseReview(input: {
  exerciseId: string; exerciseName: string; equipmentInstanceId: string | null; equipmentLabel: string | null;
  identities?: Array<string | null>; sessions: ReturnType<typeof withProgramNames>; rolling?: boolean; now?: Date;
}) {
  const last = reviewToday(input.sessions);
  const recent = reviewRecentWindow(input.sessions, input.now);
  const chart = reviewChartPoints(input.sessions, "last8");
  return { source: "exerciseReview" as const, exerciseId: input.exerciseId, exerciseName: input.exerciseName,
    equipmentInstanceId: input.equipmentInstanceId, equipmentLabel: input.equipmentLabel,
    identityNote: input.rolling ? "Movement scope across every station in this family. Machines and cables stay exact."
      : "Exact exercise plus equipment instance. Instances are not blended.",
    availability: { ...historyAvailability(input.sessions), recentComparison: recent?.kind === "sessions" && recent.delta != null,
      historicalTrend: chart.length >= 2 },
    latestEligibleE1rm: chart.at(-1) ?? null,
    deloadNote: "Deload sets are logged activity but excluded from eligible e1RM comparisons; null comparison values do not mean the stored e1RM is absent.",
    historicalDelta: chart.length >= 2 ? chart.at(-1)!.e1rm - chart[0]!.e1rm : null,
    last: last ? { dateKey: last.dateKey, programName: last.programName, bestE1rm: last.bestE1rm,
      isDeload: last.isDeload ?? false, sets: last.sets.slice(0, 12), setCount: last.sets.length } : null,
    recent21Days: recent?.kind === "sessions" ? { ...recent, sessionCount: recent.sessions.length,
      sessions: recent.sessions.slice(-8).map(({ sets, ...session }) => ({ ...session, setCount: sets.length })) } : recent,
    detailNote: "Last includes up to 12 sets; recent session details include up to 8 sessions. Counts and comparisons use all eligible ledger rows.",
    chartLast8: chart };
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

function catalogDocs(catalog: Record<string, MatchDefinition>): CatalogDoc[] {
  return Object.values(catalog).map((def) => {
    const nameTokens = tokenize(def.name);
    return {
      id: def.id,
      name: def.name,
      nameTokens,
      tokens: [...nameTokens, ...tokenize(def.id), ...tokenize(def.brand ?? ""), ...tokenize(def.machineType ?? ""), ...tokenize(def.equipment ?? "")],
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
    scored.push({ id: doc.id, name: doc.name, score, nameTokens: doc.nameTokens });
  }
  return scored.sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
}

function unknownTokenBlocks(content: string[], docs: CatalogDoc[]): boolean {
  const covered = docs.some((doc) => nameIsCovered(doc.nameTokens, content));
  if (covered) return false;
  return content.some((token, index) => !tokenHitsDoc(token, joinsAround(content, index), docs.flatMap((doc) => doc.tokens)));
}

export function resolveExerciseIdentity(
  catalog: Record<string, MatchDefinition>,
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
  const ranked = scoreNames(docs, content, rejected).filter((row) => {
    const def = catalog[row.id]!;
    const template = def.baseExerciseId ? catalog[def.baseExerciseId] ?? def : def;
    // Bench without an explicit fly qualifier means a press, including typo matches.
    if (template.pattern === "chest_fly" && queryTokens.some(token => tokenMatches(token, "bench") || token === "press")
      && !queryTokens.some(token => tokenMatches(token, "fly") || tokenMatches(token, "flye") || token === "crossover")) return false;
    if (queryTokens.includes("flat") && row.nameTokens.includes("decline")) return false;
    // Equipment can be metadata even when it is absent from the display name.
    if (queryTokens.some((token) => EQUIPMENT_TOKENS.has(token) && token !== "weighted"
      && template.equipment && template.equipment !== token)) return false;
    if (template.pattern === "calf" && !queryTokens.includes("calf")) return false;
    return content.every((token, index) => {
      if (token === "press" && queryTokens.includes("bench")) return true;
      if (EQUIPMENT_TOKENS.has(token) && template.equipment === token) return true;
      return tokenHitsDoc(token, joinsAround(content, index), docs.find((doc) => doc.id === row.id)!.tokens);
    });
  });
  const top = ranked[0];
  if (!top) {
    return {
      source: "exerciseReview" as const,
      error: `No exercise matched “${needle}”.`,
    };
  }
  if (ranked.length === 1) return { exerciseId: ranked[0]!.id };
  return {
    source: "exerciseReview" as const,
    needsDisambiguation: true,
    matches: ranked.map(({ id, name }) => ({ id, name })),
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
