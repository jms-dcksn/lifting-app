import Link from "next/link";
import {
  recapHeadline,
  recapLines,
  recordCounts,
  type ExerciseRecords,
} from "@/lib/strength/records";

export function AchievementPills({ groups, exerciseId }: { groups: ExerciseRecords[]; exerciseId?: string }) {
  if (!groups.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-2" aria-label="Workout personal records">
      {groups.map((group) => (
        <div key={group.key} className="min-w-0">
          {exerciseId && group.exerciseId !== exerciseId && <p className="mb-1 text-caption text-muted">{group.name}</p>}
          <ul className="flex flex-wrap gap-2 text-caption font-medium text-record">
            {recapLines(group).map((line) => (
              <li key={line} className="max-w-full rounded-control border border-record/30 bg-record/10 px-2 py-1">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AchievementRecap({
  groups,
  dayName,
  totalSets,
  titleAs = "h2",
  empty = "hide",
}: {
  groups: ExerciseRecords[];
  dayName: string;
  totalSets: number;
  titleAs?: "h1" | "h2";
  empty?: "hide" | "hero";
}) {
  const counts = recordCounts(groups);
  const headline = recapHeadline(counts);
  if (!headline && empty === "hide") return null;

  const Title = titleAs;
  const hasRecords = headline != null;
  // Staggered rise so the payoff screen lands as a moment, not a flash.
  let step = 0;
  const delay = () => ({ animationDelay: `${step++ * 70}ms` });

  return (
    <section aria-label="Workout recap">
      <header className="animate-rise" style={delay()}>
        <p
          className={`text-caption font-semibold uppercase tracking-[0.16em] ${
            hasRecords ? "text-record" : "text-muted"
          }`}
        >
          Workout recap
        </p>
        <Title
          className={hasRecords ? "mt-2 text-recap" : "mt-2 text-display"}
        >
          {headline ?? `${dayName} done`}
        </Title>
        {!hasRecords && (
          <p className="mt-2 text-body text-muted">
            {totalSets} working {totalSets === 1 ? "set" : "sets"}
          </p>
        )}
      </header>
      {hasRecords && (
        <ul className="mt-8 list-none p-0">
          {groups.map((group) => (
            <li
              key={group.key}
              className="flex animate-rise items-baseline justify-between gap-4 border-t border-border py-3.5"
              style={delay()}
            >
              <Link
                href={`/history/${group.exerciseId}`}
                className="min-w-0 text-body font-medium underline-offset-2 hover:underline"
              >
                {group.name}
              </Link>
              <div className="shrink-0 text-right text-body tabular-nums text-record">
                {recapLines(group).map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
