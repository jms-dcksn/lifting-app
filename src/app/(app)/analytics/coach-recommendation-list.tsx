"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoButton } from "@/components/ui/info-button";
import type { CoachRecommendation } from "@/lib/coach-recommendations";
import {
  pendingCoachRecommendations,
  type RecommendationDecision,
  type RecommendationDecisionStatus,
} from "@/lib/coach-recommendation-decisions";
import { retryServerAction } from "@/lib/retry";
import {
  acceptAllCoachRecommendations,
  saveCoachRecommendationDecision,
} from "./actions";

const DEFER_MS = 7 * 24 * 60 * 60 * 1000;

export function CoachRecommendationList({
  recommendations,
  decisions: initialDecisions,
  currentTime,
}: {
  recommendations: CoachRecommendation[];
  decisions: RecommendationDecision[];
  currentTime: string;
}) {
  const [decisions, setDecisions] = useState(initialDecisions);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(new Set<string>());
  const pending = pendingCoachRecommendations(recommendations, decisions, currentTime);

  function remember(next: RecommendationDecision | RecommendationDecision[]) {
    const extra = Array.isArray(next) ? next : [next];
    setDecisions((current) => {
      const byKey = new Map(current.map((item) => [item.recommendationKey, item]));
      for (const item of extra) byKey.set(item.recommendationKey, item);
      return [...byKey.values()];
    });
  }

  function revert(keys: string[], snapshot: RecommendationDecision[]) {
    setDecisions((current) => {
      const keep = current.filter((item) => !keys.includes(item.recommendationKey));
      return [...keep, ...snapshot.filter((item) => keys.includes(item.recommendationKey))];
    });
  }

  async function decide(recommendationKey: string, status: RecommendationDecisionStatus) {
    if (inflight.current.has(recommendationKey) || inflight.current.has("all")) return;
    inflight.current.add(recommendationKey);
    const snapshot = decisions.filter((item) => item.recommendationKey === recommendationKey);
    setError(null);
    remember({
      recommendationKey,
      status,
      deferredUntil: status === "deferred" ? new Date(Date.now() + DEFER_MS).toISOString() : null,
    });
    try {
      const result = await retryServerAction(() =>
        saveCoachRecommendationDecision({ recommendationKey, status }),
      );
      if (!result.ok) {
        revert([recommendationKey], snapshot);
        setError(result.error);
        return;
      }
      remember({
        recommendationKey,
        status,
        deferredUntil: result.deferredUntil,
      });
    } catch {
      revert([recommendationKey], snapshot);
      setError("Couldn’t save that decision. Check your connection and try again.");
    } finally {
      inflight.current.delete(recommendationKey);
    }
  }

  async function acceptAll() {
    if (inflight.current.size > 0) return;
    inflight.current.add("all");
    const keys = pending.map((item) => item.key);
    const snapshot = decisions.filter((item) => keys.includes(item.recommendationKey));
    setError(null);
    remember(keys.map((recommendationKey) => ({
      recommendationKey,
      status: "accepted" as const,
      deferredUntil: null,
    })));
    try {
      const result = await retryServerAction(() => acceptAllCoachRecommendations(keys));
      if (!result.ok) {
        revert(keys, snapshot);
        setError(result.error);
        return;
      }
    } catch {
      revert(keys, snapshot);
      setError("Couldn’t accept those recommendations. Check your connection and try again.");
    } finally {
      inflight.current.delete("all");
    }
  }

  if (pending.length === 0) {
    return (
      <p id="coach-next-steps" className="mb-4 border-y border-border py-4 text-body text-muted">
        No recommendations need review right now.
      </p>
    );
  }

  const doFirst = pending.filter((item) => item.priority === "now");
  const also = pending.filter((item) => item.priority !== "now");
  const showTiers = doFirst.length > 0 && also.length > 0;

  return (
    <details id="coach-next-steps" open className="mb-4 border-y border-border py-4">
      <summary className="cursor-pointer select-none text-caption font-semibold uppercase tracking-wide text-muted">
        Proposed next steps ({pending.length})
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <InfoButton title="Proposed next steps" label="What accepting means">
            Accept records the plan. It does not change your program.
          </InfoButton>
          <Button type="button" size="sm" className="shrink-0" onClick={() => void acceptAll()}>
            Accept all ({pending.length})
          </Button>
        </div>
        {error && <p role="alert" className="text-body text-danger">{error}</p>}
        {showTiers ? (
          <>
            <RecommendationTier label="Do first" items={doFirst} onDecide={decide} />
            <RecommendationTier label="Also" items={also} onDecide={decide} />
          </>
        ) : (
          <RecommendationItems items={pending} onDecide={decide} />
        )}
      </div>
    </details>
  );
}

function RecommendationTier({
  label,
  items,
  onDecide,
}: {
  label: string;
  items: CoachRecommendation[];
  onDecide: (key: string, status: RecommendationDecisionStatus) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption font-semibold uppercase tracking-wide text-muted">{label}</p>
      <RecommendationItems items={items} onDecide={onDecide} />
    </div>
  );
}

function RecommendationItems({
  items,
  onDecide,
}: {
  items: CoachRecommendation[];
  onDecide: (key: string, status: RecommendationDecisionStatus) => void;
}) {
  return (
    <>
      {items.map((item) => (
        <article key={item.key} className="border-t border-border pt-4 first:border-0 first:pt-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-heading">
                {item.programDayName ? `${item.programDayName} · ` : ""}
                {item.exerciseName ?? "Overall review"}
              </p>
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
            <Button type="button" variant="primary" size="sm" className="w-full" onClick={() => onDecide(item.key, "accepted")}>
              Accept
            </Button>
            <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => onDecide(item.key, "deferred")}>
              Later
            </Button>
            <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => onDecide(item.key, "dismissed")}>
              Dismiss
            </Button>
          </div>
        </article>
      ))}
    </>
  );
}
