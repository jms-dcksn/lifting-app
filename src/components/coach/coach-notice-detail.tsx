"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  openNotice,
  endPainReview,
  markNotice,
} from "@/app/(app)/coach/inbox/actions";
import type { CoachEpisode, EpisodeEvidence } from "@/lib/coach-episodes";
import type { CoachNoticeRow } from "@/lib/coach-inbox-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";

export function CoachNoticeDetail({ noticeId }: { noticeId: string }) {
  const [data, setData] = useState<{
    notice: CoachNoticeRow;
    episode: CoachEpisode;
    episodeId: string;
    fresh: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const load = useCallback(
    () =>
      openNotice(noticeId).then(
        (result) => {
          setData(result);
          setLoaded(true);
          window.dispatchEvent(new Event("coach:refresh"));
        },
        () => setError("This notice is unavailable. Please retry."),
      ),
    [noticeId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const current = data?.episode.evidence;
  const currentTarget =
    data?.fresh &&
    data.episode.state === "open" &&
    data.episode.validity === "current"
      ? current?.effectiveTarget
      : null;
  function run(action: () => Promise<void>) {
    start(async () => {
      setError(null);
      try {
        await action();
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Please retry.");
      }
    });
  }
  return (
    <div className="mx-auto w-full max-w-page space-y-5 px-4 py-6">
      <Link
        className="inline-flex min-h-11 items-center text-muted"
        href="/coach/inbox"
      >
        ← Coach inbox
      </Link>
      {error ? (
        <p role="alert" className="text-danger">
          {error}
          <Button variant="secondary" onClick={() => run(load)}>
            Retry
          </Button>
        </p>
      ) : null}
      {!loaded && !error ? <p role="status">Loading…</p> : null}
      {loaded && !data ? <p>This notice is unavailable.</p> : null}
      {data ? (
        <>
          <h1 className="text-2xl font-semibold">{data.notice.title}</h1>
          <p>{data.notice.body}</p>
          <Card>
            <h2 className="font-semibold">Current review</h2>
            <p className="mt-2 text-sm">
              {data.episode.terminalReason === "user_reported_ended"
                ? "You reported this pain situation ended."
                : data.episode.state === "resolved"
                  ? "New comparable evidence no longer supports this exception."
                  : data.episode.state === "superseded"
                    ? "The original context or evidence has changed."
                    : data.episode.validity === "blocked_by_pain"
                      ? "Performance review is paused while a pain review is open."
                      : data.episode.snoozeSourceIds != null
                        ? "Snoozed for two comparable exposures."
                        : !data.fresh || data.episode.validity !== "current"
                          ? "Fresh comparable evidence is needed."
                          : "Review recommended."}
            </p>
            {current ? (
              <EvidenceDetails evidence={current} />
            ) : (
              <p className="mt-2 text-sm text-muted">
                The source evidence is no longer available.
              </p>
            )}
          </Card>
          {currentTarget ? (
            <Card>
              <h2 className="font-semibold">Current calculated target</h2>
              <p className="mt-2">
                {currentTarget.target
                  ? `${currentTarget.target.weight} lb × ${currentTarget.target.targetReps} · ${currentTarget.target.targetRir} RIR`
                  : "Target unavailable"}
              </p>
            </Card>
          ) : null}
          <details className="rounded-card border border-border p-4">
            <summary className="min-h-11 content-center cursor-pointer font-semibold">
              Original notice evidence
            </summary>
            {data.notice.redacted ? (
              <p>Source details were removed after a correction or deletion.</p>
            ) : data.notice.generation_evidence ? (
              <EvidenceDetails
                evidence={
                  data.notice.generation_evidence as unknown as EpisodeEvidence
                }
              />
            ) : (
              <p>Evidence unavailable.</p>
            )}
          </details>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              pending={pending}
              disabled={!!data.notice.acknowledged_at}
              onClick={() =>
                run(async () => {
                  await markNotice(noticeId, true);
                })
              }
            >
              {data.notice.acknowledged_at ? "Acknowledged" : "Acknowledge"}
            </Button>
            <Link
              className="inline-flex min-h-11 items-center underline"
              href="/coach"
            >
              Open Coach
            </Link>
          </div>
          {data.episode.family === "session_pain" &&
          data.episode.state === "open" ? (
            <Button
              variant="ghost"
              disabled={!data.fresh}
              onClick={() => setConfirm(true)}
            >
              This pain situation has ended
            </Button>
          ) : null}
          {confirm ? (
            <Sheet
              onClose={() => setConfirm(false)}
              ariaLabel="End pain review"
            >
              <div className="px-4 pb-6">
                <h2 className="text-xl font-semibold">
                  Has this pain situation ended?
                </h2>
                <p className="my-4">
                  This records your report that the situation ended. It is not
                  medical clearance and does not change your training.
                </p>
                <Button
                  pending={pending}
                  onClick={() =>
                    run(async () => {
                      await endPainReview(
                        data.episodeId,
                        data.episode.revision,
                      );
                      setConfirm(false);
                    })
                  }
                >
                  Confirm ended
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </Sheet>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
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
