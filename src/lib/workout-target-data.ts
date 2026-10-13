import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import type { ExerciseDef } from "./strength/coefficients";
import { loadStallHistory } from "./stall-data";
import { buildWorkoutTargetHistory } from "./effective-workout-target";

export async function loadWorkoutTargetHistory(client: SupabaseClient<Database>, userId: string,
  catalog: Record<string, ExerciseDef>, asOf: Date, slotIds: string[]) {
  return buildWorkoutTargetHistory(await loadStallHistory(client, userId, asOf), catalog, asOf, slotIds);
}
