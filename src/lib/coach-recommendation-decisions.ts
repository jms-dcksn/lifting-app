import type { CoachRecommendation } from "@/lib/coach-recommendations";

export const DECISION_STATUSES = ["accepted", "dismissed", "deferred"] as const;
export type RecommendationDecisionStatus = (typeof DECISION_STATUSES)[number];

export interface RecommendationDecision {
  recommendationKey: string;
  status: RecommendationDecisionStatus;
  deferredUntil: string | null;
}

export function pendingCoachRecommendations<
  T extends Pick<CoachRecommendation, "key" | "kind" | "confidence">,
>(
  recommendations: T[],
  decisions: RecommendationDecision[],
  currentTime: string,
): T[] {
  const now = new Date(currentTime).getTime();
  const decisionByKey = new Map(decisions.map((decision) => [decision.recommendationKey, decision]));
  return recommendations.filter((item) => {
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
}
