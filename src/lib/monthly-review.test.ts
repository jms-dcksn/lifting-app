import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonthlyReview } from "@/app/(app)/analytics/month/review";
import { MonthlyHistory } from "@/app/(app)/history/[exerciseId]/monthly-history";
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
    expect(html).toContain("140.0 lb → 150.0 lb");
    expect(html).toContain("month=2026-09&amp;equipment=none");
    expect(html).toContain("/session/s1/recap");
    expect(html).toContain("Prior period dashed");
    expect(html).not.toContain("Worth reviewing");
    expect(html).not.toContain("Period and performance");
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
  it("never merges equipment in monthly history and preserves the return month", () => {
    const report = makeReport([...sets, { ...sets[1], id: "other", equipment_instance_id: "machine-b", e1rm: 999 }]);
    const html = renderToStaticMarkup(createElement(MonthlyHistory, { report, exerciseId: "bb-bench", equipment: null }));
    expect(html).toContain("140.0 lb → 150.0 lb");
    expect(html).not.toContain("999.0");
    expect(html).toContain('href="/analytics/month?month=2026-09"');
    const missing = renderToStaticMarkup(createElement(MonthlyHistory, { report, exerciseId: "bb-bench", equipment: "missing" }));
    expect(missing).toContain("No working sets for this exact exercise");
  });
});
