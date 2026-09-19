import { describe, expect, it } from "vitest";
import { identityVolume, weeklyVolume, type AnalyticsSetRow } from "./analytics";
import { monthlyWindows } from "./monthly-progress";
import { EXERCISE_BY_ID } from "./strength/coefficients";

const now = new Date("2026-09-19T18:00:00Z");
const defs = { "bb-bench": EXERCISE_BY_ID["bb-bench"] };

function row(id: string, performedAt: string, extra: Partial<AnalyticsSetRow> = {}): AnalyticsSetRow {
  return {
    id,
    sessionId: extra.sessionId ?? id,
    exerciseId: "bb-bench",
    weight: extra.weight ?? 100,
    reps: extra.reps ?? 8,
    rir: 1,
    e1rm: 140,
    createdAt: performedAt.replace("12:00", "12:05").replace("T04:", "T04:").replace("T05:", "T05:"),
    performedAt,
    finishedAt: extra.finishedAt ?? performedAt.replace("T12:", "T13:").replace("T04:", "T05:").replace("T05:", "T06:"),
    isWarmup: extra.isWarmup ?? false,
    ...extra,
  };
}

describe("identityVolume", () => {
  it("buckets by Chicago month windows, not UTC weeklyVolume weeks", () => {
    // 2026-09-01T04:59Z is still 2026-08-31 in America/Chicago.
    const lateAugust = row("aug", "2026-09-01T04:59:00Z", { weight: 100, reps: 10 });
    const september = row("sep", "2026-09-02T12:00:00Z", { weight: 100, reps: 8 });
    const rows = [lateAugust, september];
    const sep = monthlyWindows("2026-09", now).current;
    const aug = monthlyWindows("2026-08", now).current;

    expect(identityVolume(rows, sep, defs, null)).toBe(800);
    expect(identityVolume(rows, aug, defs, null)).toBe(1000);

    const utcWeeks = weeklyVolume([
      { sessionId: "aug", performedAt: lateAugust.performedAt, programId: null, tonnage: 1000, setCount: 1, excludedSetCount: 0 },
      { sessionId: "sep", performedAt: september.performedAt, programId: null, tonnage: 800, setCount: 1, excludedSetCount: 0 },
    ]);
    expect(utcWeeks).toEqual([
      { weekStart: "2026-08-31", weekEnd: "2026-09-06", tonnage: 1800 },
    ]);
  });

  it("uses the elapsed current-month window, not the rest of the calendar month", () => {
    const inWindow = row("today", "2026-09-19T12:00:00Z", { weight: 100, reps: 5 });
    const afterToday = row("future", "2026-09-20T12:00:00Z", { weight: 100, reps: 10 });
    const sep = monthlyWindows("2026-09", now).current;
    expect(sep).toEqual({ start: "2026-09-01", end: "2026-09-19" });
    expect(identityVolume([inWindow, afterToday], sep, defs, null)).toBe(500);
  });

  it("skips warmups and bodyweight sets without a usable load", () => {
    const warmup = row("w", "2026-09-02T12:00:00Z", { isWarmup: true, reps: 8 });
    const working = row("s", "2026-09-02T12:00:00Z", { sessionId: "s", weight: 100, reps: 8 });
    const pullup: AnalyticsSetRow = {
      ...row("bw", "2026-09-02T12:00:00Z"),
      exerciseId: "weighted-pullup",
      weight: 25,
    };
    const sep = monthlyWindows("2026-09", now).current;
    expect(identityVolume([warmup, working], sep, defs, null)).toBe(800);
    expect(identityVolume([pullup], sep, { "weighted-pullup": EXERCISE_BY_ID["weighted-pullup"] }, null)).toBe(0);
  });
});
