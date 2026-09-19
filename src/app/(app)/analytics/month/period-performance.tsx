import { Card, CardLabel } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/info-button";
import type { PeriodPerformanceGroup, PeriodPerformanceOverlay, PeriodPerformanceWeek } from "@/lib/period-performance";

const pounds = (value: number | null) => (value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)} lb`);
const prs = (count: number) => `${count} ${count === 1 ? "PR" : "PRs"}`;
const weekLabel = (week: PeriodPerformanceWeek) => {
  const start = new Date(`${week.start}T00:00:00Z`);
  const end = new Date(`${week.end}T00:00:00Z`);
  const monthDay = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${monthDay(start)}-${end.getUTCDate()}`;
  }
  return `${monthDay(start)}-${monthDay(end)}`;
};

function GroupRow({ label, group }: { label: string; group: PeriodPerformanceGroup }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="text-caption text-muted">{label}</p>
      <p className="text-body tabular-nums">{pounds(group.weightDelta)} · {prs(group.prs)}</p>
    </div>
  );
}

export function PeriodPerformanceCard({ overlay }: { overlay: PeriodPerformanceOverlay }) {
  return (
    <Card aria-label="Period and performance">
      <div className="flex items-center gap-1">
        <CardLabel>Period × performance</CardLabel>
        <InfoButton title="Period × performance" label="About period and performance">
          Monday-Sunday weeks in this month. Purple marks observed period days. Weight compares
          the week average with last week. PRs are records from finished workouts. Observed days
          only. Not sent to Coach.
        </InfoButton>
      </div>
      {overlay.period.weeks > 0 ? (
        <div className="mt-3 space-y-1">
          <GroupRow label="Period weeks" group={overlay.period} />
          {overlay.other.weeks > 0 && <GroupRow label="Other weeks" group={overlay.other} />}
        </div>
      ) : (
        <p className="mt-3 text-body text-muted">No period days this month.</p>
      )}
      <ol className="mt-3 divide-y divide-border">
        {overlay.weeks.map((week) => (
          <li key={week.start} className="py-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-body font-medium">{weekLabel(week)}</p>
              {week.periodDays > 0 && (
                <p className="text-caption font-medium" style={{ color: "hsl(280 65% 60%)" }}>Period</p>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <ol
                className="flex gap-1"
                aria-hidden
              >
                {week.days.map((day) => (
                  <li
                    key={day.date}
                    className={`relative flex size-4 items-center justify-center rounded-sm ${
                      !day.inWindow ? "bg-transparent" : day.period ? "" : "bg-border"
                    }`}
                    style={day.inWindow && day.period ? { background: "hsl(280 65% 60% / 0.45)" } : undefined}
                  >
                    {day.workout && <span className="size-1 rounded-full bg-foreground" />}
                  </li>
                ))}
              </ol>
              <p className="text-caption tabular-nums text-muted">
                {pounds(week.weightDelta)} · {prs(week.prs)}
              </p>
            </div>
            <p className="sr-only">
              {weekLabel(week)}
              {week.periodDays > 0 ? `, ${week.periodDays} period ${week.periodDays === 1 ? "day" : "days"}` : ""}
              , weight {pounds(week.weightDelta)}, {prs(week.prs)}, {week.workouts} {week.workouts === 1 ? "workout" : "workouts"}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
