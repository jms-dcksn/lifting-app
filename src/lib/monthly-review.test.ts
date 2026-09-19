import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonthlyReview } from "@/app/(app)/analytics/month/review";
import { buildMonthlyReport } from "./monthly-progress";
import { EXERCISE_BY_ID } from "./strength/coefficients";
import type { RecordSet } from "./strength/records";
import type { BodyweightEntry } from "./bodyweight";

const now = new Date("2026-09-14T18:00:00Z");
const sessions = ["2026-08-02", "2026-09-02"].map((day, i) => ({ id: `s${i}`, user_id: "u", performed_at: `${day}T12:00:00Z`, finished_at: `${day}T13:00:00Z` }));
const sets: RecordSet[] = sessions.map((s, i) => ({ id: `r${i}`, user_id: "u", session_id: s.id, exercise_id: "bb-bench", equipment_instance_id: null, program_slot_id: null, weight: 100, reps: 8 + i * 2, rir: 1, e1rm: 140 + i * 10, is_warmup: false, created_at: s.performed_at, workout_session: s }));
const makeReport = (rows = sets) => buildMonthlyReport({ userId: "u", month: "2026-09", now, sessions, sets: rows, catalog: EXERCISE_BY_ID });

describe("monthly review presentation", () => {
  it("renders canonical results, exact comparison dates, and equipment-preserving drill-down links", () => {
    const report = makeReport();
    const html = renderToStaticMarkup(createElement(MonthlyReview, { report }));
    expect(html).toContain("In progress · month to date");
    expect(html).toContain("2026-08-14");
    expect(html).toContain("Where you improved");
    expect(html).toContain("Barbell Bench Press");
    expect(html).toContain("+7.1%");
    expect(html).toContain("month=2026-09&amp;equipment=none");
    expect(html).toContain("/session/s1/recap");
    expect(html).not.toContain("140.0 lb → 150.0 lb");
    expect(html).not.toContain("Prior period dashed");
    expect(html).not.toContain("All lifts");
    expect(html).not.toContain("No prior comparison");
    expect(html).not.toContain("current /");
    expect(html).not.toContain("Supporting workouts");
    expect(html).not.toContain("Worth reviewing");
    expect(html).not.toContain("Period and performance");
  });
  it("does not dump first-month lifts as No prior comparison", () => {
    const report = makeReport([
      ...sets,
      { ...sets[1], id: "curl", exercise_id: "cable-curl", e1rm: 75.3 },
    ]);
    const html = renderToStaticMarkup(createElement(MonthlyReview, { report }));
    expect(html).toContain("Barbell Bench Press");
    expect(html).not.toContain("Cable Curl");
    expect(html).not.toContain("All lifts");
    expect(html).not.toContain("No prior comparison");
    expect(html).not.toContain("75.3");
  });
  it("lists rep-gain names and the gain sentence without a trend block", () => {
    const report = makeReport(sets.map((row, i) => i === 1 ? { ...row, e1rm: 140 } : row));
    const html = renderToStaticMarkup(createElement(MonthlyReview, { report }));
    expect(html).toContain("Rep gains without a higher monthly best");
    expect(html).toContain("Barbell Bench Press");
    expect(html).toContain("8 → 10 reps at 100 lb effective load");
    expect(html).toContain("month=2026-09&amp;equipment=none");
    expect(html).not.toContain("140.0 lb → 140.0 lb");
    expect(html).not.toContain("All lifts");
  });
  it("overlays period weeks with weight change and PR counts when tracking is enabled", () => {
    const report = makeReport();
    const html = renderToStaticMarkup(createElement(MonthlyReview, {
      report,
      eligible: true,
      periodObservations: [{ id: "p1", observedOn: "2026-09-02" }],
      weightEntries: [
        { id: "w0", loggedOn: "2026-08-31", weight: 148 },
        { id: "w1", loggedOn: "2026-09-06", weight: 150 },
        { id: "w2", loggedOn: "2026-09-13", weight: 151 },
      ] satisfies BodyweightEntry[],
    }));
    expect(html).toContain("Period and performance");
    expect(html).toContain("Period weeks");
    expect(html).toContain("Other weeks");
    expect(html).toContain("Sep 7-13");
    expect(html).toContain("2 PRs");
  });
  it("keeps the overlay hidden when period tracking is not enabled", () => {
    const html = renderToStaticMarkup(createElement(MonthlyReview, {
      report: makeReport(),
      eligible: false,
      periodObservations: [{ id: "p1", observedOn: "2026-09-02" }],
    }));
    expect(html).not.toContain("Period and performance");
    expect(html).not.toContain("Period weeks");
  });
  it("keeps weight access and omits unsupported insights for empty history", () => {
    const report = buildMonthlyReport({ userId: "u", month: "2026-09", now, sessions: [], sets: [], catalog: EXERCISE_BY_ID });
    const html = renderToStaticMarkup(createElement(MonthlyReview, { report }));
    expect(html).toContain("No completed workouts");
    expect(html).toContain('href="#monthly-weight"');
    expect(html).not.toContain("Where you improved");
    expect(html).not.toContain("Worth reviewing");
  });
});
