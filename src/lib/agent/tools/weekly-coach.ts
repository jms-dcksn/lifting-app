import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCoachUi } from "@/lib/coach-ui-data";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export async function weeklyCoach(supabase: Client, userId: string) {
  const loaded = await loadCoachUi(userId, supabase);
  return {
    source: "weeklyCoach" as const,
    checkInText: loaded.coachCheckIn,
    report: loaded.coachReport,
    recommendations: loaded.coachRecommendations,
    decisions: loaded.decisions,
  };
}
