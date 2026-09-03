import type {
  CoachCheckInReport,
  TrendClassification,
} from "@/lib/coach-check-in";
import { cx } from "@/components/ui/cx";

export function CoachReportSummary({ report }: { report: CoachCheckInReport }) {
  const current = report.current;
  const matchedRir =
    current.rirExecution.withinTargetSets
    + current.rirExecution.harderThanTargetSets
    + current.rirExecution.easierThanTargetSets;
  const warnings = Object.values(current.dataQuality).reduce(
    (sum, value) => sum + value,
    0,
  );
  const classified = report.exerciseTrends
    .filter((trend) => trend.classification !== "insufficient_data")
    .slice(0, 4);

  return (
    <div className="mb-4 flex flex-col gap-4 border-y border-border py-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Metric
          label="Sessions"
          value={`${current.adherence.completedSessions}/${current.adherence.plannedSessions || "?"}`}
          detail={`prior ${report.prior.adherence.completedSessions}`}
        />
        <Metric
          label="Working sets"
          value={`${current.setExecution.completedWorkingSets}/${current.setExecution.prescribedWorkingSets || "?"}`}
          detail={
            current.setExecution.completionRate == null
              ? "prescription unavailable"
              : `${Math.round(current.setExecution.completionRate * 100)}% complete`
          }
        />
        <Metric
          label="Avg duration"
          value={
            current.duration.averageMinutes == null
              ? "—"
              : `${Math.round(current.duration.averageMinutes)} min`
          }
          detail={`target ${current.duration.targetMinutes} min`}
        />
        <Metric
          label="RIR in range"
          value={`${current.rirExecution.withinTargetSets}/${matchedRir || "?"}`}
          detail={`${current.rirExecution.missingSets} missing`}
        />
        <Metric
          label="7-day weight"
          value={
            report.bodyweight.currentSevenDayAverage == null
              ? "—"
              : `${report.bodyweight.currentSevenDayAverage.toFixed(1)} lb`
          }
          detail={
            report.bodyweight.change == null
              ? "no prior comparison"
              : `${signed(report.bodyweight.change)} lb vs prior`
          }
        />
        <Metric
          label="Data quality"
          value={warnings === 0 ? "Clear" : `${warnings} flag${warnings === 1 ? "" : "s"}`}
          detail={warnings === 0 ? "no known gaps" : "review export details"}
        />
      </div>

      <div>
        <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted">
          Specialization sets · hard at RIR 0–1
        </p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
          {current.specializationVolume.map((group) => (
            <li key={group.group} className="flex justify-between gap-2 text-caption">
              <span className="text-muted">{group.label}</span>
              <span className="tabular-nums">
                {group.workingSets} · {group.hardSets}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {classified.length > 0 && (
        <div>
          <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted">
            Four-exposure trend
          </p>
          <ul className="flex flex-col gap-1">
            {classified.map((trend) => (
              <li
                key={trend.exerciseId}
                className="flex items-baseline justify-between gap-3 text-caption"
              >
                <span className="truncate">{trend.exerciseName}</span>
                <span className={trendClass(trend.classification)}>
                  {trend.classification} · {trend.changePercent == null ? "—" : `${signed(trend.changePercent)}%`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <p className="text-caption text-muted">{label}</p>
      <p className="text-heading tabular-nums">{value}</p>
      <p className="text-caption text-muted">{detail}</p>
    </div>
  );
}

function trendClass(classification: TrendClassification) {
  return cx(
    "shrink-0 tabular-nums",
    classification === "gaining" && "text-overload-up",
    classification === "declining" && "text-overload-down",
    classification === "flat" && "text-muted",
  );
}

function signed(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
}
