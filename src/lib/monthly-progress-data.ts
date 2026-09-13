import type { createClient } from "./supabase/server";
import type { ExerciseDef } from "./strength/coefficients";
import { buildMonthlyReport, monthlyWindows } from "./monthly-progress";
import { loadStallAssessments } from "./stall-data";
import { loadMonthlyHistory } from "./strength-history-data";
type Client = Awaited<ReturnType<typeof createClient>>;

export async function loadMonthlyReport(db: Client, userId: string, month: string, catalog: Record<string, ExerciseDef>, now = new Date()) {
  const history = await loadMonthlyHistory(db, userId, month, now);
  const stalls = await loadStallAssessments(db, userId, catalog, now, history, monthlyWindows(month, now).current.end);
  return buildMonthlyReport({ userId, month, ...history, catalog, now, stalls });
}
