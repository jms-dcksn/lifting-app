import { LiftRow } from "./lift-detail";
import { PeriodPerformanceCard } from "./period-performance";
import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-styles";
import { Button } from "@/components/ui/button";
import { InfoButton } from "@/components/ui/info-button";
import { Input } from "@/components/ui/input";
import { shiftMonth } from "@/lib/weight-calendar";
import { dateKey, type BodyweightEntry } from "@/lib/bodyweight";
import type { MonthlyReport } from "@/lib/monthly-progress";
import type { PeriodObservation } from "@/lib/period-calendar";
import { buildPeriodPerformanceOverlay } from "@/lib/period-performance";
import { sessionRecapPath } from "@/lib/session-paths";

const amount = (n: number | null) => n == null ? "—" : `${n.toFixed(1)} lb`;
const label = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });


export function MonthlyReview({
  report,
  eligible,
  periodObservations,
  weightEntries,
}: {
  report: MonthlyReport;
  eligible?: boolean;
  periodObservations?: PeriodObservation[];
  weightEntries?: BodyweightEntry[];
}) {
  const improving = report.lifts.filter(l => l.state === "improving");
  const repOnly = report.lifts.filter(l => l.state !== "improving" && l.repGains.length > 0);
  const recordGroups = new Map<string, { name: string; equipment: string | null; records: { sessionId: string; date: string; record: MonthlyReport["achievements"][number]["records"][number] }[] }>();
  for (const a of report.achievements) for (const record of a.records) {
    const group = recordGroups.get(record.key) ?? { name: record.name, equipment: record.equipmentInstanceId, records: [] };
    group.records.push({ sessionId: a.sessionId, date: a.date, record });
    recordGroups.set(record.key, group);
  }
  const stalls = report.stalls.filter(s => s.state === "plateau");
  const overlay = eligible
    ? buildPeriodPerformanceOverlay({
        window: report.windows.current,
        periodDates: (periodObservations ?? []).map((observation) => observation.observedOn),
        entries: weightEntries ?? [],
        workouts: report.currentWorkouts,
        achievements: report.achievements,
      })
    : null;
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
    <div className="flex items-start gap-1 text-caption text-muted">
      <p>
        {report.windows.current.start} – {report.windows.current.end}<br />
        Compared with {report.windows.prior.start} – {report.windows.prior.end}
      </p>
      <InfoButton title="Comparison windows" label="About comparison windows">
        Windows use {report.timeZone}.
      </InfoButton>
    </div>
    {overlay && <PeriodPerformanceCard overlay={overlay} />}
    <div className="grid grid-cols-2 gap-2">
      {metrics.map(([name, value, previous]) => <Card key={name} className="min-w-0 p-3">
        <CardLabel>{name}</CardLabel><p className="mt-2 text-heading tabular-nums">{value}</p>
        <p className="mt-1 text-caption text-muted">{previous} prior</p>
      </Card>)}
      <Card className="min-w-0 p-3"><CardLabel>Lifts improving</CardLabel><p className="mt-2 text-heading tabular-nums">{improving.length}</p><p className="mt-1 text-caption text-muted">Higher monthly best</p></Card>
    </div>
    <div className="flex items-center gap-1">
      <InfoButton title="How PRs are counted" label="How PRs are counted">
        Rep PRs count improved reps at the same effective load. e1RM PRs count improved estimated strength. First marks and ties do not count; one workout can earn both.
      </InfoButton>
    </div>
    {report.current.workouts === 0 && <Card>
      <CardLabel>No completed workouts in this window</CardLabel>
      <p className="mt-2 text-body text-muted">No workouts this month.</p>
      <Link href="#monthly-weight" className="mt-3 inline-block min-h-11 py-2 underline">View weight trends</Link>
    </Card>}
    {(improving.length > 0 || repOnly.length > 0) && <Card>
      <div className="flex items-center gap-1">
        <CardLabel>Where you improved</CardLabel>
        <InfoButton title="Where you improved" label="Chart legend for improvements">
          Ranked by monthly best e1RM change. Dashed trends: prior window; solid: selected month. Each machine is compared separately.
        </InfoButton>
      </div>
      <ul className="divide-y divide-border">{improving.slice(0, 5).map(lift => <LiftRow key={lift.key} lift={lift} report={report} eligible={eligible} periodObservations={periodObservations} />)}</ul>
      {repOnly.length > 0 && <details><summary className="min-h-11 cursor-pointer py-2 text-body">Rep gains without a higher monthly best ({repOnly.length})</summary><ul className="divide-y divide-border">{repOnly.map(lift => <LiftRow key={lift.key} lift={lift} report={report} eligible={eligible} periodObservations={periodObservations} />)}</ul></details>}
    </Card>}
    {stalls.length > 0 && <Card>
      <div className="flex items-center gap-1">
        <CardLabel>Worth reviewing</CardLabel>
        <InfoButton title="Worth reviewing" label="About worth reviewing">
          Same equipment and range, no e1RM or rep gain. Review only — program unchanged.
        </InfoButton>
      </div>
      <ul className="mt-3 divide-y divide-border">{stalls.map(stall => <li key={stall.slotId} className="py-3">
        <p className="font-medium">{stall.name}</p>
        {stall.equipmentInstanceId && <p className="break-all text-caption text-muted">Equipment {stall.equipmentInstanceId}</p>}
        <p className="mt-1 text-body">{stall.stalledExposures} stalled exposures across {stall.stalledSinceDays} days</p>
        <p className="text-caption text-muted">{stall.repMin}–{stall.repMax} reps{stall.phaseName ? ` · ${stall.phaseName}` : ""} · Last improvement/baseline: {dateKey(new Date(stall.lastImprovementAt!), report.timeZone)}</p>
        <details className="mt-1">
          <summary className="min-h-11 cursor-pointer py-2 text-caption text-muted">Review supporting workouts</summary>
          <ul>{stall.points.map(point => <li key={point.sessionId}><Link className="flex min-h-11 items-center justify-between gap-2 text-caption underline" href={`/session/${point.sessionId}`}>
            <span>{dateKey(new Date(point.sessionAt), report.timeZone)}</span><span>{amount(point.bestE1rm)} e1RM{point.repGain ? " · rep gain" : ""}</span>
          </Link></li>)}</ul>
        </details>
        {report.inProgress && <Link href={`/settings?coachExercise=${encodeURIComponent(stall.exerciseId)}#coach-next-steps`} className="inline-block min-h-11 py-2 text-caption underline">Review current Coach next steps for this lift</Link>}
      </li>)}</ul>

    </Card>}
    <Card>
      <CardLabel>Achievements</CardLabel>
      <p className="mt-1 text-caption text-muted">{report.current.repPrs} rep PRs · {report.current.e1rmPrs} e1RM PRs · {report.current.workoutsWithRecords} workouts with records</p>
      {recordGroups.size === 0 ? <p className="mt-3 text-body text-muted">No records this month.</p> : <div className="mt-3 divide-y divide-border">{[...recordGroups].map(([key, group]) => <details key={key}>
        <summary className="min-h-11 cursor-pointer break-words py-3 text-body">{group.name} · {group.records.length} record workouts{group.equipment ? ` · Equipment ${group.equipment}` : ""}</summary>
        <ul className="space-y-3 pb-3">{group.records.map(({ sessionId, date, record: r }) => <li key={sessionId} className="text-caption">
          <Link href={sessionRecapPath(sessionId)} className="inline-block min-h-11 py-2 underline">{date} · Workout recap</Link>
          {r.repRecords.map(rep => <p key={rep.load}>{rep.weight} lb {r.isBodyweight ? "added/assist" : ""} × {rep.reps} reps{rep.improvement != null ? ` · +${rep.improvement} reps` : " · improved within workout"}</p>)}
          {r.e1rmRecord && <p>{amount(r.e1rmRecord.value)} e1RM{r.e1rmRecord.improvement != null ? ` · +${r.e1rmRecord.improvement.toFixed(1)} lb` : " · improved within workout"}</p>}
        </li>)}</ul>
      </details>)}</div>}
    </Card>
    {report.lifts.length > 0 && <Card>
      <details>
        <summary className="min-h-11 cursor-pointer py-2 text-body font-medium">All lifts ({report.lifts.length})</summary>
        <div className="mt-2 flex items-center gap-1">
          <InfoButton title="All lifts" label="How all lifts are classified">
            Flat or lower monthly bests alone do not establish a stall. New and untrained lifts are kept separate from gains and declines. Trends: prior dashed, current solid.
          </InfoButton>
        </div>
        <ul className="mt-2 divide-y divide-border">{report.lifts.map(lift => <LiftRow key={lift.key} lift={lift} report={report} />)}</ul>
      </details>
    </Card>}
    {(report.quality.excludedWorkingSets > 0 || report.quality.missingStoredEstimates > 0) && (
      <div className="flex items-center gap-1">
        <InfoButton title="Data coverage" label="About data coverage">
          {report.quality.excludedWorkingSets} ineligible working sets excluded; {report.quality.missingStoredEstimates} eligible sets without stored estimates omitted from strength comparisons.
        </InfoButton>
      </div>
    )}
  </>;
}
