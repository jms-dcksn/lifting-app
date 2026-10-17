"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { threadReview } from "@/app/(app)/coach/episodes/actions";
import type { EpisodeReview } from "@/lib/coach-conversation-data";
import { episodeExplanation } from "@/lib/coach-intervention";
import { exceptionCopy, signalCategory } from "@/lib/coach-episodes";

export function CoachThreadReview({ threadId }: { threadId: string }) {
  const [review, setReview] = useState<EpisodeReview | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void threadReview(threadId).then(r => { if (active) setReview(r); }, () => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [threadId]);
  if (failed) return <p className="mb-4 text-sm text-muted">Current review context is unavailable. Earlier messages may be out of date.</p>;
  if (!review) return null;
  const evidence = review.episode.evidence;
  const target = review.fresh && review.episode.state === "open" && review.episode.validity === "current" ? evidence?.effectiveTarget?.target : null;
  return <aside className="mb-4 rounded-card border border-border p-3 text-sm">
    <p className="font-semibold">{review.episode.evidence?.name ?? "Exception review"}</p>
    <p className="mt-2">{episodeExplanation(review.episode, review.fresh)}</p>
    {evidence && review.episode.state === "open" && <p className="mt-2">{exceptionCopy(evidence, signalCategory(evidence.candidate.signals[0])).body}</p>}
    {target && <p className="mt-2">Current calculated target: {target.weight} lb × {target.targetReps} · {target.targetRir} RIR.</p>}
    <Link className="inline-flex min-h-11 items-center underline" href={`/coach/episodes/${review.episodeId}`}>See details and choices</Link>
  </aside>;
}
