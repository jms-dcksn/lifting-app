import type { CoachRecommendation } from "@/lib/coach-recommendations";

/** Historical report evidence. Current targets and confirmed actions have their own sources. */
export function CoachRecommendationList({ recommendations }: { recommendations: CoachRecommendation[] }) {
  const visible = recommendations.filter(r => r.confidence !== "insufficient");
  if (!visible.length) return null;
  return <details id="coach-next-steps" className="my-4"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Supporting recommendation evidence</summary>
    <p className="mb-3 text-sm text-muted">These report-window proposals are read-only evidence. Current workout targets are calculated automatically. Applied structural changes require a saved Coach receipt.</p>
    <ul className="divide-y divide-border">{visible.map(r => <li key={r.key} className="py-3"><p className="font-medium">{r.exerciseName ?? "Session review"}</p><p className="mt-1 text-sm">{r.rationale}</p><p className="mt-1 text-sm text-muted">{r.evidence.exposureCount} exposures · {r.evidence.windowStart}–{r.evidence.windowEnd}</p></li>)}</ul>
  </details>;
}
