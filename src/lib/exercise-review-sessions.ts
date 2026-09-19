import { dateKey, parseDateKey } from "./bodyweight";
import { inLocalDays } from "./app-chrome";

export const REVIEW_RECENT_DAYS = 21;
export const REVIEW_CHART_SESSIONS = 8;

export type ReviewSetRow = {
  id: string;
  sessionId: string;
  weight: number;
  reps: number;
  rir: number | null;
  e1rm: number | null;
  performedAt: string;
  finishedAt: string | null;
  programId?: string | null;
};

export type ReviewSessionSet = {
  id: string;
  weight: number;
  reps: number;
  rir: number | null;
};

export type ReviewSession = {
  sessionId: string;
  performedAt: string;
  dateKey: string;
  bestE1rm: number | null;
  programId: string | null;
  programName: string | null;
  sets: ReviewSessionSet[];
};

export type ReviewChartRange = "last8" | "all";

export type ReviewChartPoint = {
  date: string;
  dateKey: string;
  e1rm: number;
};

export type ReviewRecentWindow =
  | { kind: "gap"; lastTrained: string }
  | {
      kind: "sessions";
      sessions: ReviewSession[];
      bestE1rm: number | null;
      delta: number | null;
    };

export function groupReviewSessions(
  rows: ReviewSetRow[],
  now = new Date(),
  timeZone = "America/Chicago",
): ReviewSession[] {
  const cutoff = now.getTime();
  const bySession = new Map<string, ReviewSession>();
  for (const row of rows) {
    if (!isFinishedReviewSet(row, cutoff)) continue;
    let session = bySession.get(row.sessionId);
    if (!session) {
      session = {
        sessionId: row.sessionId,
        performedAt: row.performedAt,
        dateKey: dateKey(new Date(row.performedAt), timeZone),
        bestE1rm: null,
        programId: row.programId ?? null,
        programName: null,
        sets: [],
      };
      bySession.set(row.sessionId, session);
    }
    session.sets.push({ id: row.id, weight: row.weight, reps: row.reps, rir: row.rir });
    if (row.e1rm != null && (session.bestE1rm == null || row.e1rm > session.bestE1rm)) {
      session.bestE1rm = row.e1rm;
    }
  }
  return [...bySession.values()].sort(
    (a, b) => a.performedAt.localeCompare(b.performedAt) || a.sessionId.localeCompare(b.sessionId),
  );
}

export function withProgramNames(
  sessions: ReviewSession[],
  names: Map<string, string>,
): ReviewSession[] {
  return sessions.map((session) => ({
    ...session,
    programName: session.programId ? names.get(session.programId)?.trim() || null : null,
  }));
}

export function reviewToday(sessions: ReviewSession[]) {
  return sessions.at(-1) ?? null;
}

export function reviewRecentWindow(
  sessions: ReviewSession[],
  now = new Date(),
  timeZone = "America/Chicago",
): ReviewRecentWindow | null {
  if (sessions.length === 0) return null;
  const today = dateKey(now, timeZone);
  const recent = sessions.filter((session) =>
    inLocalDays(session.performedAt, today, REVIEW_RECENT_DAYS, timeZone),
  );
  if (recent.length === 0) {
    return { kind: "gap", lastTrained: sessions.at(-1)!.dateKey };
  }
  const points = recent.filter((session) => session.bestE1rm != null);
  const first = points[0]?.bestE1rm ?? null;
  const last = points.at(-1)?.bestE1rm ?? null;
  return {
    kind: "sessions",
    sessions: recent,
    bestE1rm: points.length === 0 ? null : Math.max(...points.map((session) => session.bestE1rm!)),
    delta: first != null && last != null && points.length >= 2 ? last - first : null,
  };
}

export function reviewChartPoints(
  sessions: ReviewSession[],
  range: ReviewChartRange,
): ReviewChartPoint[] {
  const window = range === "last8" ? sessions.slice(-REVIEW_CHART_SESSIONS) : sessions;
  return window.flatMap((session) =>
    session.bestE1rm == null
      ? []
      : [{ date: reviewChartLabel(session.dateKey), dateKey: session.dateKey, e1rm: session.bestE1rm }],
  );
}

export function periodDatesInChartRange(points: ReviewChartPoint[], periodDates: string[]) {
  if (points.length === 0) return [];
  const start = points[0].dateKey;
  const end = points.at(-1)!.dateKey;
  return periodDates.filter((day) => day >= start && day <= end);
}

export function formatReviewE1rm(value: number) {
  return `${value.toFixed(1)} lb`;
}

export function formatReviewDelta(delta: number) {
  const rounded = Number(delta.toFixed(1));
  if (rounded > 0) return `+${rounded.toFixed(1)}`;
  return rounded.toFixed(1);
}

export function reviewDateLabel(day: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(parseDateKey(day)));
}

function reviewChartLabel(day: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(parseDateKey(day)));
}

function isFinishedReviewSet(row: ReviewSetRow, cutoff: number) {
  if (row.finishedAt == null) return false;
  const performed = Date.parse(row.performedAt);
  const finished = Date.parse(row.finishedAt);
  return Number.isFinite(performed) && Number.isFinite(finished)
    && performed <= cutoff
    && finished <= cutoff;
}
