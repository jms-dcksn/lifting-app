import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCatalogMap } from "@/lib/catalog";
import { dateKey } from "@/lib/bodyweight";
import { monthlyWindows } from "@/lib/monthly-progress";
import { loadMonthlyReport } from "@/lib/monthly-progress-data";
import { loadWeightHistory } from "@/lib/weight-history";
import { isEligibleForPeriodTracking, loadPeriodObservations } from "@/lib/period-calendar";
import { WeightTrendCard } from "../weight-trend-card";
import { MonthlyReview } from "./review";

export default async function MonthPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  const now = new Date();
  const query = await searchParams;
  const month = typeof query.month === "string" ? query.month : dateKey(now).slice(0, 7);
  try { monthlyWindows(month, now); } catch { redirect("/analytics/month"); }
  const catalog = await getCatalogMap(db, userId);
  const eligible = await isEligibleForPeriodTracking(db, userId);
  const [report, entries, profile, periodObservations] = await Promise.all([
    loadMonthlyReport(db, userId, month, catalog, now),
    loadWeightHistory(db, userId, monthlyWindows(month, now).current.end),
    db.from("profile").select("goal_weight").eq("id", userId).maybeSingle(),
    eligible ? loadPeriodObservations(db, userId, month) : Promise.resolve([]),
  ]);
  if (profile.error) throw new Error("Unable to load your weight goal. Please try again.");
  return <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-6">
    <Link href="/analytics" className="min-h-11 py-2 text-body text-muted">← Board</Link>
    <MonthlyReview
      report={report}
      eligible={eligible}
      periodObservations={periodObservations}
      weightEntries={entries}
    />
    <section id="monthly-weight" aria-label="Monthly bodyweight" className="min-w-0">
      <WeightTrendCard
        key={month}
        entries={entries}
        today={dateKey(now)}
        goal={profile.data?.goal_weight ?? null}
        window={report.windows.current}
        eligible={eligible}
        periodObservations={periodObservations}
      />
    </section>
  </div>;
}
