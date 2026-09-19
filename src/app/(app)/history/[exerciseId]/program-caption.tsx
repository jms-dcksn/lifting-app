import { InfoButton } from "@/components/ui/info-button";
import { reviewProgramCaption } from "@/lib/exercise-review-months";
import type { ReviewSession } from "@/lib/exercise-review-sessions";

export function ProgramCaption({
  sessions,
}: {
  sessions: Pick<ReviewSession, "programName">[];
}) {
  const caption = reviewProgramCaption(sessions);
  if (!caption) return null;
  return (
    <div className="mt-3 flex items-start gap-1">
      <p className="text-caption text-muted">{caption}</p>
      <InfoButton title="Program">
        Names come from the workouts in this window. A deleted program leaves no name, so the
        line is hidden.
      </InfoButton>
    </div>
  );
}
