"use client";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  openNotice,
  markNotice,
} from "@/app/(app)/coach/inbox/actions";
import type { CoachEpisode } from "@/lib/coach-episodes";
import type { CoachNoticeRow } from "@/lib/coach-inbox-data";
import { Button } from "@/components/ui/button";
import { CoachEpisodeReview } from "./coach-episode-review";
import { EvidenceDetails } from "./coach-evidence";

export function CoachNoticeDetail({ noticeId }: { noticeId: string }) {
  const [data, setData] = useState<{
    notice: CoachNoticeRow;
    episode: CoachEpisode;
    episodeId: string;
    fresh: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
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
    <div className="mx-auto w-full max-w-page space-y-5 px-4 pb-6">
      <PageHeader title={data?.notice.title ?? "Coach notice"} back={<Link href="/coach/inbox">← Coach inbox</Link>} />
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
          <CoachEpisodeReview episodeId={data.episodeId} embedded showDiscussion direct />
          <details className="rounded-card border border-border p-4">
            <summary className="min-h-11 content-center cursor-pointer font-semibold">
              Original notice evidence
            </summary>
            {data.notice.redacted ? (
              <p>Source details were removed after a correction or deletion.</p>
            ) : data.notice.generation_evidence ? (
              <EvidenceDetails
                evidence={data.notice.generation_evidence}
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
          </div>

        </>
      ) : null}
    </div>
  );
}
