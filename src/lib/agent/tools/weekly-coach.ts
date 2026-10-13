import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCoachUi } from "@/lib/coach-ui-data";
import type { Database } from "@/lib/supabase/types";
import { nextWorkout } from "./next-workout";

type Client = SupabaseClient<Database>;

export async function weeklyCoach(supabase: Client, userId: string) {
  const [loaded, current] = await Promise.all([loadCoachUi(userId, supabase), nextWorkout(supabase, userId)]);
  return {
    source: "weeklyCoach" as const,
    checkInText: loaded.coachCheckIn,
    report: loaded.coachReport,
    recommendations: loaded.coachRecommendations,
    decisions: loaded.decisions,
    currentWorkout: current.workout,
  };
}
