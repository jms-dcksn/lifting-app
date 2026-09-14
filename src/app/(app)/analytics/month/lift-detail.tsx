import Link from "next/link";
import type { MonthlyLift, MonthlyReport } from "@/lib/monthly-progress";

export const amount = (n: number | null) => n == null ? "—" : `${n.toFixed(1)} lb`;
export const liftStates = { improving: "Improving", stable: "Stable", declining: "Lower monthly best", new: "No prior comparison", not_trained: "Not trained", unavailable: "No stored estimate" };
export function liftHref(lift: MonthlyLift, month: string) {
  return `/history/${encodeURIComponent(lift.exerciseId)}?${new URLSearchParams({ month, equipment: lift.equipmentInstanceId ?? "none" })}`;
}

export function LiftTrend({ lift, report }: { lift: MonthlyLift; report: MonthlyReport }) {
  const points = [...lift.priorPoints, ...lift.currentPoints];
  const values = points.map(p => p.e1rm);
  const low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 0;
  const start = Date.parse(report.windows.prior.start), end = Date.parse(report.windows.current.end);
  const x = (date: string) => 6 + (Date.parse(date) - start) / Math.max(1, end - start) * 288;
  const y = (value: number) => high === low ? 28 : 50 - (value - low) / (high - low) * 44;
  return <>
    {points.length > 0 && <svg viewBox="0 0 300 56" className="mt-2 h-14 w-full" role="img" aria-label={`${lift.name}: session best estimated strength. Prior period dashed, selected month solid. Exact dated values in supporting workouts.`}>
      {[lift.priorPoints, lift.currentPoints].map((series, i) => <g key={i}>
        <polyline fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={i === 0 ? "4 3" : undefined} points={series.map(p => `${x(p.date)},${y(p.e1rm)}`).join(" ")} />
        {series.map(p => <circle key={p.sessionId} cx={x(p.date)} cy={y(p.e1rm)} r="3" fill={i === 0 ? "var(--background)" : "currentColor"} stroke="currentColor"><title>{p.date}: {amount(p.e1rm)}</title></circle>)}
      </g>)}
    </svg>}
    <p className="mt-1 text-body tabular-nums">{amount(lift.priorBest)} → {amount(lift.currentBest)}</p>
    <p className="text-caption text-muted">{lift.currentExposures} current / {lift.priorExposures} prior exposures</p>
    {lift.repGains.map(g => <p key={g.load} className="mt-1 text-caption text-overload-up">{g.priorReps} → {g.currentReps} reps at {g.load} lb effective load</p>)}
    <details className="mt-1">
      <summary className="min-h-11 cursor-pointer py-2 text-caption text-muted">Supporting workouts</summary>
      <ul className="text-caption">{points.map(p => <li key={p.sessionId}><Link className="flex min-h-11 items-center justify-between gap-2 underline" href={`/session/${p.sessionId}`}><span>{p.date} · {p.date >= report.windows.current.start ? "current" : "prior"}</span><span>{amount(p.e1rm)} e1RM</span></Link></li>)}</ul>
      {points.length === 0 && <p className="text-caption text-muted">No stored estimates in these comparison windows.</p>}
    </details>
  </>;
}

export function LiftRow({ lift, report }: { lift: MonthlyLift; report: MonthlyReport }) {
  return <li className="py-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <Link href={liftHref(lift, report.month)} className="min-h-11 py-2 font-medium underline">{lift.name}</Link>
      <span className={`text-caption ${lift.state === "improving" ? "text-overload-up" : "text-muted"}`}>{liftStates[lift.state]}{lift.percent != null ? ` · ${lift.percent > 0 ? "+" : ""}${lift.percent}%` : ""}</span>
    </div>
    {lift.equipmentInstanceId && <p className="break-all text-caption text-muted">Equipment {lift.equipmentInstanceId}</p>}
    <LiftTrend lift={lift} report={report} />
  </li>;
}
