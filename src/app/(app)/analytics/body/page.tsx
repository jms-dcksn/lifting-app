import { redirect } from "next/navigation";
import Link from "next/link";
import { WeightTrendCard } from "../weight-trend-card";
import { MeasurementTrendCard } from "./measurement-trend-card";
import { loadWeightHistory } from "@/lib/weight-history";
import { createClient } from "@/lib/supabase/server";
import { dateKey } from "@/lib/bodyweight";
import { parseMeasurementRow } from "@/lib/body-measurements";

export default async function BodyPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const today = dateKey(new Date());
  const [{ data: profile, error: profileError }, bodyweightEntries, measurements] = await Promise.all([
    supabase.from("profile").select("goal_weight").eq("id", userId).maybeSingle(),
    loadWeightHistory(supabase, userId, today),
    supabase
      .from("body_measurement_log")
      .select("id, user_id, logged_on, site, inches")
      .eq("user_id", userId)
      .lte("logged_on", today)
      .order("logged_on"),
  ]);
  if (profileError) throw new Error(profileError.message);
  if (measurements.error) throw new Error(measurements.error.message);

  const entries = (measurements.data ?? [])
    .map(parseMeasurementRow)
    .filter((row): row is NonNullable<typeof row> => row != null);

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-6">
      <Link href="/analytics" className="min-h-11 py-2 text-body text-muted">← Track</Link>
      <h1 className="text-display">Body</h1>
      <WeightTrendCard entries={bodyweightEntries} today={today} goal={profile?.goal_weight ?? null} />
      <MeasurementTrendCard entries={entries} today={today} />
    </div>
  );
}
