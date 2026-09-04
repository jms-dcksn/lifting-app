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
  const visible = recommendations.filter((item) => {
    const decision = decisionByKey.get(item.key);
    if (decision?.status === "dismissed") return false;
    if (
      decision?.status === "deferred"
      && decision.deferredUntil
      && new Date(decision.deferredUntil).getTime() > now
    ) return false;
    return true;
  });
  const pending = visible.filter((item) => (
    item.kind !== "insufficient_data"
    && decisionByKey.get(item.key)?.status !== "accepted"
  ));

  if (visible.length === 0) {
    return (
      <p className="mb-4 border-y border-border py-4 text-body text-muted">
        No recommendations need review right now.
      </p>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-4 border-y border-border py-4">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-muted">
              Proposed next steps
            </p>
            <p className="text-caption text-muted">
              Evidence-backed proposals only. Nothing changes your program automatically.
            </p>
          </div>
          {pending.length > 0 && (
            <form action={acceptAllCoachRecommendations} className="shrink-0">
              {pending.map((item) => (
                <input key={item.key} type="hidden" name="recommendation_key" value={item.key} />
              ))}
              <Button type="submit" size="sm">
                Accept all ({pending.length})
              </Button>
            </form>
          )}
        </div>
      </div>
      {visible.map((item) => {
        const accepted = decisionByKey.get(item.key)?.status === "accepted";
        return (
          <article key={item.key} className="border-t border-border pt-4 first:border-0 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-heading">{item.exerciseName ?? "Overall review"}</p>
                <p className="text-body">{item.action.label}</p>
              </div>
              <span className="shrink-0 text-caption uppercase tracking-wide text-muted">
                {accepted ? "accepted" : item.confidence}
              </span>
            </div>
            <p className="mt-2 text-caption text-muted">{item.rationale}</p>
            <details className="mt-2 text-caption text-muted">
              <summary className="cursor-pointer select-none">Evidence · {item.evidence.exposureCount} exposure{item.evidence.exposureCount === 1 ? "" : "s"}</summary>
              <p className="mt-1">{item.dataSufficiency}</p>
              {item.evidence.summary.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {item.evidence.summary.map((line, index) => <li key={`${item.key}-${index}`}>{line}</li>)}
                </ul>
              )}
            </details>
            {!accepted && item.kind !== "insufficient_data" && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <DecisionForm recommendationKey={item.key} status="accepted" label="Accept" />
                <DecisionForm recommendationKey={item.key} status="deferred" label="Later" />
                <DecisionForm recommendationKey={item.key} status="dismissed" label="Dismiss" />
              </div>
            )}
          </article>
        );
      })}
    </div>
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
