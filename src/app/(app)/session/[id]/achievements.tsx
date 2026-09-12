import { Card, CardLabel } from "@/components/ui/card";
import { recordCounts, type ExerciseRecords, type RepRecord } from "@/lib/strength/records";

function repLabel(record: RepRecord, isBodyweight: boolean) {
  const load = isBodyweight
    ? `${record.load} lb total (${Math.abs(record.weight)} lb ${record.weight < 0 ? "assistance" : "added"})`
    : `${record.load} lb`;
  return `${load} × ${record.reps} · ${record.improvement == null
    ? "improved this workout" : `+${record.improvement} ${record.improvement === 1 ? "rep" : "reps"}`}`;
}

export function AchievementPills({ groups, exerciseId }: { groups: ExerciseRecords[]; exerciseId?: string }) {
  if (!groups.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-2" aria-label="Workout personal records">
      {groups.map((group) => (
        <div key={group.key} className="min-w-0">
          {exerciseId && group.exerciseId !== exerciseId && <p className="mb-1 text-caption text-muted">{group.name}</p>}
          <ul className="flex flex-wrap gap-2 text-caption font-medium text-overload-up">
            {group.repRecords.map((r) => (
              <li key={r.load} className="max-w-full rounded-control border border-overload-up/30 bg-overload-up/10 px-2 py-1">
                <span aria-hidden="true">★ </span>Rep PR · {repLabel(r, group.isBodyweight)}
              </li>
            ))}
            {group.e1rmRecord && (
              <li className="max-w-full rounded-control border border-overload-up/30 bg-overload-up/10 px-2 py-1">
                <span aria-hidden="true">★ </span>e1RM PR · {group.e1rmRecord.value} lb
                {group.e1rmRecord.improvement == null ? " · improved this workout" : ` · +${group.e1rmRecord.improvement} lb`}
                <span className="font-normal"> (estimated)</span>
              </li>
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AchievementRecap({ groups }: { groups: ExerciseRecords[] }) {
  if (!groups.length) return null;
  const counts = recordCounts(groups);
  const headline = [
    counts.reps ? `${counts.reps} rep ${counts.reps === 1 ? "PR" : "PRs"}` : null,
    counts.e1rm ? `${counts.e1rm} e1RM ${counts.e1rm === 1 ? "record" : "records"}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <Card>
      <CardLabel>Workout achievements</CardLabel>
      <p className="mt-1 text-heading">{headline}</p>
      <p className="text-caption text-muted">Across {counts.exercises} {counts.exercises === 1 ? "exercise" : "exercises"}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {groups.map((group) => (
          <li key={group.key}>
            <h3 className="text-body font-medium">{group.name}</h3>
            <AchievementPills groups={[group]} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
