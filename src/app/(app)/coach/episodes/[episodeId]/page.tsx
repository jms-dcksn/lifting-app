import { CoachEpisodeReview } from "@/components/coach/coach-episode-review";
export default async function Page({ params }: { params: Promise<{ episodeId: string }> }) {
  const { episodeId } = await params;
  return <CoachEpisodeReview episodeId={episodeId} />;
}
