import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExerciseReview } from "@/app/(app)/history/[exerciseId]/exercise-review";
import HistoryError from "@/app/(app)/history/[exerciseId]/error";
import { groupReviewSessions, type ReviewSetRow } from "./exercise-review-sessions";

const now = new Date("2026-09-19T18:00:00Z");

function sessionsFrom(rows: ReviewSetRow[]) {
  return groupReviewSessions(rows, now);
}

const oneSession = sessionsFrom([{
  id: "r1",
  sessionId: "s1",
  weight: 100,
  reps: 10,
  rir: 1,
  e1rm: 150,
  performedAt: "2026-09-02T12:00:00Z",
  finishedAt: "2026-09-02T13:00:00Z",
}]);

function ready(sessions = oneSession, extra: { periodEligible?: boolean; periodDates?: string[] } = {}) {
  return createElement(ExerciseReview, {
    status: "ready",
    name: "Barbell Bench Press",
    isBodyweight: false,
    sessions,
    reviewMonth: null,
    now,
    ...extra,
  });
}

describe("exercise review", () => {
  it("uses its own copy when the exercise is missing", () => {
    const html = renderToStaticMarkup(createElement(ExerciseReview, { status: "missing", reviewMonth: null }));
    expect(html).toContain("Exercise not found");
    expect(html).toContain("This exercise is not in your catalog.");
    expect(html).not.toContain("Month review could not load");
    expect(html).not.toContain("No working sets logged yet.");
  });

  it("uses its own copy when the exercise has no working sets", () => {
    const html = renderToStaticMarkup(createElement(ExerciseReview, {
      status: "empty",
      name: "Barbell Bench Press",
      reviewMonth: null,
    }));
    expect(html).toContain("Barbell Bench Press");
    expect(html).toContain("No working sets logged yet.");
    expect(html).not.toContain("Exercise not found");
    expect(html).not.toContain("Today");
    expect(html).not.toContain("e1RM chart");
    expect(html).not.toContain("No working sets for this exact exercise");
  });

  it("keeps the unfiltered review when a month query is present", () => {
    const html = renderToStaticMarkup(createElement(ExerciseReview, {
      status: "ready",
      name: "Barbell Bench Press",
      isBodyweight: false,
      sessions: oneSession,
      reviewMonth: "2026-09",
      now,
    }));
    expect(html).toContain("Barbell Bench Press");
    expect(html).toContain("Today");
    expect(html).toContain("150.0 lb");
    expect(html).toContain("100 lb × 10 @ 1 RIR");
    expect(html).toContain("One session so far. Log another to see the trend.");
    expect(html).toContain('href="/analytics/month?month=2026-09"');
    expect(html).toContain("Back to 2026-09 month review");
    expect(html).toContain('href="/session/s1"');
    expect(html).not.toContain("1 session logged");
    expect(html).not.toContain("140.0 lb → 150.0 lb");
    expect(html).not.toContain("No prior comparison");
    expect(html).not.toContain("Compared with");
  });

  it("omits the month back link when month is absent", () => {
    const html = renderToStaticMarkup(ready());
    expect(html).toContain("Barbell Bench Press");
    expect(html).not.toContain("month review");
    expect(html).not.toContain("/analytics/month");
  });

  it("does not replace the page with monthly-history copy for a missing identity", () => {
    const html = renderToStaticMarkup(createElement(ExerciseReview, {
      status: "empty",
      name: "Barbell Bench Press",
      reviewMonth: "2026-09",
    }));
    expect(html).toContain("No working sets logged yet.");
    expect(html).toContain("Back to 2026-09 month review");
    expect(html).not.toContain("No working sets for this exact exercise and equipment in these windows.");
  });

  it("uses Exercise review error copy instead of Month review", () => {
    const html = renderToStaticMarkup(createElement(HistoryError, { reset: () => {} }));
    expect(html).toContain("Exercise review could not load");
    expect(html).toContain("Your workout history has not changed.");
    expect(html).not.toContain("Month review could not load");
  });

  it("answers Today, a 21-day block, and a last-8 chart toggle", () => {
    const sessions = sessionsFrom([
      {
        id: "old",
        sessionId: "s0",
        weight: 90,
        reps: 8,
        rir: 1,
        e1rm: 120,
        performedAt: "2026-08-01T12:00:00Z",
        finishedAt: "2026-08-01T13:00:00Z",
      },
      {
        id: "r1",
        sessionId: "s1",
        weight: 100,
        reps: 8,
        rir: 1,
        e1rm: 140,
        performedAt: "2026-09-02T12:00:00Z",
        finishedAt: "2026-09-02T13:00:00Z",
      },
      {
        id: "r2",
        sessionId: "s2",
        weight: 110,
        reps: 8,
        rir: 1,
        e1rm: 155,
        performedAt: "2026-09-16T12:00:00Z",
        finishedAt: "2026-09-16T13:00:00Z",
      },
    ]);
    const html = renderToStaticMarkup(ready(sessions, {
      periodEligible: true,
      periodDates: ["2026-09-02"],
    }));
    expect(html).toContain("Today");
    expect(html).toContain("155.0 lb");
    expect(html).toContain("+15.0 lb");
    expect(html).toContain("Past three weeks");
    expect(html).toContain("Workouts");
    expect(html).toContain(">2<");
    expect(html).toContain("Last 8 workouts");
    expect(html).toContain("All history");
    expect(html).toContain('data-chart-range="last8"');
    expect(html).toContain('aria-label="e1RM over time"');
    expect(html).not.toContain("e1RM over time with period days");
    expect(html).not.toContain("No prior comparison");
    expect(html).toContain('href="/session/s2"');
  });

  it("shows last trained when recent history is empty and skips a fake trend", () => {
    const sessions = sessionsFrom([
      {
        id: "a",
        sessionId: "s0",
        weight: 90,
        reps: 8,
        rir: 1,
        e1rm: 120,
        performedAt: "2026-07-01T12:00:00Z",
        finishedAt: "2026-07-01T13:00:00Z",
      },
      {
        id: "b",
        sessionId: "s1",
        weight: 100,
        reps: 8,
        rir: 1,
        e1rm: 130,
        performedAt: "2026-08-01T12:00:00Z",
        finishedAt: "2026-08-01T13:00:00Z",
      },
    ]);
    const html = renderToStaticMarkup(ready(sessions));
    expect(html).toContain("Last trained");
    expect(html).not.toContain("Workouts");
    expect(html).not.toContain("No prior comparison");
  });
});
