import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import { LiftTrend, liftStates } from "../../analytics/month/lift-detail";
import type { MonthlyReport } from "@/lib/monthly-progress";

export function MonthlyHistory({ report, exerciseId, equipment }: { report: MonthlyReport; exerciseId: string; equipment: string | null }) {
  const lift = report.lifts.find(l => l.exerciseId === exerciseId && l.equipmentInstanceId === equipment);
  return <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-6">
    <Link href={`/analytics/month?month=${report.month}`} className="min-h-11 py-2 text-body underline">← Back to {report.month} month review</Link>
    <header><p className="text-caption text-muted">{report.month}{report.inProgress ? " · In progress" : ""}</p><h1 className="text-display">{lift?.name ?? "Exercise history"}</h1></header>
    <p className="text-caption text-muted">{report.windows.current.start}–{report.windows.current.end}<br />Compared with {report.windows.prior.start}–{report.windows.prior.end} · {report.timeZone}</p>
    {lift ? <Card>
      <CardLabel>{liftStates[lift.state]}</CardLabel>
      {equipment && <p className="break-all text-caption text-muted">Equipment {equipment}</p>}
      <p className="mt-2 text-caption text-muted">Best stored e1RM per completed workout. Prior window dashed; selected month solid. Open supporting workouts for dates, values, and logged sets.</p>
      <LiftTrend lift={lift} report={report} />
    </Card> : <p className="text-body text-muted">No working sets for this exact exercise and equipment in these windows.</p>}
  </div>;
}
