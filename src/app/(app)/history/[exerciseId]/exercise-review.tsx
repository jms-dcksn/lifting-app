import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardLabel } from "@/components/ui/card";
import { PinButton } from "../../pins/pin-button";
import { E1rmChart, type ChartPoint } from "./e1rm-chart";

export interface SessionGroup {
  sessionId: string;
  performedAt: string;
  bestE1rm: number | null;
  sets: { id: string; weight: number; reps: number; rir: number | null }[];
}

type PinProps = { exerciseId: string; pinned: boolean; name: string };

export type ExerciseReviewProps = {
  reviewMonth: string | null;
} & (
  | { status: "missing" }
  | { status: "empty"; name: string; pin?: PinProps }
  | { status: "ready"; name: string; isBodyweight: boolean; sessions: SessionGroup[]; pin?: PinProps }
);

export function ExerciseReview(props: ExerciseReviewProps) {
  if (props.status === "missing") {
    return (
      <ReviewShell reviewMonth={props.reviewMonth}>
        <header>
          <h1 className="text-display">Exercise not found</h1>
        </header>
        <p className="text-body text-muted">This exercise is not in your catalog.</p>
      </ReviewShell>
    );
  }

  const { name, pin, reviewMonth } = props;
  return (
    <ReviewShell reviewMonth={reviewMonth}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-display">{name}</h1>
          {props.status === "ready" && (
            <p className="text-body text-muted">{sessionCaption(props.sessions)}</p>
          )}
        </div>
        {pin && <PinButton exerciseId={pin.exerciseId} pinned={pin.pinned} name={pin.name} />}
      </header>
      {props.status === "empty" ? (
        <p className="text-body text-muted">No working sets logged yet.</p>
      ) : (
        <ReadyBody sessions={props.sessions} isBodyweight={props.isBodyweight} />
      )}
    </ReviewShell>
  );
}

function ReviewShell({
  reviewMonth,
  children,
}: {
  reviewMonth: string | null;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-6">
      {reviewMonth && (
        <Link href={`/analytics/month?month=${reviewMonth}`} className="min-h-11 py-2 text-body underline">
          ← Back to {reviewMonth} month review
        </Link>
      )}
      {children}
    </div>
  );
}

function ReadyBody({ sessions, isBodyweight }: { sessions: SessionGroup[]; isBodyweight: boolean }) {
  const chartData: ChartPoint[] = sessions
    .filter((s) => s.bestE1rm != null)
    .map((s) => ({ date: shortDate(s.performedAt), e1rm: s.bestE1rm as number }));
  const withE1rm = sessions.filter((s) => s.bestE1rm != null);
  const latest = withE1rm.at(-1);
  const previous = withE1rm.at(-2);
  const delta =
    latest?.bestE1rm != null && previous?.bestE1rm != null
      ? latest.bestE1rm - previous.bestE1rm
      : null;

  return (
    <>
      {delta != null && <OverloadBadge delta={delta} />}
      {chartData.length >= 2 ? (
        <Card>
          <CardLabel className="mb-2">e1RM over time</CardLabel>
          <E1rmChart data={chartData} />
        </Card>
      ) : (
        <Card>
          <CardLabel className="mb-2">e1RM over time</CardLabel>
          <p className="text-body text-muted">
            One session so far — log another to see your trend line.
          </p>
        </Card>
      )}
      <section className="flex flex-col gap-3">
        {[...sessions].reverse().map((s) => (
          <Card key={s.sessionId}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-body font-semibold">{longDate(s.performedAt)}</h3>
              {s.bestE1rm != null && (
                <span className="text-caption text-muted tabular-nums">
                  best e1RM {Math.round(s.bestE1rm)} lb
                </span>
              )}
            </div>
            <ul className="mt-2 flex flex-col gap-1">
              {s.sets.map((set, i) => (
                <li key={set.id} className="text-body tabular-nums">
                  <span className="text-faint">{i + 1}.</span> {set.weight} lb
                  {isBodyweight ? " added" : ""} × {set.reps}
                  {set.rir != null ? ` @ ${set.rir} RIR` : ""}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </section>
    </>
  );
}

function sessionCaption(sessions: SessionGroup[]) {
  const best = latestBest(sessions);
  return `${sessions.length} session${sessions.length === 1 ? "" : "s"} logged${
    best != null ? ` · current e1RM ${Math.round(best)} lb` : ""
  }`;
}

function latestBest(sessions: SessionGroup[]) {
  return [...sessions].reverse().find((s) => s.bestE1rm != null)?.bestE1rm ?? null;
}

function OverloadBadge({ delta }: { delta: number }) {
  const rounded = Math.round(delta);
  const cls =
    rounded > 0 ? "text-overload-up" : rounded < 0 ? "text-overload-down" : "text-muted";
  const signed = rounded > 0 ? `+${rounded}` : rounded < 0 ? `${rounded}` : "±0";
  return (
    <p className="flex items-baseline gap-2 text-body">
      <span className={`font-semibold tabular-nums ${cls}`}>{signed} lb</span>
      <span className="text-muted">e1RM vs last session</span>
    </p>
  );
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
