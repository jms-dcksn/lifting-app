import Link from "next/link";
import { ExerciseVisual } from "@/components/ui/exercise-visual";
import { Sparkline } from "@/components/ui/icons";
import { cx } from "@/components/ui/cx";
import { exerciseEquipmentChipClass } from "@/components/ui/exercise-card-label";
import { PinButton } from "../pins/pin-button";
import { signedDelta, type BoardLift } from "@/lib/board";
import { exerciseCardLabelText } from "@/lib/exercise-card-label";
import { exerciseReviewHref } from "@/lib/exercise-review-href";

function tileAriaLabel(lift: BoardLift) {
  const value = lift.currentE1rm == null ? "No e1RM" : `${Math.round(lift.currentE1rm)} e1RM`;
  const delta = signedDelta(lift.delta);
  return `${exerciseCardLabelText(lift.label)}. ${value}${delta ? `, ${delta}` : ""}`;
}

function brandLine(lift: BoardLift) {
  return [lift.label.secondary, lift.label.tertiary].filter(Boolean).join(" · ");
}

export function BoardTile({ lift, pinned, showPin = true }: { lift: BoardLift; pinned: boolean; showPin?: boolean }) {
  const delta = signedDelta(lift.delta);
  const series = lift.e1rmSeries.slice(-12);
  const positiveRecord = lift.recentRecord && delta?.startsWith("▲") === true;
  return (
    <article
      data-board-tile
      className={cx(
        "relative flex h-full min-w-0 flex-col rounded-card border border-border p-3",
        lift.recentRecord && "border-record/50 bg-record/10",
      )}
    >
      {showPin && (
        <div className="absolute right-1 top-1">
          <PinButton exerciseId={lift.exerciseId} pinned={pinned} name={lift.name} />
        </div>
      )}
      <Link
        href={exerciseReviewHref({ exerciseId: lift.reviewExerciseId, equipmentInstanceId: lift.equipmentInstanceId })}
        aria-label={tileAriaLabel(lift)}
        className="flex min-h-11 w-full min-w-0 flex-1 flex-col"
      >
        <div className="flex min-h-11 min-w-0 items-start">
          <ExerciseVisual exerciseId={lift.exerciseId} />
        </div>
        <div className="min-h-10 min-w-0">
          <p className="line-clamp-2 break-words text-body font-medium">{lift.label.name}</p>
        </div>
        <div className="mt-1 flex h-6 min-w-0 items-center gap-1.5 overflow-hidden">
          {lift.label.equipment ? <span className={exerciseEquipmentChipClass}>{lift.label.equipment}</span> : null}
          {lift.label.station ? <span className="min-w-0 truncate text-caption text-muted">{lift.label.station}</span> : null}
        </div>
        <p className="mt-1 h-4 min-w-0 truncate text-caption text-muted">{brandLine(lift)}</p>
        <div className="mt-auto flex min-w-0 flex-col pt-2">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <p data-board-e1rm className="min-w-0 whitespace-nowrap text-heading tabular-nums">
              {lift.currentE1rm == null ? "—" : Math.round(lift.currentE1rm)}
              <span className="ml-1 text-caption font-normal text-muted">e1RM</span>
            </p>
            <span
              data-board-delta
              className={cx(
                "shrink-0 rounded-full border px-1.5 py-0.5 text-caption tabular-nums",
                positiveRecord ? "border-record/50 text-record" : "border-border text-muted",
              )}
            >
              {delta ?? "—"}
            </span>
          </div>
          <div
            className="mt-1 h-[26px] w-full min-w-0"
            data-board-sparkline={series.length >= 2 ? "series" : "empty"}
          >
            {series.length >= 2 ? (
              <Sparkline values={series} />
            ) : (
              <div className="flex h-full items-center" aria-hidden>
                <div className="w-full border-t border-dashed border-faint" />
              </div>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}

export function BoardGrid({
  lifts,
  pinnedIds,
  showPin = true,
}: {
  lifts: BoardLift[];
  pinnedIds: string[];
  showPin?: boolean;
}) {
  if (lifts.length === 0) {
    return <p className="text-body text-muted">Log a compound and it lands here.</p>;
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-3">
      {lifts.map((lift) => (
        <BoardTile
          key={lift.exerciseId}
          lift={lift}
          pinned={pinnedIds.includes(lift.exerciseId)}
          showPin={showPin}
        />
      ))}
    </div>
  );
}
