import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardLabel } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/info-button";
import { sessionPath } from "@/lib/session-paths";
import {
  formatReviewDelta,
  formatReviewE1rm,
  reviewDateLabel,
  reviewRecentWindow,
  reviewToday,
  type ReviewSession,
} from "@/lib/exercise-review-sessions";
import { PinButton } from "../../pins/pin-button";
import { ReviewChart } from "./review-chart";

type PinProps = { exerciseId: string; pinned: boolean; name: string };

export type ExerciseReviewProps = {
  reviewMonth: string | null;
} & (
  | { status: "missing" }
  | { status: "empty"; name: string; pin?: PinProps }
  | {
      status: "ready";
      name: string;
      isBodyweight: boolean;
      sessions: ReviewSession[];
      pin?: PinProps;
      now?: Date;
      periodEligible?: boolean;
      periodDates?: string[];
    }
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
        <h1 className="text-display">{name}</h1>
        {pin && <PinButton exerciseId={pin.exerciseId} pinned={pin.pinned} name={pin.name} />}
      </header>
      {props.status === "empty" ? (
        <p className="text-body text-muted">No working sets logged yet.</p>
      ) : (
        <ReadyBody
          sessions={props.sessions}
          isBodyweight={props.isBodyweight}
          now={props.now}
          periodEligible={props.periodEligible}
          periodDates={props.periodDates}
        />
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

function ReadyBody({
  sessions,
  isBodyweight,
  now,
  periodEligible,
  periodDates,
}: {
  sessions: ReviewSession[];
  isBodyweight: boolean;
  now?: Date;
  periodEligible?: boolean;
  periodDates?: string[];
}) {
  const today = reviewToday(sessions);
  const previous = sessions.length >= 2 ? sessions.at(-2) : null;
  const recent = sessions.length >= 2 ? reviewRecentWindow(sessions, now) : null;

  return (
    <>
      {today && (
        <TodayCard
          session={today}
          previous={previous}
          isBodyweight={isBodyweight}
        />
      )}
      {recent && <RecentCard recent={recent} />}
      <ReviewChart
        sessions={sessions}
        periodEligible={periodEligible}
        periodDates={periodDates}
      />
      <section className="flex flex-col gap-3">
        {[...sessions].reverse().map((session) => (
          <Card key={session.sessionId}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-body font-semibold">
                <Link href={sessionPath(session.sessionId)} className="underline">
                  {reviewDateLabel(session.dateKey)}
                </Link>
              </h3>
              {session.bestE1rm != null && (
                <span className="text-caption text-muted tabular-nums">
                  best {formatReviewE1rm(session.bestE1rm)}
                </span>
              )}
            </div>
            <SetList sets={session.sets} isBodyweight={isBodyweight} />
          </Card>
        ))}
      </section>
    </>
  );
}

function TodayCard({
  session,
  previous,
  isBodyweight,
}: {
  session: ReviewSession;
  previous: ReviewSession | null | undefined;
  isBodyweight: boolean;
}) {
  const delta =
    session.bestE1rm != null && previous?.bestE1rm != null
      ? session.bestE1rm - previous.bestE1rm
      : null;

  return (
    <Card>
      <div className="mb-2 flex items-center gap-1">
        <CardLabel>Today</CardLabel>
        <InfoButton title="Today">
          This is the last finished workout for this exact exercise and equipment. Estimated 1RM
          uses the stored value from that day, not today&apos;s bodyweight.
        </InfoButton>
      </div>
      <p className="text-body">{reviewDateLabel(session.dateKey)}</p>
      {session.bestE1rm != null && (
        <p className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className="text-heading tabular-nums">{formatReviewE1rm(session.bestE1rm)}</span>
          {delta != null && <DeltaText delta={delta} />}
        </p>
      )}
      <SetList sets={session.sets} isBodyweight={isBodyweight} />
    </Card>
  );
}

function RecentCard({ recent }: { recent: NonNullable<ReturnType<typeof reviewRecentWindow>> }) {
  return (
    <Card>
      <div className="mb-2 flex items-center gap-1">
        <CardLabel>Past three weeks</CardLabel>
        <InfoButton title="Past three weeks">
          Workouts in the last 21 days in Chicago time. Change is first to last session in that
          window. A gap is a last-trained date, not a decline.
        </InfoButton>
      </div>
      {recent.kind === "gap" ? (
        <p className="text-body">Last trained {reviewDateLabel(recent.lastTrained)}</p>
      ) : recent.sessions.length === 1 ? (
        <div className="flex flex-col gap-1">
          <p className="text-body">{reviewDateLabel(recent.sessions[0].dateKey)}</p>
          {recent.bestE1rm != null && (
            <p className="text-heading tabular-nums">{formatReviewE1rm(recent.bestE1rm)}</p>
          )}
        </div>
      ) : (
        <dl className="flex flex-col gap-1 text-body">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Workouts</dt>
            <dd className="tabular-nums">{recent.sessions.length}</dd>
          </div>
          {recent.bestE1rm != null && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Best e1RM</dt>
              <dd className="tabular-nums">{formatReviewE1rm(recent.bestE1rm)}</dd>
            </div>
          )}
          {recent.delta != null && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Change</dt>
              <dd>
                <DeltaText delta={recent.delta} />
              </dd>
            </div>
          )}
        </dl>
      )}
    </Card>
  );
}

function SetList({
  sets,
  isBodyweight,
}: {
  sets: ReviewSession["sets"];
  isBodyweight: boolean;
}) {
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {sets.map((set, i) => (
        <li key={set.id} className="text-body tabular-nums">
          <span className="text-faint">{i + 1}.</span> {set.weight} lb
          {isBodyweight ? " added" : ""} × {set.reps}
          {set.rir != null ? ` @ ${set.rir} RIR` : ""}
        </li>
      ))}
    </ul>
  );
}

function DeltaText({ delta }: { delta: number }) {
  const rounded = Number(delta.toFixed(1));
  const cls =
    rounded > 0 ? "text-overload-up" : rounded < 0 ? "text-overload-down" : "text-muted";
  return (
    <span className={`font-semibold tabular-nums ${cls}`}>
      {formatReviewDelta(delta)} lb
    </span>
  );
}
