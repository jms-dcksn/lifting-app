import type { ExerciseDef, Pattern } from "./strength/coefficients";
import { effectiveLoad } from "./strength/recompute";
import { estimatePatternStrength, type ExerciseStat } from "./strength/recommend";

export interface AnalyticsSetRow {
  id: string;
  sessionId: string;
  exerciseId: string;
  weight: number;
  reps: number;
  rir: number | null;
  e1rm: number | null;
  createdAt: string;
  performedAt: string;
  finishedAt?: string | null;
  programId?: string | null;
  isWarmup?: boolean;
}

export interface SessionTonnagePoint {
  sessionId: string;
  performedAt: string;
  programId: string | null;
  tonnage: number;
  setCount: number;
  excludedSetCount: number;
}

export interface E1rmPr {
  id: string;
  date: string;
  exerciseId: string;
  e1rm: number;
  delta: number | null;
}

export interface WeightPr {
  id: string;
  date: string;
  exerciseId: string;
  weight: number;
}

export interface ExerciseSummary {
  exerciseId: string;
  currentE1rm: number | null;
  bestE1rm: number | null;
  lastPerformedAt: string;
  sessionCount: number;
  delta: number | null;
  trend: "up" | "down" | "flat" | "none";
}

export interface PatternWeekStat {
  pattern: Pattern;
  weekStart: string; // YYYY-MM-DD, Monday of the week (UTC)
  sets: number; // working sets
  hardSets: number; // working sets at RIR <= threshold
  tonnage: number; // Σ effectiveLoad × reps (BW sets with unknown bodyweight excluded)
}

export interface PatternStrengthPoint {
  pattern: Pattern;
  current: number; // latest latent pattern strength (reference-lift e1RM units)
  first: number; // earliest computed strength in the window
  delta: number; // current − first
  sessions: number; // sessions that moved this pattern
}

const HARD_RIR = 2; // RIR <= this counts as a hard (stimulating) set

type ExerciseDefs = Record<string, ExerciseDef>;

export function sessionTonnage(
  rows: AnalyticsSetRow[],
  defs: ExerciseDefs,
  bodyweight: number | null,
): SessionTonnagePoint[] {
  const sessions = new Map<string, SessionTonnagePoint>();

  for (const row of chronologicalRows(rows)) {
    if (row.isWarmup) continue;

    let session = sessions.get(row.sessionId);
    if (!session) {
      session = {
        sessionId: row.sessionId,
        performedAt: row.performedAt,
        programId: row.programId ?? null,
        tonnage: 0,
        setCount: 0,
        excludedSetCount: 0,
      };
      sessions.set(row.sessionId, session);
    }

    session.setCount += 1;
    const def = defs[row.exerciseId];
    const load = def ? effectiveLoad(def, row.weight, bodyweight) : null;
    if (load == null || load <= 0) {
      session.excludedSetCount += 1;
      continue;
    }
    session.tonnage += load * row.reps;
  }

  return [...sessions.values()].sort(compareSessions);
}

export function e1rmPrFeed(rows: AnalyticsSetRow[]): E1rmPr[] {
  const bestByExercise = new Map<string, number>();
  const prs: E1rmPr[] = [];

  for (const row of chronologicalRows(rows)) {
    if (row.isWarmup || row.e1rm == null || row.e1rm <= 0) continue;

    const prior = bestByExercise.get(row.exerciseId);
    if (prior == null || row.e1rm > prior) {
      prs.push({
        id: row.id,
        date: row.performedAt,
        exerciseId: row.exerciseId,
        e1rm: row.e1rm,
        delta: prior == null ? null : row.e1rm - prior,
      });
      bestByExercise.set(row.exerciseId, row.e1rm);
    }
  }

  return prs;
}

export function weightPrs(rows: AnalyticsSetRow[]): WeightPr[] {
  const bestByExercise = new Map<string, WeightPr>();

  for (const row of chronologicalRows(rows)) {
    if (row.isWarmup) continue;

    const prior = bestByExercise.get(row.exerciseId);
    if (!prior || row.weight > prior.weight) {
      bestByExercise.set(row.exerciseId, {
        id: row.id,
        date: row.performedAt,
        exerciseId: row.exerciseId,
        weight: row.weight,
      });
    }
  }

  return [...bestByExercise.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function exerciseSummaries(rows: AnalyticsSetRow[]): ExerciseSummary[] {
  const byExercise = new Map<
    string,
    Map<string, { performedAt: string; bestE1rm: number | null }>
  >();

  for (const row of chronologicalRows(rows)) {
    if (row.isWarmup) continue;

    let sessions = byExercise.get(row.exerciseId);
    if (!sessions) {
      sessions = new Map();
      byExercise.set(row.exerciseId, sessions);
    }

    let session = sessions.get(row.sessionId);
    if (!session) {
      session = { performedAt: row.performedAt, bestE1rm: null };
      sessions.set(row.sessionId, session);
    }

    if (row.e1rm != null && (session.bestE1rm == null || row.e1rm > session.bestE1rm)) {
      session.bestE1rm = row.e1rm;
    }
  }

  return [...byExercise.entries()]
    .map(([exerciseId, sessionsById]) => {
      const sessions = [...sessionsById.values()].sort(compareSessions);
      const withE1rm = sessions.filter(
        (session): session is { performedAt: string; bestE1rm: number } =>
          session.bestE1rm != null,
      );
      const latest = withE1rm.at(-1);
      const previous = withE1rm.at(-2);
      const bestE1rm =
        withE1rm.length > 0
          ? Math.max(...withE1rm.map((session) => session.bestE1rm))
          : null;
      const delta = latest && previous ? latest.bestE1rm - previous.bestE1rm : null;

      return {
        exerciseId,
        currentE1rm: latest?.bestE1rm ?? null,
        bestE1rm,
        lastPerformedAt: sessions.at(-1)?.performedAt ?? "",
        sessionCount: sessions.length,
        delta,
        trend: trendFromDelta(delta),
      };
    })
    .sort((a, b) => b.lastPerformedAt.localeCompare(a.lastPerformedAt));
}

// Working sets and hard sets per movement pattern per week — push/pull/legs balance
// and the per-week hard-set count (the hypertrophy-stimulus metric, only possible
// because we log RIR).
export function patternWeekStats(
  rows: AnalyticsSetRow[],
  defs: ExerciseDefs,
  bodyweight: number | null,
  hardRir: number = HARD_RIR,
): PatternWeekStat[] {
  const byKey = new Map<string, PatternWeekStat>();

  for (const row of chronologicalRows(rows)) {
    if (row.isWarmup) continue;
    const def = defs[row.exerciseId];
    if (!def) continue;

    const weekStart = weekStartUtc(row.performedAt);
    const key = `${def.pattern}|${weekStart}`;
    let stat = byKey.get(key);
    if (!stat) {
      stat = { pattern: def.pattern, weekStart, sets: 0, hardSets: 0, tonnage: 0 };
      byKey.set(key, stat);
    }

    stat.sets += 1;
    if (row.rir != null && row.rir <= hardRir) stat.hardSets += 1;
    const load = effectiveLoad(def, row.weight, bodyweight);
    if (load != null && load > 0) stat.tonnage += load * row.reps;
  }

  return [...byKey.values()].sort(
    (a, b) => a.weekStart.localeCompare(b.weekStart) || b.sets - a.sets,
  );
}

// The most recent training week's per-pattern balance, ranked by set count.
export function latestWeekBalance(
  rows: AnalyticsSetRow[],
  defs: ExerciseDefs,
  bodyweight: number | null,
  hardRir: number = HARD_RIR,
): { weekStart: string; patterns: PatternWeekStat[] } | null {
  const stats = patternWeekStats(rows, defs, bodyweight, hardRir);
  if (stats.length === 0) return null;

  const weekStart = stats.reduce(
    (latest, stat) => (stat.weekStart > latest ? stat.weekStart : latest),
    stats[0].weekStart,
  );
  const patterns = stats
    .filter((stat) => stat.weekStart === weekStart)
    .sort((a, b) => b.sets - a.sets);
  return { weekStart, patterns };
}

// Latent pattern-strength trend: the recommender's pooled-across-variants strength per
// pattern, replayed session by session over running-best e1RMs. Uses population
// coefficients (machine personal-coefficient calibration is not replayed here), so it
// tracks the same signal the live recommender pools, not its exact calibrated value.
export function patternStrengthTrend(
  rows: AnalyticsSetRow[],
  defs: ExerciseDefs,
): PatternStrengthPoint[] {
  const sessions = new Map<
    string,
    { performedAt: string; bestByExercise: Map<string, number> }
  >();
  for (const row of chronologicalRows(rows)) {
    if (row.isWarmup || row.e1rm == null || row.e1rm <= 0) continue;
    let session = sessions.get(row.sessionId);
    if (!session) {
      session = { performedAt: row.performedAt, bestByExercise: new Map() };
      sessions.set(row.sessionId, session);
    }
    const prior = session.bestByExercise.get(row.exerciseId);
    if (prior == null || row.e1rm > prior) {
      session.bestByExercise.set(row.exerciseId, row.e1rm);
    }
  }

  const ordered = [...sessions.values()].sort(compareSessions);
  const runningBest = new Map<string, number>();
  const seenSessions = new Map<string, number>();
  const first = new Map<Pattern, number>();
  const current = new Map<Pattern, number>();
  const sessionCount = new Map<Pattern, number>();

  for (const session of ordered) {
    const touched = new Set<Pattern>();
    for (const [exerciseId, e1rm] of session.bestByExercise) {
      const def = defs[exerciseId];
      if (!def) continue;
      const prior = runningBest.get(exerciseId);
      if (prior == null || e1rm > prior) runningBest.set(exerciseId, e1rm);
      seenSessions.set(exerciseId, (seenSessions.get(exerciseId) ?? 0) + 1);
      touched.add(def.pattern);
    }

    const stats: ExerciseStat[] = [...runningBest.entries()].map(
      ([exerciseId, currentE1rm]) => ({
        exerciseId,
        currentE1rm,
        personalCoefficient: null,
        confidenceN: seenSessions.get(exerciseId) ?? 0,
      }),
    );

    for (const pattern of touched) {
      const strength = estimatePatternStrength(pattern, defs, stats);
      if (strength == null) continue;
      if (!first.has(pattern)) first.set(pattern, strength);
      current.set(pattern, strength);
      sessionCount.set(pattern, (sessionCount.get(pattern) ?? 0) + 1);
    }
  }

  return [...current.entries()]
    .map(([pattern, latest]) => {
      const firstStrength = first.get(pattern) ?? latest;
      return {
        pattern,
        current: latest,
        first: firstStrength,
        delta: latest - firstStrength,
        sessions: sessionCount.get(pattern) ?? 0,
      };
    })
    .sort((a, b) => b.current - a.current);
}

// Monday (UTC) of the week containing `iso`, as a YYYY-MM-DD key.
function weekStartUtc(iso: string): string {
  const d = new Date(iso);
  const offset = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offset),
  );
  return monday.toISOString().slice(0, 10);
}

function chronologicalRows(rows: AnalyticsSetRow[]) {
  return [...rows].sort((a, b) => {
    const sessionOrder = a.performedAt.localeCompare(b.performedAt);
    if (sessionOrder !== 0) return sessionOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function compareSessions(
  a: { performedAt: string },
  b: { performedAt: string },
) {
  return a.performedAt.localeCompare(b.performedAt);
}

function trendFromDelta(delta: number | null): ExerciseSummary["trend"] {
  if (delta == null) return "none";
  const rounded = Math.round(delta);
  if (rounded > 0) return "up";
  if (rounded < 0) return "down";
  return "flat";
}
