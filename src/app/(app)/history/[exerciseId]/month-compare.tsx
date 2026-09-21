"use client";

import { useMemo, useState } from "react";
import { Card, CardLabel } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/info-button";
import { Input } from "@/components/ui/input";
import { dateKey } from "@/lib/bodyweight";
import {
  formatReviewVolume,
  reviewCompareDefaults,
  reviewEmptyMonthSide,
  sessionsInMonths,
  type ReviewMonthSide,
} from "@/lib/exercise-review-months";
import { formatReviewE1rm } from "@/lib/exercise-review-sessions";
import { ProgramCaption } from "./program-caption";

export function MonthCompare({
  reviewMonth,
  nowIso,
  sides,
  sessions,
}: {
  reviewMonth: string | null;
  nowIso: string;
  sides: Record<string, ReviewMonthSide>;
  sessions: { dateKey: string; programName: string | null }[];
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const defaults = reviewCompareDefaults(reviewMonth, now);
  const currentMonth = dateKey(now).slice(0, 7);
  const [thisMonth, setThisMonth] = useState(defaults.thisMonth);
  const [otherMonth, setOtherMonth] = useState(defaults.otherMonth);
  const thisSide = sides[thisMonth] ?? reviewEmptyMonthSide(thisMonth);
  const otherSide = sides[otherMonth] ?? reviewEmptyMonthSide(otherMonth);

  return (
    <Card>
      <div className="mb-2 flex items-center gap-1">
        <CardLabel>Month to month</CardLabel>
        <InfoButton title="Month to month">
          Pick any two months. PRs match the recap rules. Volume skips sets that have no usable
          load. An empty month is empty, not a drop.
        </InfoButton>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <MonthInput
          label="This month"
          value={thisMonth}
          max={currentMonth}
          onChange={setThisMonth}
        />
        <MonthInput
          label="Other month"
          value={otherMonth}
          max={currentMonth}
          onChange={setOtherMonth}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-2 text-body">
        <span />
        <span className="text-caption text-muted">{thisSide.label}</span>
        <span className="text-caption text-muted">{otherSide.label}</span>
        <MetricRow label="PRs" a={prText(thisSide)} b={prText(otherSide)} />
        <MetricRow label="e1RM" a={e1rmText(thisSide)} b={e1rmText(otherSide)} />
        <MetricRow label="Volume" a={volumeText(thisSide)} b={volumeText(otherSide)} />
        <MetricRow label="Exposures" a={countText(thisSide.exposures)} b={countText(otherSide.exposures)} />
      </div>
      <ProgramCaption sessions={sessionsInMonths(sessions, [thisMonth, otherMonth])} />
    </Card>
  );
}

function MonthInput({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: string;
  max: string;
  onChange: (month: string) => void;
}) {
  return (
    <label className="min-w-0 text-caption text-muted">
      {label}
      <Input
        type="month"
        min="0002-01"
        max={max}
        value={value}
        aria-label={label}
        onChange={(event) => {
          const next = event.target.value;
          if (/^\d{4}-\d{2}$/.test(next) && next >= "0002-01" && next <= max) onChange(next);
        }}
      />
    </label>
  );
}

function MetricRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <>
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{a}</span>
      <span className="tabular-nums">{b}</span>
    </>
  );
}

function prText(side: ReviewMonthSide) {
  if (!side.trained || side.repPrs == null || side.e1rmPrs == null || side.topWeightPrs == null) {
    return "none";
  }
  return `${side.repPrs} rep · ${side.e1rmPrs} e1RM · ${side.topWeightPrs} top`;
}

function e1rmText(side: ReviewMonthSide) {
  if (!side.trained || side.bestE1rm == null) return "none";
  return formatReviewE1rm(side.bestE1rm);
}

function volumeText(side: ReviewMonthSide) {
  if (!side.trained || side.volume == null) return "none";
  return formatReviewVolume(side.volume);
}

function countText(value: number | null) {
  return value == null ? "none" : String(value);
}
