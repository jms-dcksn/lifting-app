import { Card, CardLabel } from "@/components/ui/card";
import { CoachCheckIn } from "../analytics/coach-check-in";
import { CoachReportSummary } from "../analytics/coach-report-summary";
import { CoachRecommendationList } from "../analytics/coach-recommendation-list";
import { loadCoachUi } from "@/lib/coach-ui-data";
import Link from "next/link";

export async function CoachSection({
  userId,
  coachExercise,
}: {
  userId: string;
  coachExercise?: string;
}) {
  const { catalog, coachReport, coachRecommendations, coachCheckIn, decisions } =
    await loadCoachUi(userId);
  const visible = coachExercise
    ? coachRecommendations.filter((item) => item.exerciseId === coachExercise)
    : coachRecommendations;

  return (
    <Card>
      <CardLabel className="mb-3">Coach</CardLabel>
      <CoachReportSummary report={coachReport} />
      {coachExercise && (
        <p className="mb-2 text-caption text-muted">
          Next steps filtered to {catalog[coachExercise]?.name ?? "selected exercise"}.{" "}
          <Link href="/settings#coach-next-steps" className="underline">Show all</Link>
        </p>
      )}
      <CoachRecommendationList
        recommendations={visible}
        decisions={decisions}
        currentTime={coachReport.generatedAt}
      />
      <CoachCheckIn text={coachCheckIn} />
    </Card>
  );
}
