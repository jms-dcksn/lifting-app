"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { openRelevantCoach } from "@/app/(app)/coach/entry-actions";
import { discussEpisode } from "@/app/(app)/coach/episodes/actions";
import { coachConversationHref, coachDetailsHref, type CoachFocus } from "@/lib/coach-entry";
import { Button } from "@/components/ui/button";

type Result = Awaited<ReturnType<typeof openRelevantCoach>>;
export function CoachEntry({ focus }: { focus: CoachFocus }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { exerciseId, equipmentInstanceId, month } = focus;
  useEffect(() => {
    let active = true;
    void openRelevantCoach({ exerciseId, equipmentInstanceId, month }).then(value => {
      if (!active) return;
      if (value.kind === "navigate") window.location.replace(value.href); else setResult(value);
    }, () => { if (active) setError("Current reviews could not be loaded."); });
    return () => { active = false; };
  }, [exerciseId, equipmentInstanceId, month]);
  return <div className="mx-auto w-full max-w-page space-y-4 px-4 py-6">
    <h1 className="text-display">Coach</h1>
    {!result && !error && <p role="status">Opening your Coach review…</p>}
    {(error || result?.kind === "unavailable") && <p role="status">Current reviews could not be verified. You can still ask Coach about your training.</p>}
    {(error || result?.kind === "unavailable") && <Button variant="secondary" pending={pending} onClick={() => start(async () => {
      setError(null); try { const value = await openRelevantCoach(focus); if (value.kind === "navigate") window.location.replace(value.href); else setResult(value); }
      catch { setError("Current reviews could not be loaded."); }
    })}>Retry review</Button>}
    {result?.kind === "choose" && <><p>Choose a review</p><ul className="space-y-2">{result.episodes.map(episode => <li key={episode.id}><Button variant="secondary" pending={pending} onClick={() => start(async () => {
      setError(null); try { const thread = await discussEpisode(episode.id); if (!thread) throw Error(); window.location.replace(coachConversationHref(focus, thread)); } catch { setError("This review is unavailable. Please retry."); }
    })}>{episode.title}{episode.validity !== "current" ? " · review context changed" : ""}</Button></li>)}</ul></>}
    {(result || error) && <Link className="inline-flex min-h-11 items-center underline" href={coachConversationHref(focus, null)}>Ask Coach</Link>}
    <Link className="inline-flex min-h-11 items-center underline" href={coachDetailsHref(focus)}>See report details</Link>
  </div>;
}
