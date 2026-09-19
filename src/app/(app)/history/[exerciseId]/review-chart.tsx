"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/info-button";
import {
  periodDatesInChartRange,
  REVIEW_CHART_SESSIONS,
  reviewChartPoints,
  type ReviewChartRange,
  type ReviewSession,
} from "@/lib/exercise-review-sessions";
import { E1rmChart } from "./e1rm-chart";
import { ProgramCaption } from "./program-caption";

export function ReviewChart({
  sessions,
  periodEligible = false,
  periodDates = [],
}: {
  sessions: ReviewSession[];
  periodEligible?: boolean;
  periodDates?: string[];
}) {
  const [range, setRange] = useState<ReviewChartRange>("last8");
  const windowSessions = range === "last8" ? sessions.slice(-REVIEW_CHART_SESSIONS) : sessions;
  const points = reviewChartPoints(sessions, range);
  const overlayDates =
    range === "all" && periodEligible ? periodDatesInChartRange(points, periodDates) : [];
  const chartLabel =
    overlayDates.length > 0 ? "e1RM over time with period days" : "e1RM over time";

  return (
    <Card>
      <div className="mb-2 flex items-center gap-1">
        <CardLabel>e1RM chart</CardLabel>
        <InfoButton title="e1RM chart">
          Each point is the best stored estimate in a finished workout. Last 8 workouts is the
          default. All history is every finished workout of this exact lift.
        </InfoButton>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-1" role="group" aria-label="Chart range">
        <RangeButton
          pressed={range === "last8"}
          onClick={() => setRange("last8")}
        >
          Last 8 workouts
        </RangeButton>
        <RangeButton
          pressed={range === "all"}
          onClick={() => setRange("all")}
        >
          All history
        </RangeButton>
      </div>
      {points.length >= 2 ? (
        <div data-chart-range={range} aria-label={chartLabel}>
          <E1rmChart data={points} periodDates={overlayDates} />
        </div>
      ) : (
        <p className="text-body text-muted">
          One session so far. Log another to see the trend.
        </p>
      )}
      <ProgramCaption sessions={windowSessions} />
    </Card>
  );
}

function RangeButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <Button
      type="button"
      variant={pressed ? "primary" : "secondary"}
      size="sm"
      className="min-h-11 px-1"
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
