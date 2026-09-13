import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCatalogMap } from "@/lib/catalog";
import { dateKey } from "@/lib/bodyweight";
import { monthlyWindows } from "@/lib/monthly-progress";
import { loadMonthlyReport } from "@/lib/monthly-progress-data";
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
  const report = await loadMonthlyReport(db, userId, month, catalog, now);
  return <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-4 py-6">
    <Link href="/analytics" className="min-h-11 py-2 text-body text-muted">← Progress</Link>
    <MonthlyReview report={report} />
  </div>;
}
