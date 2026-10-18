"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { episodeReview, discussEpisode, confirmEpisode } from "@/app/(app)/coach/episodes/actions";
import { endPainReview } from "@/app/(app)/coach/inbox/actions";
import type { EpisodeReview } from "@/lib/coach-conversation-data";
import { episodeExplanation, type CoachActionIntent, type CoachActionReceipt } from "@/lib/coach-intervention";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { coachDiscussionHref } from "@/lib/coach-discussion";
import { EvidenceDetails } from "./coach-evidence";

export function CoachEpisodeReview({ episodeId, embedded = false, showDiscussion = !embedded, direct = false, onApplied }: { episodeId: string; embedded?: boolean; showDiscussion?: boolean; direct?: boolean; onApplied?: () => void }) {
  const router = useRouter();
  const [review, setReview] = useState<EpisodeReview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<CoachActionIntent | null>(null);
  const [receipt, setReceipt] = useState<CoachActionReceipt | null>(null);
  const [painEnd, setPainEnd] = useState(false);
  const [pending, start] = useTransition();
  const load = useCallback(async () => { setReview(await episodeReview(episodeId)); setLoaded(true); }, [episodeId]);
  useEffect(() => {
    let active = true;
    void episodeReview(episodeId).then(result => { if (active) { setReview(result); setLoaded(true); } },
      () => { if (active) setError("This review is unavailable. Please retry."); });
    return () => { active = false; };
  }, [episodeId]);
  function run(task: () => Promise<void>) {
    start(async () => { setError(null); try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "Please retry."); } });
  }
  function choose(action: CoachActionIntent["action"], replacementId: string | null = null) {
    if (!review) return;
    setError(null);
    const next: CoachActionIntent = { episodeId, occurrence: review.episode.occurrence, revision: review.episode.revision,
      requestId: crypto.randomUUID(), action, replacementId, sessionId: review.sessionId, scope: "program" };
    setIntent(next);
    if (direct && action !== "keep_going") run(() => apply(next));
  }
  async function apply(choice: CoachActionIntent) {
    const saved = await confirmEpisode(choice);
    setReceipt(saved); setIntent(null);
    setReview(current => current ? { ...current, suggestion: null } : current);
    onApplied?.(); await load();
  }
  const discussion = showDiscussion && <Button variant="secondary" pending={pending} onClick={() => run(async () => {
    const threadId = await discussEpisode(episodeId);
    if (!threadId) throw Error("This review is unavailable.");
    router.push(coachDiscussionHref(threadId));
  })}>Discuss with Coach</Button>;
  const evidence = review?.episode.evidence;
  const suggestion = review?.suggestion;
  return <div className={embedded ? "space-y-4" : "mx-auto w-full max-w-page space-y-4 px-4 py-6"}>
    {!embedded && <Link className="inline-flex min-h-11 items-center text-muted" href="/coach/inbox">← Coach inbox</Link>}
    {(!embedded || !direct) && <h1 className="text-2xl font-semibold">{evidence?.name ?? "Coach review"}</h1>}
    {error && <p role="alert" className="text-danger">{error} <Button variant="secondary" pending={pending} onClick={() => run(async () => { setIntent(null); await load(); })}>Refresh review</Button></p>}
    {!loaded && !error && <p role="status">Loading review…</p>}
    {loaded && !review && <p>This review is unavailable.</p>}
    {review && <>
      {(receipt ? [receipt] : review.receipts).map(r => <Card key={r.requestId}><p role="status">{r.status === "snoozed" ? "Keep going saved. Snoozed for two comparable exposures; no prescription changed." : r.action === "rep_change" ? `Applied: ${r.repMin}–${r.repMax} reps for the remainder of the program.` : `Applied replacement: ${r.replacementId}. Remainder of program.`}</p></Card>)}
      {suggestion && <Card><h2 className="font-semibold">{suggestion.action === "rep_change" && suggestion.repBand ? `Switch rep range to ${suggestion.repBand.repMin}–${suggestion.repBand.repMax} reps` : "Switch exercise"}</h2>
        <p className="my-3 text-sm text-muted">Changes apply to this slot for the remainder of the program{review.sessionId ? ", including its open workout" : ""}. Saved sets remain intact.</p>
        {suggestion.action === "rep_change" && suggestion.repBand && <Button pending={pending} disabled={direct && intent !== null} onClick={() => choose("rep_change")}>{direct ? "Accept change" : `Switch rep range to ${suggestion.repBand.repMin}–${suggestion.repBand.repMax}`}</Button>}
        {suggestion.action === "swap" && <div className="space-y-2">{suggestion.candidates?.map((c, index) => <Button key={c.exerciseId} variant={index === 0 ? "primary" : "secondary"} pending={pending} disabled={direct && intent !== null} onClick={() => choose("swap", c.exerciseId)}>{direct ? "Accept" : "Switch to"} {c.name}</Button>)}</div>}
        <div className="mt-3 flex flex-wrap gap-3">{discussion}</div>
        <Button variant="ghost" pending={pending} className="mt-3" disabled={direct && intent !== null} onClick={() => choose("keep_going")}>Keep going</Button>
      </Card>}
      {!suggestion && discussion}
      <Card><p>{episodeExplanation(review.episode, review.fresh)}</p>
        {review.fresh && review.episode.state === "open" && review.episode.validity === "current" && evidence?.effectiveTarget && <p className="mt-3">Current calculated target: {evidence.effectiveTarget.target ? `${evidence.effectiveTarget.target.weight} lb × ${evidence.effectiveTarget.target.targetReps} · ${evidence.effectiveTarget.target.targetRir} RIR` : "unavailable"}. This suggestion is calculated from your logs.</p>}
      </Card>
      {evidence && <details className="rounded-card border border-border p-4"><summary className="min-h-11 content-center cursor-pointer font-semibold">See details</summary><EvidenceDetails evidence={evidence} /></details>}
      {!embedded && review.sessionId && <Link className="inline-flex min-h-11 items-center underline" href={`/session/${review.sessionId}`}>Return to workout</Link>}
      {review.episode.family === "session_pain" && review.episode.state === "open" && <Button variant="secondary" disabled={!review.fresh} onClick={() => setPainEnd(true)}>This pain situation has ended</Button>}

    </>}
    {intent && (!direct || intent.action === "keep_going") && <Sheet onClose={() => !pending && setIntent(null)} ariaLabel="Confirm training choice"><div className="space-y-4 px-4 pb-6">
      <h2 className="text-xl font-semibold">Confirm {intent.action === "keep_going" ? "Keep going" : intent.action === "swap" ? "exercise replacement" : "rep-range change"}</h2>
      <p>{intent.action === "keep_going" ? "Keep the current prescription and snooze this plateau for two new comparable exposures." : `Apply to this program slot for the remainder of the program${intent.sessionId ? ", including the open workout" : ""}. Previously logged sets are preserved.`}</p>
      {error && <p role="alert" className="text-danger">{error}</p>}
      <Button pending={pending} onClick={() => run(() => apply(intent))}>Confirm choice</Button>
      <Button variant="ghost" disabled={pending} onClick={() => setIntent(null)}>Cancel</Button>
    </div></Sheet>}
    {direct && intent && intent.action !== "keep_going" && error && <Button pending={pending} onClick={() => run(() => apply(intent))}>Retry accepted change</Button>}
    {painEnd && review && <Sheet onClose={() => setPainEnd(false)} ariaLabel="End pain review"><div className="space-y-4 px-4 pb-6"><p>This records your report that the pain situation ended. It is not medical clearance and does not change training.</p><Button pending={pending} onClick={() => run(async () => { await endPainReview(episodeId, review.episode.revision); setPainEnd(false); await load(); })}>Confirm ended</Button><Button variant="ghost" onClick={() => setPainEnd(false)}>Cancel</Button></div></Sheet>}
  </div>;
}
