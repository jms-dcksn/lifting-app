import { identityVolume, type AnalyticsSetRow } from "./analytics";
import { dateKey } from "./bodyweight";
import { buildMonthlyReport, monthlyWindows, type MonthlySession } from "./monthly-progress";
import { recordCounts, type RecordSet } from "./strength/records";
import type { ExerciseDef } from "./strength/coefficients";
import {
  reviewEmptyMonthSide,
  reviewMonthLabel,
  type ReviewMonthSide,
} from "./exercise-review-months";

export type ReviewMonthSource = {
  userId: string;
  exerciseId: string;
  equipmentInstanceId: string | null;
  catalog: Record<string, ExerciseDef>;
  sessions: MonthlySession[];
  sets: RecordSet[];
  bodyweight: number | null;
};

export function reviewMonthSide(
  month: string,
  source: ReviewMonthSource,
  now = new Date(),
  timeZone = "America/Chicago",
): ReviewMonthSide {
  const { current } = monthlyWindows(month, now, timeZone);
  const identitySets = source.sets.filter(
    (set) => set.exercise_id === source.exerciseId
      && set.equipment_instance_id === source.equipmentInstanceId,
  );
  const report = buildMonthlyReport({
    userId: source.userId,
    month,
    sessions: source.sessions,
    sets: identitySets,
    catalog: source.catalog,
    now,
    timeZone,
  });
  const lifts = report.lifts.filter((lift) =>
    lift.exerciseId === source.exerciseId
    && lift.equipmentInstanceId === source.equipmentInstanceId,
  );
  const groups = report.achievements.flatMap((achievement) =>
    achievement.records.filter((record) =>
      record.exerciseId === source.exerciseId
      && record.equipmentInstanceId === source.equipmentInstanceId,
    ),
  );
  const counts = recordCounts(groups);
  const sessionIds = new Set(
    identitySets
      .filter((set) => {
        const day = dateKey(new Date(set.workout_session.performed_at), timeZone);
        return day >= current.start && day <= current.end;
      })
      .map((set) => set.session_id),
  );
  if (sessionIds.size === 0) return reviewEmptyMonthSide(month);

  const bests = lifts.map((lift) => lift.currentBest).filter((value): value is number => value != null);
  return {
    month,
    label: reviewMonthLabel(month),
    trained: true,
    repPrs: counts.reps,
    e1rmPrs: counts.e1rm,
    topWeightPrs: counts.topWeight,
    bestE1rm: bests.length === 0 ? null : Math.max(...bests),
    volume: identityVolume(volumeRows(identitySets), current, source.catalog, source.bodyweight, timeZone),
    exposures: sessionIds.size,
  };
}

export function reviewMonthSides(
  source: ReviewMonthSource,
  months: string[],
  now = new Date(),
  timeZone = "America/Chicago",
): Record<string, ReviewMonthSide> {
  const sides: Record<string, ReviewMonthSide> = {};
  for (const month of [...new Set(months)]) {
    try {
      monthlyWindows(month, now, timeZone);
    } catch {
      continue;
    }
    sides[month] = reviewMonthSide(month, source, now, timeZone);
  }
  return sides;
}

function volumeRows(sets: RecordSet[]): AnalyticsSetRow[] {
  return sets.flatMap((set) => {
    if (set.weight == null || set.reps == null) return [];
    return [{
      id: set.id,
      sessionId: set.session_id,
      exerciseId: set.exercise_id,
      weight: set.weight,
      reps: set.reps,
      rir: set.rir,
      e1rm: set.e1rm,
      createdAt: set.created_at,
      performedAt: set.workout_session.performed_at,
      finishedAt: set.workout_session.finished_at,
      isWarmup: set.is_warmup,
    }];
  });
}
