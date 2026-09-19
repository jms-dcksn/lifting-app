import Link from "next/link";
import { recapLines } from "@/lib/strength/records";
import { sessionRecordSummary } from "@/lib/board";
import { sessionRecapPath } from "@/lib/session-paths";
import type { WeekRecordSession } from "@/lib/week-records-data";

export function WeekPrList({ sessions }: { sessions: WeekRecordSession[] }) {
  if (sessions.length === 0) {
    return <p className="text-body text-muted">No records this week.</p>;
  }

  return (
    <ul className="list-none p-0" aria-label="This week's personal records">
      {sessions.map((session) => {
        const headline = sessionRecordSummary(session.groups);
        return (
          <li key={session.sessionId} className="border-t border-border py-3.5 first:border-t-0 first:pt-0">
            <Link
              href={sessionRecapPath(session.sessionId)}
              className="block min-h-11 py-1 text-caption font-medium text-muted"
            >
              {shortDate(session.performedAt)}
              {headline ? ` · ${headline}` : ""}
            </Link>
            <ul className="list-none p-0">
              {session.groups.map((group) => (
                <li key={group.key} className="flex items-start justify-between gap-3 py-2">
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
          </li>
        );
      })}
    </ul>
  );
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
