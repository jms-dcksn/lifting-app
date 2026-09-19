import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CoachSection } from "./coach-section";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ exercise?: string | string[] }>;
}) {
  const query = await searchParams;
  const exercise = typeof query.exercise === "string" ? query.exercise : undefined;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-6">
      <Link href="/analytics" className="min-h-11 py-2 text-body text-muted">← Track</Link>
      <h1 className="text-display">Coach</h1>
      <CoachSection userId={userId} coachExercise={exercise} />
    </div>
  );
}
