import type { AnalyticsSetRow } from "./analytics";
import { exerciseSummaries } from "./analytics";
import { PATTERN_LABEL, type ExerciseDef, type Pattern } from "./strength/coefficients";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CoachCheckInOptions {
  now?: Date;
  programName?: string;
  plannedSessions?: number;
}

// Produce a compact, paste-ready coaching payload from the data the app already records.
// Only finished sessions count toward adherence so an in-progress workout cannot inflate it.
export function buildCoachCheckIn(
  rows: AnalyticsSetRow[],
  defs: Record<string, ExerciseDef>,
  options: CoachCheckInOptions = {},
): string {
  const now = options.now ?? new Date();
  const start = new Date(now.getTime() - 7 * DAY_MS);
  const allFinished = rows.filter((row) => !row.isWarmup && row.finishedAt);
  const finished = allFinished.filter((row) => {
    const at = new Date(row.finishedAt as string).getTime();
    return at >= start.getTime() && at <= now.getTime();
  });
  const sessionIds = new Set(finished.map((row) => row.sessionId));
  const planned = options.plannedSessions ?? 0;
  const rirRows = finished.filter((row) => row.rir != null);
  const averageRir =
    rirRows.length > 0
      ? rirRows.reduce((sum, row) => sum + (row.rir ?? 0), 0) / rirRows.length
      : null;
  const rirZero = rirRows.filter((row) => row.rir === 0).length;
  const rirOne = rirRows.filter((row) => row.rir === 1).length;
  const rirTwoPlus = rirRows.filter((row) => (row.rir ?? 0) >= 2).length;

  const patterns = new Map<Pattern, { sets: number; hard: number }>();
  for (const row of finished) {
    const pattern = defs[row.exerciseId]?.pattern;
    if (!pattern) continue;
    const stat = patterns.get(pattern) ?? { sets: 0, hard: 0 };
    stat.sets += 1;
    if (row.rir != null && row.rir <= 1) stat.hard += 1;
    patterns.set(pattern, stat);
  }

  const summaryByExercise = new Map(
    exerciseSummaries(allFinished).map((summary) => [summary.exerciseId, summary]),
  );
  const latestByExercise = latestExercisePerformances(finished, defs);

  const lines = [
    "WEEKLY TRAINING CHECK-IN",
    `Window: ${dateLabel(start)}–${dateLabel(now)}`,
    `Program: ${options.programName ?? "Not specified"}`,
    `Adherence: ${sessionIds.size}${planned ? `/${planned}` : ""} sessions`,
    `Working sets: ${finished.length}`,
    `RIR: ${averageRir == null ? "not logged" : `${averageRir.toFixed(1)} average`} · ${rirZero} at 0 · ${rirOne} at 1 · ${rirTwoPlus} at 2+`,
    "",
    "PATTERN VOLUME (sets / hard sets at 0–1 RIR)",
    ...(patterns.size > 0
      ? [...patterns.entries()]
          .sort((a, b) => b[1].sets - a[1].sets)
          .map(([pattern, stat]) => `${PATTERN_LABEL[pattern]}: ${stat.sets} / ${stat.hard}`)
      : ["No finished-session sets in this window."]),
    "",
    "LATEST PERFORMANCE BY EXERCISE",
    ...(latestByExercise.length > 0
      ? latestByExercise.map(({ exerciseId, weight, reps, rir, e1rm }) => {
          const def = defs[exerciseId];
          const delta = summaryByExercise.get(exerciseId)?.delta;
          const trend = delta == null ? "first/one session" : `${signed(delta)} lb e1RM vs prior`;
          return `${def?.name ?? exerciseId}: ${weight} lb × ${reps} @ ${rir ?? "?"} RIR · e1RM ${e1rm == null ? "n/a" : `${Math.round(e1rm)} lb`} · ${trend}`;
        })
      : ["No finished-session performances in this window."]),
    "",
    "COACH REVIEW",
    "Assess progression, fatigue, RIR accuracy, exercise changes, and next-week load/rep targets.",
  ];

  return lines.join("\n");
}

function latestExercisePerformances(
  rows: AnalyticsSetRow[],
  defs: Record<string, ExerciseDef>,
) {
  const latestSession = new Map<string, string>();
  for (const row of rows) {
    const prior = latestSession.get(row.exerciseId);
    if (!prior || row.performedAt > prior) latestSession.set(row.exerciseId, row.performedAt);
  }

  const best = new Map<string, AnalyticsSetRow>();
  for (const row of rows) {
    if (row.performedAt !== latestSession.get(row.exerciseId)) continue;
    const prior = best.get(row.exerciseId);
    const score = row.e1rm ?? row.weight * row.reps;
    const priorScore = prior?.e1rm ?? (prior ? prior.weight * prior.reps : -Infinity);
    if (!prior || score > priorScore) best.set(row.exerciseId, row);
  }

  return [...best.values()]
    .sort((a, b) =>
      (defs[a.exerciseId]?.name ?? a.exerciseId).localeCompare(
        defs[b.exerciseId]?.name ?? b.exerciseId,
      ),
    )
    .map((row) => ({
      exerciseId: row.exerciseId,
      weight: row.weight,
      reps: row.reps,
      rir: row.rir,
      e1rm: row.e1rm,
    }));
}

function signed(value: number) {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function dateLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
