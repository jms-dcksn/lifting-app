import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CoachRecommendationList } from "@/app/(app)/analytics/coach-recommendation-list";
import type { CoachRecommendation } from "./coach-recommendations";
const recommendation: CoachRecommendation = {
  key: "rec_1111111111111111", kind: "reduce_load", loadReductionReason: "repeated_effort_miss", exerciseId: "db-bench", exerciseName: "Bench", programDayName: "Upper",
  action: { label: "Reduce", targetWeight: 95, targetReps: 8 }, rationale: "Two comparable effort misses.",
  evidence: { windowStart: "2026-10-01", windowEnd: "2026-10-17", exposureCount: 2, summary: [] },
  confidence: "high", dataSufficiency: "Supported", priority: "now",
};
describe("optional Coach report evidence", () => {
  it("retains report facts without routine acceptance or applied claims", () => {
    const html = renderToStaticMarkup(createElement(CoachRecommendationList, { recommendations: [recommendation] }));
    expect(html).toContain("Two comparable effort misses"); expect(html).toContain("2026-10-01");
    expect(html).toContain("read-only evidence"); expect(html).toContain("calculated automatically");
    expect(html).not.toContain("<button"); expect(html).not.toContain("Accept"); expect(html).not.toContain("Dismiss");
  });
  it("does not fill the evidence view with unsupported proposals", () => {
    expect(renderToStaticMarkup(createElement(CoachRecommendationList, { recommendations: [{ ...recommendation, confidence: "insufficient" }] }))).toBe("");
  });
});
