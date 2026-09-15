import { describe, expect, it } from "vitest";
import { weeklyVolume, type SessionTonnagePoint } from "./analytics";

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
