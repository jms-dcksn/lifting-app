import type { CoachCheckInReport, CoachWindowReport } from "@/lib/coach-check-in";
import type { CoachRecommendation } from "@/lib/coach-recommendations";
import type { RecommendationDecision } from "@/lib/coach-recommendation-decisions";

function summarizeWindow(window: CoachWindowReport) {
  return { ...window, sessions: window.sessions.map(({ exercises, feedback, ...session }) => ({
    ...session,
    feedback: { readiness: feedback.readiness, jointPain: feedback.jointPain },
    phases: [...new Set(exercises.flatMap(exercise => exercise.prescription?.phaseName ? [exercise.prescription.phaseName] : []))],
  })) };
}

/** Preserve canonical figures without set-level evidence or duplicate narration. */
export function summarizeWeeklyCoach(input: {
  coachReport: CoachCheckInReport;
  coachRecommendations: CoachRecommendation[];
  decisions: RecommendationDecision[];
}) {
  const keys = new Set(input.coachRecommendations.map(item => item.key));
  return {
    source: "weeklyCoach" as const,
    report: { ...input.coachReport, current: summarizeWindow(input.coachReport.current), prior: summarizeWindow(input.coachReport.prior) },
    recommendations: input.coachRecommendations,
    decisions: input.decisions.filter(decision => keys.has(decision.recommendationKey)),
  };
}
