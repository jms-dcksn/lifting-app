import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExerciseReview } from "@/app/(app)/history/[exerciseId]/exercise-review";
import HistoryError from "@/app/(app)/history/[exerciseId]/error";

const session = {
  sessionId: "s1",
  performedAt: "2026-09-02T12:00:00Z",
  bestE1rm: 150,
  sets: [{ id: "r1", weight: 100, reps: 10, rir: 1 }],
};

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
    expect(html).not.toContain("No working sets for this exact exercise");
  });

  it("keeps the unfiltered review when a month query is present", () => {
    const html = renderToStaticMarkup(createElement(ExerciseReview, {
      status: "ready",
      name: "Barbell Bench Press",
      isBodyweight: false,
      sessions: [session],
      reviewMonth: "2026-09",
    }));
    expect(html).toContain("Barbell Bench Press");
    expect(html).toContain("1 session logged");
    expect(html).toContain("100 lb × 10 @ 1 RIR");
    expect(html).toContain("One session so far");
    expect(html).toContain('href="/analytics/month?month=2026-09"');
    expect(html).toContain("Back to 2026-09 month review");
    expect(html).not.toContain("140.0 lb → 150.0 lb");
    expect(html).not.toContain("No prior comparison");
    expect(html).not.toContain("Compared with");
  });

  it("omits the month back link when month is absent", () => {
    const html = renderToStaticMarkup(createElement(ExerciseReview, {
      status: "ready",
      name: "Barbell Bench Press",
      isBodyweight: false,
      sessions: [session],
      reviewMonth: null,
    }));
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
});
