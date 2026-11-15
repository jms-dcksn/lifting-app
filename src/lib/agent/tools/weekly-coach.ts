import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCoachUi } from "@/lib/coach-ui-data";
import type { Database } from "@/lib/supabase/types";
import { summarizeWeeklyCoach } from "./weekly-summary";

type Client = SupabaseClient<Database>;

export async function weeklyCoach(supabase: Client, userId: string) {
  return summarizeWeeklyCoach(await loadCoachUi(userId, supabase));
}
