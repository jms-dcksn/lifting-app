import { coachEntryHref, parseCoachFocus } from "@/lib/coach-entry";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CoachSection } from "./coach-section";
import { CoachEntry } from "@/components/coach/coach-entry";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ exercise?: string | string[]; month?: string; equipment?: string; view?: string }>;
}) {
  const query = await searchParams;
  if (query.view !== "details") return <CoachEntry focus={parseCoachFocus(query)} />;
  const exercise = typeof query.exercise === "string" ? query.exercise : undefined;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-6">
      <Link href="/analytics" className="min-h-11 py-2 text-body text-muted">← Track</Link>
      <h1 className="text-display">Weekly report details</h1>
      <Link href={coachEntryHref(parseCoachFocus(query))} className="min-h-11 py-2 underline">Open Coach</Link>
      {query.month && <p className="text-sm text-muted">Opened from {parseCoachFocus(query).month ?? "a historical review"}. This report uses the current/prior calendar windows labeled below.</p>}
      <CoachSection userId={userId} coachExercise={exercise} month={parseCoachFocus(query).month} />
    </div>
  );
}
