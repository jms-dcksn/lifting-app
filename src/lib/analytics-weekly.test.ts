import { describe, expect, it } from "vitest";
import {
  rowsForExercise,
  sessionTonnage,
  weeklyVolume,
  type AnalyticsSetRow,
  type SessionTonnagePoint,
} from "./analytics";
import { EXERCISE_BY_ID } from "./strength/coefficients";

describe("weeklyVolume", () => {
  it("aggregates sessions into weeks starting Monday UTC", () => {
    const sessions: SessionTonnagePoint[] = [
      {
        sessionId: "s1",
        performedAt: "2024-01-08T10:00:00Z", // Monday Jan 8
        programId: "p1",
        tonnage: 1000,
        setCount: 10,
        excludedSetCount: 0,
      },
      {
        sessionId: "s2",
        performedAt: "2024-01-10T10:00:00Z", // Wednesday Jan 10 (same week)
        programId: "p1",
        tonnage: 1500,
        setCount: 12,
        excludedSetCount: 0,
      },
      {
        sessionId: "s3",
        performedAt: "2024-01-15T10:00:00Z", // Monday Jan 15 (new week)
        programId: "p1",
        tonnage: 2000,
        setCount: 15,
        excludedSetCount: 0,
      },
    ];

    const result = weeklyVolume(sessions);

    expect(result).toEqual([
      {
        weekStart: "2024-01-08",
        weekEnd: "2024-01-14",
        tonnage: 2500,
      },
      {
        weekStart: "2024-01-15",
        weekEnd: "2024-01-21",
        tonnage: 2000,
      },
    ]);
  });

  it("handles sessions spanning Sunday-Monday boundary", () => {
    const sessions: SessionTonnagePoint[] = [
      {
        sessionId: "s1",
        performedAt: "2024-01-07T10:00:00Z", // Sunday Jan 7
        programId: null,
        tonnage: 1000,
        setCount: 10,
        excludedSetCount: 0,
      },
      {
        sessionId: "s2",
        performedAt: "2024-01-08T10:00:00Z", // Monday Jan 8 (new week)
        programId: null,
        tonnage: 1500,
        setCount: 12,
        excludedSetCount: 0,
      },
    ];

    const result = weeklyVolume(sessions);

    expect(result).toEqual([
      {
        weekStart: "2024-01-01",
        weekEnd: "2024-01-07",
        tonnage: 1000,
      },
      {
        weekStart: "2024-01-08",
        weekEnd: "2024-01-14",
        tonnage: 1500,
      },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(weeklyVolume([])).toEqual([]);
  });

  it("after rowsForExercise, weekly totals match only that exercise", () => {
    const rows: AnalyticsSetRow[] = [
      {
        id: "bench-a",
        sessionId: "s1",
        exerciseId: "bb-bench",
        equipmentInstanceId: null,
        weight: 100,
        reps: 8,
        rir: 1,
        e1rm: 140,
        createdAt: "2024-01-08T10:05:00Z",
        performedAt: "2024-01-08T10:00:00Z",
        finishedAt: "2024-01-08T11:00:00Z",
        isWarmup: false,
      },
      {
        id: "squat-a",
        sessionId: "s1",
        exerciseId: "bb-back-squat",
        equipmentInstanceId: null,
        weight: 200,
        reps: 5,
        rir: 1,
        e1rm: 230,
        createdAt: "2024-01-08T10:10:00Z",
        performedAt: "2024-01-08T10:00:00Z",
        finishedAt: "2024-01-08T11:00:00Z",
        isWarmup: false,
      },
      {
        id: "bench-b",
        sessionId: "s2",
        exerciseId: "bb-bench",
        equipmentInstanceId: "other-bar",
        weight: 110,
        reps: 6,
        rir: 1,
        e1rm: 145,
        createdAt: "2024-01-10T10:05:00Z",
        performedAt: "2024-01-10T10:00:00Z",
        finishedAt: "2024-01-10T11:00:00Z",
        isWarmup: false,
      },
      {
        id: "bench-c",
        sessionId: "s3",
        exerciseId: "bb-bench",
        equipmentInstanceId: null,
        weight: 120,
        reps: 5,
        rir: 1,
        e1rm: 150,
        createdAt: "2024-01-15T10:05:00Z",
        performedAt: "2024-01-15T10:00:00Z",
        finishedAt: "2024-01-15T11:00:00Z",
        isWarmup: false,
      },
    ];
    const defs = {
      "bb-bench": EXERCISE_BY_ID["bb-bench"],
      "bb-back-squat": EXERCISE_BY_ID["bb-back-squat"],
    };

    expect(
      weeklyVolume(sessionTonnage(rowsForExercise(rows, "bb-bench"), defs, null)),
    ).toEqual([
      { weekStart: "2024-01-08", weekEnd: "2024-01-14", tonnage: 1460 },
      { weekStart: "2024-01-15", weekEnd: "2024-01-21", tonnage: 600 },
    ]);
  });

  it("handles single session", () => {
    const sessions: SessionTonnagePoint[] = [
      {
        sessionId: "s1",
        performedAt: "2024-01-10T10:00:00Z",
        programId: "p1",
        tonnage: 1234,
        setCount: 10,
        excludedSetCount: 2,
      },
    ];

    const result = weeklyVolume(sessions);

    expect(result).toEqual([
      {
        weekStart: "2024-01-08",
        weekEnd: "2024-01-14",
        tonnage: 1234,
      },
    ]);
  });
});
