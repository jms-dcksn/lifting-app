"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WeightCalendar } from "@/components/weight-calendar";
import { loadWeightMonth, removeWeightEntry, writeWeightEntry } from "@/app/(app)/weight/actions";
import { bodyweightTrend, type BodyweightEntry } from "@/lib/bodyweight";
import { weightChartData, weightGoalDistance, weeklyWeightData, type WeightRange } from "@/lib/weight-trends";

const actions = { load: loadWeightMonth, save: writeWeightEntry, remove: removeWeightEntry };
const ranges: [WeightRange, string][] = [["30", "30 days"], ["90", "90 days"], ["6m", "6 months"], ["all", "All history"]];
const pounds = (value: number | null) => value == null ? "—" : `${value.toFixed(1)} lb`;
const label = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
type Point = ReturnType<typeof weightChartData>[number];

export function WeightTrendCard({ entries, today, goal, window }: { entries: BodyweightEntry[]; today: string; goal: number | null; window?: { start: string; end: string } }) {
  const [range, setRange] = useState<WeightRange>("90");
  const [editDate, setEditDate] = useState<string | null>(null);
  const router = useRouter();
  const anchor = window?.end ?? today;
  const data = useMemo(() => weightChartData(entries, anchor, range, window?.start), [entries, anchor, range, window]);
  const trend = useMemo(() => bodyweightTrend(entries, anchor), [entries, anchor]);
  const weeks = useMemo(() => weeklyWeightData(entries, anchor), [entries, anchor]);
  const distance = weightGoalDistance(trend.current.average, goal);
  const observed = data.filter(point => point.reading != null);
  const hasTrend = data.some(point => point.average != null);
  const maxWeek = Math.max(1, ...weeks.map(week => week.average ?? 0));

  return <Card className="min-w-0">
    <div className="mb-4 flex items-center justify-between gap-2">
      <CardLabel>Bodyweight trend</CardLabel>
      <Button variant="secondary" size="sm" onClick={() => setEditDate(today)}>Log weight</Button>
    </div>
    {window && <p className="mb-3 text-caption text-muted">{window.start}–{window.end} · summary as of {anchor}. Goal uses your current Settings value.</p>}
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      <div><dt className="text-caption text-muted">Latest reading</dt><dd className="text-heading tabular-nums">{pounds(trend.latest?.weight ?? null)}</dd>
        <dd className="text-caption text-muted">{trend.latest ? label(trend.latest.loggedOn) : "No weigh-ins yet"}</dd></div>
      <div><dt className="text-caption text-muted">7-day average</dt><dd className="text-heading tabular-nums">{pounds(trend.current.average)}</dd>
        <dd className="text-caption text-muted">{trend.current.observationCount} readings · {trend.current.start}–{trend.current.end}</dd></div>
      {trend.change != null && <div><dt className="text-caption text-muted">Versus previous 7 days</dt>
        <dd className="text-body font-semibold tabular-nums">{trend.change > 0 ? "+" : ""}{pounds(trend.change)}</dd>
        <dd className="text-caption text-muted">{trend.previous.observationCount} readings · {trend.previous.start}–{trend.previous.end}</dd></div>}
      {goal != null ? <div><dt className="text-caption text-muted">Goal · {pounds(goal)}</dt>
        <dd className="text-body font-semibold">{distance ? distance.position === "at" ? "Trend is at goal" : `${pounds(distance.pounds)} ${distance.position} goal` : "No average in this window to compare"}</dd>
        <dd><Link href="/settings" className="inline-block py-1 text-caption underline">Edit goal</Link></dd></div>
        : <div><dt className="text-caption text-muted">Weight goal</dt><dd><Link href="/settings" className="inline-block py-2 text-body underline">Set goal</Link></dd></div>}
    </dl>
    {trend.latest && trend.current.average == null && <p className="mt-3 text-caption text-muted">No readings in the 7 days ending {anchor}. Your latest weight is outside this trend window.</p>}
    {!window && <div className="my-4 grid grid-cols-4 gap-1" role="group" aria-label="Weight history range">
      {ranges.map(([value, text]) => <Button key={value} variant={range === value ? "primary" : "secondary"} size="sm"
        className="min-h-11 px-1" aria-pressed={range === value} onClick={() => setRange(value)}>{text}</Button>)}
    </div>}
    {hasTrend ? <>
      <p className="mb-2 text-caption text-muted">Dots: weigh-ins · Line: 7-day average · Hollow marks: fewer than 3 readings{goal != null ? " · Dashed: goal" : ""}. Tap a weigh-in to edit.</p>
      <div className="h-64 min-w-0 w-full" role="group" aria-label="Bodyweight in pounds over time. Detailed values and edit controls follow in the data table.">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 0, height: 256 }}>
          <ComposedChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: -12 }} accessibilityLayer>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="timestamp" type="number" domain={[data[0].timestamp, data[data.length - 1].timestamp]} scale="time" tickCount={3}
              tickFormatter={value => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value))}
              tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} />
            <YAxis domain={["auto", "auto"]} width={54} tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} tickFormatter={value => Number(value).toFixed(1)} />
            <Tooltip content={<WeightTooltip />} />
            {goal != null && <ReferenceLine y={goal} ifOverflow="extendDomain" stroke="var(--muted)" strokeDasharray="6 4"
              label={{ value: `Goal ${pounds(goal)}`, position: "insideTopRight", fill: "var(--muted)", fontSize: 11 }} />}
            <Line dataKey="average" type="linear" stroke="var(--foreground)" strokeWidth={2} connectNulls={false} isAnimationActive={false}
              dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Point }) => payload?.average != null && payload.count < 3
                ? <circle key={payload.date} cx={cx} cy={cy} r={3} fill="var(--background)" stroke="var(--foreground)" />
                : <g key={payload?.date} />} activeDot={{ r: 4 }} />
            <Line dataKey="reading" stroke="none" isAnimationActive={false} activeDot={false}
              dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Point }) => payload?.reading != null
                ? <g key={payload.date} onClick={() => setEditDate(payload.date)} className="cursor-pointer">
                  <circle cx={cx} cy={cy} r={12} fill="transparent" />
                  <circle cx={cx} cy={cy} r={4} fill="var(--muted)" stroke="var(--background)" />
                </g> : <g key={payload?.date} />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer py-3 text-body">Chart data and edit readings ({observed.length} weigh-ins)</summary>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-caption tabular-nums">
            <caption className="pb-2 text-left text-muted">All values in lb. Each average covers the date shown and 6 preceding days. Unlogged days have no measured weight; empty windows are gaps.</caption>
            <thead><tr><th className="p-2">Date / window</th><th className="p-2">Reading</th><th className="p-2">Average (count)</th></tr></thead>
            <tbody>{[...data].reverse().map(point => <tr key={point.date} className="border-t border-border">
              <td className="p-2">{point.date}<span className="block text-muted">from {point.start}</span></td>
              <td className="p-1">{point.reading == null ? "—" : <Button size="sm" variant="ghost" aria-label={`Edit ${pounds(point.reading)} on ${label(point.date)}`} onClick={() => setEditDate(point.date)}>{point.reading.toFixed(1)}</Button>}</td>
              <td className="p-2">{point.average?.toFixed(1) ?? "—"} ({point.count})</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </> : <p className="py-4 text-body text-muted">{entries.length ? "No readings in this range. Choose a longer range or log a weight." : "Log your first weight to start your trend. A few readings each week help reveal the direction."}</p>}
    {!window && weeks.some(week => week.average != null) && <details className="mt-2 border-t border-border pt-2">
      <summary className="cursor-pointer py-3 text-body">Weekly averages · last 12 weeks</summary>
      <p className="mb-3 text-caption text-muted">Monday–Sunday calendar weeks. The current week is partial. Missing weeks have no bar.</p>
      <ul className="flex flex-col gap-3">{weeks.map(week => <li key={week.start}>
        <div className="flex flex-wrap justify-between gap-x-2 text-caption"><span>{week.start}–{week.end}{week.partial ? " · partial" : ""}</span>
          <span className="tabular-nums">{pounds(week.average)} · {week.observationCount} readings</span></div>
        {week.average != null && <div className="mt-1 h-2 bg-border" aria-hidden="true" title={`${week.start}–${week.end}: ${pounds(week.average)}, ${week.observationCount} readings`}>
          <div className="h-2 bg-muted" style={{ width: `${week.average / maxWeek * 100}%` }} /></div>}
      </li>)}</ul>
    </details>}
    {editDate && <WeightCalendar today={today} initialDate={editDate} actions={actions} onClose={() => setEditDate(null)} onChange={() => router.refresh()} />}
  </Card>;
}

function WeightTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: Point }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div className="max-w-60 rounded-control border border-border bg-background p-3 text-caption shadow-sm">
    <p className="font-semibold">{label(point.date)}</p>
    <p>Reading: {pounds(point.reading)}</p>
    <p>7-day average: {pounds(point.average)}</p>
    <p className="text-muted">{point.start}–{point.date} · {point.count} readings</p>
  </div>;
}
