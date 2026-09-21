import type { BodyweightEntry } from "./bodyweight";
import { bodyweightTrend } from "./bodyweight";
import { recordCounts, recordTotal, type ExerciseRecords } from "./strength/records";
import { shiftWeightDay } from "./weight-trends";

export type PeriodPerformanceDay = {
  date: string;
  inWindow: boolean;
  period: boolean;
  workout: boolean;
};

export type PeriodPerformanceWeek = {
  start: string;
  end: string;
  days: PeriodPerformanceDay[];
  periodDays: number;
  weightAverage: number | null;
  weightDelta: number | null;
  workouts: number;
  prs: number;
};

export type PeriodPerformanceGroup = {
  weeks: number;
  weightDelta: number | null;
  workouts: number;
  prs: number;
};

export type PeriodPerformanceOverlay = {
  weeks: PeriodPerformanceWeek[];
  period: PeriodPerformanceGroup;
  other: PeriodPerformanceGroup;
};

const rounded = (n: number) => Math.round(n * 10) / 10;

function mondayOnOrBefore(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return shiftWeightDay(day, -((weekday + 6) % 7));
}

function weekAverage(entries: BodyweightEntry[], start: string, end: string) {
  return bodyweightTrend(entries.filter((entry) => entry.loggedOn >= start && entry.loggedOn <= end), end).current.average;
}

function groupOf(weeks: PeriodPerformanceWeek[]): PeriodPerformanceGroup {
  const deltas = weeks.flatMap((week) => (week.weightDelta == null ? [] : [week.weightDelta]));
  return {
    weeks: weeks.length,
    weightDelta: deltas.length ? rounded(deltas.reduce((sum, value) => sum + value, 0) / deltas.length) : null,
    workouts: weeks.reduce((sum, week) => sum + week.workouts, 0),
    prs: weeks.reduce((sum, week) => sum + week.prs, 0),
  };
}

/** Monday–Sunday weeks that overlap a month window. Period marks are observed days only. */
export function buildPeriodPerformanceOverlay(input: {
  window: { start: string; end: string };
  periodDates: string[];
  entries: BodyweightEntry[];
  workouts: { sessionId: string; date: string }[];
  achievements: { date: string; records: ExerciseRecords[] }[];
}): PeriodPerformanceOverlay {
  const periodDates = new Set(input.periodDates.filter((date) => date >= input.window.start && date <= input.window.end));
  const workoutDates = new Map<string, number>();
  for (const workout of input.workouts) {
    if (workout.date < input.window.start || workout.date > input.window.end) continue;
    workoutDates.set(workout.date, (workoutDates.get(workout.date) ?? 0) + 1);
  }
  const prsByDate = new Map<string, number>();
  for (const achievement of input.achievements) {
    if (achievement.date < input.window.start || achievement.date > input.window.end) continue;
    const counts = recordCounts(achievement.records);
    prsByDate.set(achievement.date, (prsByDate.get(achievement.date) ?? 0) + recordTotal(counts));
  }

  const weeks: PeriodPerformanceWeek[] = [];
  for (let monday = mondayOnOrBefore(input.window.start); monday <= input.window.end; monday = shiftWeightDay(monday, 7)) {
    const sunday = shiftWeightDay(monday, 6);
    const end = sunday > input.window.end ? input.window.end : sunday;
    const priorMonday = shiftWeightDay(monday, -7);
    const priorEnd = shiftWeightDay(priorMonday, 6);
    const weightAverage = weekAverage(input.entries, monday, end);
    const previousAverage = weekAverage(input.entries, priorMonday, priorEnd);
    const days = Array.from({ length: 7 }, (_, offset) => {
      const date = shiftWeightDay(monday, offset);
      const inWindow = date >= input.window.start && date <= input.window.end;
      return {
        date,
        inWindow,
        period: inWindow && periodDates.has(date),
        workout: inWindow && (workoutDates.get(date) ?? 0) > 0,
      };
    });
    weeks.push({
      start: monday,
      end,
      days,
      periodDays: days.filter((day) => day.period).length,
      weightAverage: weightAverage == null ? null : rounded(weightAverage),
      weightDelta: weightAverage == null || previousAverage == null ? null : rounded(weightAverage - previousAverage),
      workouts: days.reduce((sum, day) => sum + (workoutDates.get(day.date) ?? 0), 0),
      prs: days.reduce((sum, day) => sum + (prsByDate.get(day.date) ?? 0), 0),
    });
  }

  return {
    weeks,
    period: groupOf(weeks.filter((week) => week.periodDays > 0)),
    other: groupOf(weeks.filter((week) => week.periodDays === 0)),
  };
}
