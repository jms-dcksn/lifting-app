import type { EpisodeEvidence, EpisodeObservation } from "../coach-episodes";
import { episodeContextKey } from "../coach-episodes";
export function coachEvidence(
  kind: "reduction" | "plateau" | "decline" | "pain" = "reduction",
): EpisodeEvidence {
  return {
    name: "Bench",
    values: [{ id: "set", weight: 100, reps: 8, rir: 0, e1rm: 120 }],
    effectiveTarget: null,
    candidate: {
      policyVersion: "1.0",
      userId: "u",
      scope:
        kind === "pain"
          ? { kind: "session", sessionIds: ["s1"] }
          : {
              kind: "lift",
              slotId: "slot",
              context: {
                programId: "p",
                programDayId: "d",
                exerciseId: "bb-bench",
                equipmentInstanceId: null,
                phaseId: null,
                adaptationStartAt: null,
                repMin: 6,
                repMax: 10,
                targetRirMin: 2,
                targetRirMax: 2,
                targetSets: 3,
              },
            },
      evidenceStart: "2026-10-01T12:00:00Z",
      evidenceEnd: "2026-10-10T12:00:00Z",
      signals: [
        {
          status: "recommended",
          sources: [
            {
              sessionId: "s1",
              performedAt: "2026-10-10T12:00:00Z",
              setIds: ["set"],
              firstSetId: "set",
            },
          ],
          ...(kind === "pain"
            ? { reason: "significant_pain", action: "review_pain" }
            : kind === "decline"
              ? {
                  reason: "sustained_decline",
                  action: "review_trend",
                  trend: { classification: "declining", evidenceExposureCount: 4, recentAverageE1rm: 110, previousAverageE1rm: 120, changePercent: -8.333333333 },
                }
              : kind === "plateau"
                ? {
                    reason: "confirmed_plateau",
                    action: "rep_change",
                    repBand: { repMin: 12, repMax: 15 },
                    plateau: { plateaued: true, stalledExposures: 3, stalledSinceDays: 21, patience: 3 },
                  }
                : {
                    reason: "repeated_effort_miss",
                    action: "reduce_load",
                    target: { weight: 95, targetReps: 8, targetRir: 2 },
                  }),
        },
      ],
    },
  };
}
export function coachObservation(e = coachEvidence()): EpisodeObservation {
  return { contextKey: episodeContextKey(e.candidate), evidence: e, disposition: "current", frontier: ["s1"] };
}
