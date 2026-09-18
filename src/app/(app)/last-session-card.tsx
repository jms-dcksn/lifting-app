import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import { sessionPath, sessionRecapPath } from "@/lib/session-paths";

export function LastSessionCard({
  sessionId,
  dayName,
  totalSets,
  headline,
}: {
  sessionId: string;
  dayName: string;
  totalSets: number;
  headline: string | null;
}) {
  const setsLabel = `${totalSets} working ${totalSets === 1 ? "set" : "sets"}`;

  return (
    <Card>
      <Link
        href={sessionRecapPath(sessionId)}
        aria-label={`View ${dayName} recap`}
        className="block rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
      >
        <CardLabel className="mb-1">Last session</CardLabel>
        {headline ? <p className="text-body font-medium text-record">{headline}</p> : null}
        <p className={headline ? "mt-1 text-body text-muted" : "text-body"}>
          {dayName} · {setsLabel}
        </p>
        <p className="mt-4 text-caption font-medium">View recap →</p>
      </Link>
      <Link
        href={sessionPath(sessionId)}
        aria-label={`View ${dayName} workout`}
        className="mt-1 inline-flex min-h-11 items-center text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
      >
        View workout
      </Link>
    </Card>
  );
}
