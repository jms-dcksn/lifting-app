import type { ExerciseDef } from "./strength/coefficients";
import { effectiveLoad } from "./strength/recompute";

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
