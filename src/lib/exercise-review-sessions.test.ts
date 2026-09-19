import { describe, expect, it } from "vitest";
import {
  formatReviewDelta,
  formatReviewE1rm,
  groupReviewSessions,
  periodDatesInChartRange,
  reviewChartPoints,
  reviewRecentWindow,
  reviewToday,
  type ReviewSetRow,
} from "./exercise-review-sessions";

const now = new Date("2026-09-19T18:00:00Z");

function row(
  sessionId: string,
  day: string,
  extra: Partial<ReviewSetRow> & { e1rm?: number | null } = {},
): ReviewSetRow {
  const performedAt = extra.performedAt ?? `${day}T12:00:00Z`;
  return {
    id: extra.id ?? `${sessionId}-a`,
    sessionId,
    weight: extra.weight ?? 100,
    reps: extra.reps ?? 8,
    rir: extra.rir ?? 1,
    e1rm: extra.e1rm === undefined ? 140 : extra.e1rm,
    performedAt,
    finishedAt: extra.finishedAt === undefined ? `${day}T13:00:00Z` : extra.finishedAt,
  };
}

describe("groupReviewSessions", () => {
  it("groups working sets by session, keeps the stored session-best, and drops unfinished or future sessions", () => {
    const sessions = groupReviewSessions(
      [
        row("open", "2026-09-18", { finishedAt: null, e1rm: 160 }),
        row("future", "2026-09-20", { e1rm: 170 }),
        row("s1", "2026-09-02", { e1rm: 140, reps: 8 }),
        { ...row("s1", "2026-09-02", { id: "s1-b", e1rm: 150, reps: 6, weight: 110 }) },
        row("s2", "2026-09-16", { e1rm: 155 }),
      ],
      now,
    );
    expect(sessions.map((session) => session.sessionId)).toEqual(["s1", "s2"]);
    expect(sessions[0]).toMatchObject({
      dateKey: "2026-09-02",
      bestE1rm: 150,
    });
    expect(sessions[0].sets.map((set) => set.id)).toEqual(["s1-a", "s1-b"]);
    expect(reviewToday(sessions)?.sessionId).toBe("s2");
  });

  it("uses Chicago date keys for sessions near midnight UTC", () => {
    const sessions = groupReviewSessions(
      [row("late", "2026-09-02", { performedAt: "2026-09-02T04:59:00Z", finishedAt: "2026-09-02T05:30:00Z" })],
      now,
    );
    expect(sessions[0].dateKey).toBe("2026-09-01");
  });
});

describe("reviewRecentWindow", () => {
  it("counts finished workouts in the last 21 Chicago days and diffs first to last session-best", () => {
    const sessions = groupReviewSessions(
      [
        row("old", "2026-08-01", { e1rm: 120 }),
        row("a", "2026-09-02", { e1rm: 140 }),
        row("b", "2026-09-09", { e1rm: 130 }),
        row("c", "2026-09-16", { e1rm: 155 }),
      ],
      now,
    );
    const recent = reviewRecentWindow(sessions, now);
    expect(recent).toMatchObject({
      kind: "sessions",
      bestE1rm: 155,
      delta: 15,
    });
    if (recent?.kind === "sessions") {
      expect(recent.sessions.map((session) => session.sessionId)).toEqual(["a", "b", "c"]);
    }
  });

  it("returns last trained when nothing falls in the 21-day window", () => {
    const sessions = groupReviewSessions([row("old", "2026-08-01", { e1rm: 120 })], now);
    expect(reviewRecentWindow(sessions, now)).toEqual({
      kind: "gap",
      lastTrained: "2026-08-01",
    });
  });

  it("does not invent a trend from a single session in the window", () => {
    const sessions = groupReviewSessions(
      [row("old", "2026-08-01", { e1rm: 120 }), row("recent", "2026-09-16", { e1rm: 155 })],
      now,
    );
    expect(reviewRecentWindow(sessions, now)).toMatchObject({
      kind: "sessions",
      bestE1rm: 155,
      delta: null,
    });
  });
});

describe("reviewChartPoints", () => {
  it("defaults to the last 8 session-bests and can expand to all history", () => {
    const sessions = groupReviewSessions(
      Array.from({ length: 10 }, (_, i) => {
        const day = 10 + i;
        return row(`s${i}`, `2026-09-${day}`, { e1rm: 100 + i });
      }),
      now,
    );
    const last8 = reviewChartPoints(sessions, "last8");
    expect(last8).toHaveLength(8);
    expect(last8[0]).toEqual({ date: "Sep 12", dateKey: "2026-09-12", e1rm: 102 });
    expect(last8.at(-1)).toEqual({ date: "Sep 19", dateKey: "2026-09-19", e1rm: 109 });
    expect(reviewChartPoints(sessions, "all")).toHaveLength(10);
  });

  it("skips sessions with no stored estimate", () => {
    const sessions = groupReviewSessions(
      [row("a", "2026-09-02", { e1rm: null }), row("b", "2026-09-16", { e1rm: 155 })],
      now,
    );
    expect(reviewChartPoints(sessions, "all")).toEqual([
      { date: "Sep 16", dateKey: "2026-09-16", e1rm: 155 },
    ]);
  });
});

describe("periodDatesInChartRange", () => {
  it("keeps observed days inside the chart window and does not infer unmarked days", () => {
    const points = reviewChartPoints(
      groupReviewSessions(
        [row("a", "2026-09-02", { e1rm: 140 }), row("b", "2026-09-16", { e1rm: 155 })],
        now,
      ),
      "all",
    );
    expect(periodDatesInChartRange(points, ["2026-09-01", "2026-09-09", "2026-09-20"])).toEqual([
      "2026-09-09",
    ]);
  });
});

describe("review e1RM display", () => {
  it("formats stored estimates to a tenth of a pound", () => {
    expect(formatReviewE1rm(150)).toBe("150.0 lb");
    expect(formatReviewE1rm(75.3)).toBe("75.3 lb");
    expect(formatReviewDelta(15)).toBe("+15.0");
    expect(formatReviewDelta(-2.25)).toBe("-2.3");
    expect(formatReviewDelta(0)).toBe("0.0");
  });
});
