import Link from "next/link";
import { Sparkline } from "@/components/ui/icons";
import { cx } from "@/components/ui/cx";
import { PinButton } from "../pins/pin-button";
import { signedDelta, type BoardLift } from "@/lib/board";

export function BoardTile({ lift, pinned, showPin = true }: { lift: BoardLift; pinned: boolean; showPin?: boolean }) {
  const delta = signedDelta(lift.delta);
  return (
    <article
      className={cx(
        "relative rounded-card border border-border p-3",
        lift.recentRecord && "border-record/50 bg-record/10",
      )}
    >
      {showPin && (
        <div className="absolute right-1 top-1">
          <PinButton exerciseId={lift.exerciseId} pinned={pinned} name={lift.name} />
        </div>
      )}
      <Link href={`/history/${lift.exerciseId}`} className={cx("flex min-h-11 flex-col gap-1", showPin && "pr-10")}>
        <p className="text-caption font-medium text-muted">{lift.shortName}</p>
        <p className="text-heading tabular-nums">
          {lift.currentE1rm == null ? "—" : `${Math.round(lift.currentE1rm)}`}
          {lift.currentE1rm != null && <span className="ml-1 text-caption font-normal text-muted">e1RM</span>}
        </p>
        {delta && (
          <p className={cx("text-caption tabular-nums", lift.recentRecord ? "text-record" : "text-muted")}>
            {delta}
          </p>
        )}
        <Sparkline values={lift.e1rmSeries.slice(-12)} />
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
    <div className="grid grid-cols-2 gap-3">
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
