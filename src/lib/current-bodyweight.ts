import type { createClient } from "@/lib/supabase/server";

// Source-of-truth rule: the newest dated observation wins. profile.bodyweight
// remains the preserved baseline and is used only when no history exists.
export async function getCurrentBodyweight(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number | null> {
  const [{ data: latest, error: historyError }, { data: profile, error: profileError }] =
    await Promise.all([
      supabase
        .from("bodyweight_log")
        .select("weight")
        .eq("user_id", userId)
        .order("logged_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("profile").select("bodyweight").eq("id", userId).maybeSingle(),
    ]);

  if (historyError) throw new Error(`Unable to load bodyweight history: ${historyError.message}`);
  if (profileError) throw new Error(`Unable to load bodyweight baseline: ${profileError.message}`);
  return latest?.weight ?? profile?.bodyweight ?? null;
}
