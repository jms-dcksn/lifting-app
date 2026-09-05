import { Button } from "@/components/ui/button";
import type { CoachRecommendation } from "@/lib/coach-recommendations";
import {
  acceptAllCoachRecommendations,
  saveCoachRecommendationDecision,
} from "./actions";

export interface RecommendationDecision {
  recommendationKey: string;
  status: "accepted" | "dismissed" | "deferred";
  deferredUntil: string | null;
}

export function CoachRecommendationList({
  recommendations,
  decisions,
  currentTime,
}: {
  recommendations: CoachRecommendation[];
  decisions: RecommendationDecision[];
  currentTime: string;
}) {
  const now = new Date(currentTime).getTime();
  const decisionByKey = new Map(decisions.map((decision) => [decision.recommendationKey, decision]));
  const pending = recommendations.filter((item) => {
    if (item.kind === "insufficient_data" || item.confidence === "insufficient") return false;
    const decision = decisionByKey.get(item.key);
    if (decision?.status === "dismissed" || decision?.status === "accepted") return false;
    if (
      decision?.status === "deferred"
      && decision.deferredUntil
      && new Date(decision.deferredUntil).getTime() > now
    ) return false;
    return true;
  });

  if (pending.length === 0) {
    return (
      <p className="mb-4 border-y border-border py-4 text-body text-muted">
        No recommendations need review right now.
      </p>
    );
  }

  return (
    <details open className="mb-4 border-y border-border py-4">
      <summary className="cursor-pointer select-none text-caption font-semibold uppercase tracking-wide text-muted">
        Proposed next steps ({pending.length})
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-caption text-muted">
            Accepting records your plan; your program stays unchanged.
          </p>
          <form action={acceptAllCoachRecommendations} className="shrink-0">
            {pending.map((item) => (
              <input key={item.key} type="hidden" name="recommendation_key" value={item.key} />
            ))}
            <Button type="submit" size="sm">
              Accept all ({pending.length})
            </Button>
          </form>
        </div>
        {pending.map((item) => (
          <article key={item.key} className="border-t border-border pt-4 first:border-0 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-heading">{item.exerciseName ?? "Overall review"}</p>
                <p className="text-body">{item.action.label}</p>
              </div>
              <span className="shrink-0 text-caption uppercase tracking-wide text-muted">
                {item.confidence}
              </span>
            </div>
            <details className="mt-2 text-caption text-muted">
              <summary className="cursor-pointer select-none">Why this suggestion? · {item.evidence.exposureCount} exposure{item.evidence.exposureCount === 1 ? "" : "s"}</summary>
              <p className="mt-2">{item.rationale}</p>
              <p className="mt-1">{item.dataSufficiency}</p>
              {item.evidence.summary.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {item.evidence.summary.map((line, index) => <li key={`${item.key}-${index}`}>{line}</li>)}
                </ul>
              )}
            </details>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <DecisionForm recommendationKey={item.key} status="accepted" label="Accept" />
              <DecisionForm recommendationKey={item.key} status="deferred" label="Later" />
              <DecisionForm recommendationKey={item.key} status="dismissed" label="Dismiss" />
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}

function DecisionForm({
  recommendationKey,
  status,
  label,
}: {
  recommendationKey: string;
  status: RecommendationDecision["status"];
  label: string;
}) {
  return (
    <form action={saveCoachRecommendationDecision}>
      <input type="hidden" name="recommendation_key" value={recommendationKey} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant={status === "accepted" ? "primary" : "secondary"} size="sm" className="w-full">
        {label}
      </Button>
    </form>
  );
}
