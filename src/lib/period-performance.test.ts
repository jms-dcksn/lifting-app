import { describe, expect, it } from "vitest";
import type { BodyweightEntry } from "./bodyweight";
import { buildPeriodPerformanceOverlay } from "./period-performance";
import type { ExerciseRecords } from "./strength/records";

const entry = (loggedOn: string, weight: number): BodyweightEntry => ({ id: loggedOn, loggedOn, weight });
const records = (reps: number, e1rm: boolean): ExerciseRecords => ({
  key: "bb-bench",
  exerciseId: "bb-bench",
  equipmentInstanceId: null,
  name: "Bench",
  isBodyweight: false,
  repRecords: Array.from({ length: reps }, (_, i) => ({
    setId: `r${i}`,
    slotId: null,
    load: 100,
    weight: 100,
    reps: 8 + i,
    improvement: 1,
  })),
  e1rmRecord: e1rm ? { setId: "e", slotId: null, value: 140, improvement: 2 } : null,
  topWeightRecord: null,
});

describe("period performance overlay", () => {
  it("joins Monday weeks with observed period days, weekly weight change, and PR counts", () => {
    const overlay = buildPeriodPerformanceOverlay({
      window: { start: "2026-09-01", end: "2026-09-13" },
      periodDates: ["2026-09-08", "2026-09-09", "2026-09-10"],
      entries: [
        entry("2026-08-31", 147),
        entry("2026-09-01", 148),
        entry("2026-09-06", 150),
        entry("2026-09-07", 150),
        entry("2026-09-13", 152),
      ],
      workouts: [
        { sessionId: "s1", date: "2026-09-09" },
        { sessionId: "s2", date: "2026-09-12" },
      ],
      achievements: [{ date: "2026-09-09", records: [records(1, true)] }],
    });

    expect(overlay.weeks.map((week) => week.start)).toEqual(["2026-08-31", "2026-09-07"]);
    expect(overlay.weeks[0]).toMatchObject({
      end: "2026-09-06",
      periodDays: 0,
      weightAverage: 148.3,
      workouts: 0,
      prs: 0,
    });
    expect(overlay.weeks[1]).toMatchObject({
      end: "2026-09-13",
      periodDays: 3,
      weightAverage: 151,
      weightDelta: 2.7,
      workouts: 2,
      prs: 2,
    });
    expect(overlay.weeks[1].days.filter((day) => day.period).map((day) => day.date)).toEqual([
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
    ]);
    expect(overlay.weeks[1].days.find((day) => day.date === "2026-09-11")?.period).toBe(false);
    expect(overlay.period).toEqual({ weeks: 1, weightDelta: 2.7, workouts: 2, prs: 2 });
    expect(overlay.other).toEqual({ weeks: 1, weightDelta: null, workouts: 0, prs: 0 });
  });

  it("does not infer unmarked days or fill gaps between observations", () => {
    const overlay = buildPeriodPerformanceOverlay({
      window: { start: "2026-09-01", end: "2026-09-13" },
      periodDates: ["2026-09-08", "2026-09-10"],
      entries: [],
      workouts: [],
      achievements: [],
    });
    expect(overlay.weeks[1].periodDays).toBe(2);
    expect(overlay.weeks[1].days.find((day) => day.date === "2026-09-09")).toMatchObject({
      period: false,
      inWindow: true,
    });
  });

  it("counts top-weight records in the weekly PR total", () => {
    const overlay = buildPeriodPerformanceOverlay({
      window: { start: "2026-09-01", end: "2026-09-07" },
      periodDates: [],
      entries: [],
      workouts: [{ sessionId: "s1", date: "2026-09-01" }],
      achievements: [{
        date: "2026-09-01",
        records: [{
          ...records(0, false),
          topWeightRecord: { setId: "t", slotId: null, load: 315, weight: 315, improvement: 10 },
        }],
      }],
    });
    expect(overlay.weeks[0].prs).toBe(1);
  });

  it("clips spilled week days to the month window and ignores outside marks", () => {
    const overlay = buildPeriodPerformanceOverlay({
      window: { start: "2026-09-01", end: "2026-09-13" },
      periodDates: ["2026-08-31", "2026-09-01", "2026-09-14"],
      entries: [],
      workouts: [
        { sessionId: "before", date: "2026-08-31" },
        { sessionId: "in", date: "2026-09-01" },
      ],
      achievements: [
        { date: "2026-08-31", records: [records(1, false)] },
        { date: "2026-09-01", records: [records(0, true)] },
      ],
    });
    const first = overlay.weeks[0];
    expect(first.days[0]).toMatchObject({ date: "2026-08-31", inWindow: false, period: false, workout: false });
    expect(first.days[1]).toMatchObject({ date: "2026-09-01", inWindow: true, period: true, workout: true });
    expect(first.periodDays).toBe(1);
    expect(first.workouts).toBe(1);
    expect(first.prs).toBe(1);
    expect(overlay.weeks.at(-1)?.days.some((day) => day.date === "2026-09-14" && day.period)).toBe(false);
  });

  it("leaves weight and strength empty when the week has no readings or records", () => {
    const overlay = buildPeriodPerformanceOverlay({
      window: { start: "2026-09-01", end: "2026-09-07" },
      periodDates: ["2026-09-03"],
      entries: [],
      workouts: [],
      achievements: [],
    });
    expect(overlay.weeks).toHaveLength(2);
    expect(overlay.weeks[1]).toMatchObject({
      start: "2026-09-07",
      end: "2026-09-07",
      periodDays: 0,
      weightAverage: null,
      weightDelta: null,
      workouts: 0,
      prs: 0,
    });
    expect(overlay.period).toEqual({ weeks: 1, weightDelta: null, workouts: 0, prs: 0 });
    expect(overlay.other).toEqual({ weeks: 1, weightDelta: null, workouts: 0, prs: 0 });
  });
});
