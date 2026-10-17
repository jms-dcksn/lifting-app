import { Card, CardLabel } from "@/components/ui/card";
import { CoachCheckIn } from "../coach-check-in";
import { CoachReportSummary } from "../coach-report-summary";
import { CoachRecommendationList } from "../coach-recommendation-list";
import { loadCoachUi } from "@/lib/coach-ui-data";
import Link from "next/link";
import { coachDetailsHref } from "@/lib/coach-entry";

export async function CoachSection({
  userId,
  coachExercise,
  month = null,
}: {
  userId: string;
  coachExercise?: string;
  month?: string | null;
}) {
  const { catalog, coachReport, coachRecommendations, coachCheckIn } =
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
          Evidence for {catalog[coachExercise]?.name ?? "selected exercise"}.{" "}
          <Link href={`${coachDetailsHref({ exerciseId: null, equipmentInstanceId: null, month })}#coach-next-steps`} className="underline">Show all</Link>
        </p>
      )}
      <CoachRecommendationList
        recommendations={visible}
      />
      <CoachCheckIn text={coachCheckIn} />
    </Card>
  );
}
