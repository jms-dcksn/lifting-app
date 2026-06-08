import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveBodyweight } from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profile")
    .select("bodyweight")
    .eq("id", userId)
    .maybeSingle();

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <form action={saveBodyweight} className="flex flex-col gap-3">
        <label className="text-sm text-zinc-500" htmlFor="bodyweight">
          Bodyweight (lb) — used for pull-ups and assisted lifts
        </label>
        <input
          id="bodyweight"
          name="bodyweight"
          type="number"
          inputMode="decimal"
          step="0.5"
          defaultValue={profile?.bodyweight ?? ""}
          placeholder="e.g. 180"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button className="rounded-xl bg-zinc-900 py-3 font-semibold text-white dark:bg-white dark:text-black">
          Save
        </button>
      </form>
    </div>
  );
}
