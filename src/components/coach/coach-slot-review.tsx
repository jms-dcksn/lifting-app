"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reviewForSlot } from "@/app/(app)/coach/episodes/actions";
import { Sheet } from "@/components/ui/sheet";
import { CoachEpisodeReview } from "./coach-episode-review";
export function CoachSlotReview({ slotId, active }: { slotId: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  return <>{active && <Button size="sm" className="mt-3" pending={pending} onClick={() => start(async () => {
    setError(null);
    try { setEpisodeId(await reviewForSlot(slotId)); }
    catch (e) { setError(e instanceof Error ? e.message : "Please retry."); }
  })}>Review with Coach</Button>}{error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    {episodeId && <Sheet onClose={() => setEpisodeId(null)} ariaLabel="Coach workout review">
      <div className="max-h-[80dvh] overflow-y-auto px-4 py-6"><Button variant="ghost" onClick={() => setEpisodeId(null)}>Back to workout</Button>
        <CoachEpisodeReview episodeId={episodeId} embedded onApplied={() => router.refresh()} />
      </div>
    </Sheet>}
  </>;
}
