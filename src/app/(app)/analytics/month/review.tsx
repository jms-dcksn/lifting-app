import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shiftMonth } from "@/lib/weight-calendar";
import { dateKey } from "@/lib/bodyweight";
import type { MonthlyReport } from "@/lib/monthly-progress";

const amount = (n: number | null) => n == null ? "—" : `${n.toFixed(1)} lb`;
const label = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const states = { improving: "Improving", stable: "Stable", declining: "Lower monthly best", new: "No prior comparison", not_trained: "Not trained", unavailable: "No stored estimate" };

export function MonthlyReview({ report }: { report: MonthlyReport }) {
  const currentMonth = dateKey(new Date(report.generatedAt), report.timeZone).slice(0, 7);
  const metrics = [
    ["Workouts", report.current.workouts, report.prior.workouts],
    ["Rep PRs", report.current.repPrs, report.prior.repPrs],
    ["e1RM PRs", report.current.e1rmPrs, report.prior.e1rmPrs],
  ] as const;
  return <>
    <header>
      <p className="text-caption text-muted">Month review</p>
      <h1 className="text-display">{label(report.month)}</h1>
      {report.inProgress && <p className="mt-1 text-caption font-medium">In progress · month to date</p>}
    </header>
    <nav aria-label="Month navigation" className="flex flex-wrap items-center justify-between gap-2">
      {report.month > "0002-01" && <Link className={buttonClasses("secondary", "sm")} href={`?month=${shiftMonth(report.month, -1)}`}>← Previous month</Link>}
      {report.month < currentMonth && <Link className={buttonClasses("secondary", "sm")} href={`?month=${shiftMonth(report.month, 1)}`}>Next month →</Link>}
    </nav>
    <details className="text-body">
      <summary className="min-h-11 cursor-pointer py-2 text-muted">Choose a month</summary>
      <form className="mt-2 flex flex-wrap items-end gap-2" action="/analytics/month">
        <label className="min-w-0 flex-1 text-caption">Month<Input type="month" name="month" min="0002-01" max={currentMonth} defaultValue={report.month} required /></label>
        <Button type="submit" variant="secondary">View</Button>
      </form>
    </details>
    <p className="text-caption text-muted">
      {report.windows.current.start} – {report.windows.current.end}<br />
      Compared with {report.windows.prior.start} – {report.windows.prior.end} · {report.timeZone}
    </p>
    <div className="grid grid-cols-3 gap-2">
      {metrics.map(([name, value, previous]) => <Card key={name} className="min-w-0 p-3">
        <CardLabel>{name}</CardLabel><p className="mt-2 text-heading tabular-nums">{value}</p>
        <p className="mt-1 text-caption text-muted">{previous} prior</p>
      </Card>)}
    </div>
    <p className="text-caption text-muted">Rep PRs count improved reps at the same effective load. e1RM PRs count improved estimated strength. First marks and ties do not count; one workout can earn both.</p>
    {report.current.workouts === 0 && <Card>
      <CardLabel>No completed workouts in this window</CardLabel>
      <p className="mt-2 text-body text-muted">Choose another month to review earlier training. Weight logging and trends are still available in Progress.</p>
      <Link href="/analytics" className="mt-3 inline-block min-h-11 py-2 underline">View weight trends</Link>
    </Card>}
    <Card>
      <CardLabel>Monthly best estimated 1RM</CardLabel>
      <p className="mt-2 text-body">{report.lifts.filter(l => l.state === "improving").length} lifts improving</p>
      <p className="mt-1 text-caption text-muted">Each exercise and equipment instance is compared separately. A lower or flat monthly best alone does not establish a stall.</p>
      {report.lifts.length === 0 ? <p className="mt-3 text-body text-muted">No comparable working sets in these windows.</p> : <ul className="mt-4 divide-y divide-border">
        {report.lifts.map(lift => <li key={lift.key} className="py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{lift.name}</span>
            <span className={`text-caption ${lift.state === "improving" ? "text-overload-up" : "text-muted"}`}>{states[lift.state]}{lift.percent != null ? ` · ${lift.percent > 0 ? "+" : ""}${lift.percent}%` : ""}</span>
          </div>
          {lift.equipmentInstanceId && <p className="break-all text-caption text-muted">Equipment {lift.equipmentInstanceId}</p>}
          <p className="mt-1 text-body tabular-nums">{amount(lift.priorBest)} → {amount(lift.currentBest)}</p>
          <p className="text-caption text-muted">{lift.currentExposures} current / {lift.priorExposures} prior exposures</p>
          <details className="mt-1">
            <summary className="min-h-11 cursor-pointer py-2 text-caption text-muted">Supporting workouts</summary>
            <ul className="space-y-1 text-caption">
              {[...lift.priorPoints, ...lift.currentPoints].map(point => <li key={point.sessionId}><Link className="flex min-h-11 items-center justify-between gap-2 underline" href={`/session/${point.sessionId}`}>{point.date}<span>{amount(point.e1rm)} e1RM</span></Link></li>)}
            </ul>
          </details>
        </li>)}
      </ul>}
    </Card>
    <Card>
      <CardLabel>Achievements</CardLabel>
      <p className="mt-1 text-caption text-muted">{report.current.exercisesWithRecords} exercises · {report.current.workoutsWithRecords} workouts with records</p>
      {report.achievements.length === 0 ? <p className="mt-3 text-body text-muted">No improvement records in this window. New lifts establish a baseline.</p> : <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-2 text-body">View records by workout</summary>
        <ul className="space-y-4">{report.achievements.map(a => <li key={a.sessionId}>
          <Link href={`/session/${a.sessionId}`} className="inline-block min-h-11 py-2 font-medium underline">{a.date} · Workout recap</Link>
          <ul className="space-y-2 text-caption">{a.records.map(r => <li key={r.key}>
            <p className="font-medium">{r.name}</p>
            {r.equipmentInstanceId && <p className="break-all text-muted">Equipment {r.equipmentInstanceId}</p>}
            {r.repRecords.map(rep => <p key={rep.load}>{rep.weight} lb {r.isBodyweight ? "added/assist" : ""} × {rep.reps} reps{rep.improvement != null ? ` · +${rep.improvement} reps` : " · improved within workout"}</p>)}
            {r.e1rmRecord && <p>{amount(r.e1rmRecord.value)} e1RM{r.e1rmRecord.improvement != null ? ` · +${r.e1rmRecord.improvement.toFixed(1)} lb` : " · improved within workout"}</p>}
          </li>)}</ul>
        </li>)}</ul>
      </details>}
    </Card>
    {(report.quality.excludedWorkingSets > 0 || report.quality.missingStoredEstimates > 0) && <p className="text-caption text-muted">Data coverage: {report.quality.excludedWorkingSets} ineligible working sets excluded; {report.quality.missingStoredEstimates} eligible sets without stored estimates omitted from strength comparisons.</p>}
  </>;
}
