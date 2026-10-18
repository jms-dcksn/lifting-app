import type { EpisodeEvidence } from "@/lib/coach-episodes";

export function EvidenceDetails({ evidence }: { evidence: EpisodeEvidence }) {
  const sources = [
    ...new Map(
      evidence.candidate.signals
        .flatMap((s) => s.sources)
        .map((s) => [s.sessionId, s]),
    ).values(),
  ];
  return (
    <div className="mt-3 space-y-3 text-sm">
      <p className="text-muted">
        {evidence.name} · {sources.length}{" "}
        {sources.length === 1 ? "workout" : "workouts"}
      </p>
      {sources.map((source) => (
        <div key={source.sessionId}>
          <p>{new Date(source.performedAt).toLocaleDateString()}</p>
          <ul className="mt-1 space-y-1">
            {evidence.values
              .filter((v) => source.setIds.includes(v.id))
              .map((v) => (
                <li key={v.id}>
                  {v.weight} lb × {v.reps} ·{" "}
                  {v.rir == null ? "RIR unavailable" : `${v.rir} RIR`}
                  {v.e1rm != null
                    ? ` · e1RM ${Math.round(v.e1rm * 10) / 10} lb`
                    : ""}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
