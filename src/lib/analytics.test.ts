import { describe, expect, it } from "vitest";
import { weeklyVolume, type SessionTonnagePoint } from "./analytics";

describe("weeklyVolume", () => {
  it("aggregates sessions by week (Monday UTC boundary)", () => {
    const sessions: SessionTonnagePoint[] = [
      {
        sessionId: "s1",
        performedAt: "2024-01-01T10:00:00Z", // Monday
        programId: null,
        tonnage: 1000,
        setCount: 5,
        excludedSetCount: 0,
      },
      {
        sessionId: "s2",
        performedAt: "2024-01-03T10:00:00Z", // Wednesday, same week
        programId: null,
        tonnage: 1500,
        setCount: 6,
        excludedSetCount: 0,
      },
      {
        sessionId: "s3",
        performedAt: "2024-01-08T10:00:00Z", // Monday, next week
        programId: null,
        tonnage: 2000,
        setCount: 7,
        excludedSetCount: 0,
      },
    ];

    const result = weeklyVolume(sessions);

    expect(result).toEqual([
      {
        weekStart: "2024-01-01",
        tonnage: 2500,
        sessionCount: 2,
      },
      {
        weekStart: "2024-01-08",
        tonnage: 2000,
        sessionCount: 1,
      },
    ]);
  });

  it("handles empty input", () => {
    expect(weeklyVolume([])).toEqual([]);
  });

  it("aggregates sessions across Sunday boundary correctly", () => {
    const sessions: SessionTonnagePoint[] = [
      {
        sessionId: "s1",
        performedAt: "2024-01-07T10:00:00Z", // Sunday
        programId: null,
        tonnage: 1000,
        setCount: 5,
        excludedSetCount: 0,
      },
      {
        sessionId: "s2",
        performedAt: "2024-01-08T10:00:00Z", // Monday, new week
        programId: null,
        tonnage: 1500,
        setCount: 6,
        excludedSetCount: 0,
      },
    ];

    const result = weeklyVolume(sessions);

    expect(result).toHaveLength(2);
    expect(result[0].weekStart).toBe("2024-01-01"); // Sunday belongs to previous Monday
    expect(result[0].tonnage).toBe(1000);
    expect(result[1].weekStart).toBe("2024-01-08");
    expect(result[1].tonnage).toBe(1500);
  });
});
