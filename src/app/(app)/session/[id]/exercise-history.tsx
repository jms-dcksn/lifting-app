"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, useSheetDismiss } from "@/components/ui/sheet";
import { getExerciseHistory } from "../actions";

export function ExerciseHistory({ exerciseId, sessionId, name, isBodyweight, onClose }: {
  exerciseId: string;
  sessionId: string;
  name: string;
  isBodyweight: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} ariaLabel={`${name} history`}>
      <HistoryContent exerciseId={exerciseId} sessionId={sessionId} name={name} isBodyweight={isBodyweight} />
    </Sheet>
  );
}

function HistoryContent({ exerciseId, sessionId, name, isBodyweight }: {
  exerciseId: string; sessionId: string; name: string; isBodyweight: boolean;
}) {
  const dismiss = useSheetDismiss();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof getExerciseHistory>> | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    getExerciseHistory(exerciseId, sessionId).then(
      (data) => { if (active) setRows(data); },
      () => { if (active) setError(true); },
    );
    return () => { active = false; };
  }, [exerciseId, sessionId, attempt]);

  return (
    <div className="flex max-h-[80dvh] flex-col px-4 pb-6">
      <header className="flex shrink-0 items-start justify-between gap-3 pb-4">
        <div>
          <h2 className="text-heading">{name} history</h2>
          <p className="mt-1 text-caption text-muted">Last 10 logged sets · All machines · Previous workouts</p>
        </div>
        <Button variant="secondary" size="sm" onClick={dismiss}>Close</Button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain" tabIndex={0} aria-label="Previous sets">
        {error ? (
          <div role="alert" className="py-4">
            <p className="text-body">Couldn’t load history.</p>
            <Button className="mt-3" variant="secondary" onClick={() => { setError(false); setAttempt((n) => n + 1); }}>Try again</Button>
          </div>
        ) : rows === null ? <p role="status" className="py-4 text-muted">Loading history…</p>
          : rows.length === 0 ? <p className="py-4 text-muted">No previous sets for this exercise yet.</p>
          : <ol className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-card border border-border p-3">
                <p className="text-body font-medium">{row.name}</p>
                <p className="mt-1 text-caption text-muted">
                  <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</time>
                  {row.is_warmup && " · Warm-up"}
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-body tabular-nums">
                  <div><dt className="text-caption text-muted">{isBodyweight ? "Added lb" : "Weight (lb)"}</dt><dd>{row.weight}</dd></div>
                  <div><dt className="text-caption text-muted">Reps</dt><dd>{row.reps}</dd></div>
                  <div><dt className="text-caption text-muted">RIR</dt><dd>{row.rir ?? "—"}</dd></div>
                </dl>
              </li>
            ))}
          </ol>}
      </div>
    </div>
  );
}
