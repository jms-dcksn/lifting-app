import type { createClient } from "./supabase/server";
import type { BodyweightEntry } from "./bodyweight";

export async function loadWeightHistory(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, today: string) {
  const entries: BodyweightEntry[] = [];
  // Keyset pagination also tolerates a server row cap below the requested size.
  let before: string | null = null;
  while (true) {
    let query = supabase.from("bodyweight_log").select("id, logged_on, weight")
      .eq("user_id", userId).lte("logged_on", today).order("logged_on", { ascending: false }).limit(500);
    if (before) query = query.lt("logged_on", before);
    const { data, error } = await query;
    if (error) throw new Error("Unable to load weight history. Please try again.");
    if (!data?.length) break;
    entries.push(...data.map(row => ({ id: row.id, loggedOn: row.logged_on, weight: row.weight })));
    before = data[data.length - 1].logged_on;
  }
  return entries;
}
