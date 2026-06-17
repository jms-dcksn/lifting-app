import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProfile } from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profile")
    .select("bodyweight, goal_weight")
    .eq("id", userId)
    .maybeSingle();

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-display">Settings</h1>

      <form action={saveProfile} className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <label className="text-body text-muted" htmlFor="bodyweight">
            Bodyweight (lb) — used for pull-ups and assisted lifts
          </label>
          <Input
            id="bodyweight"
            name="bodyweight"
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            step="0.5"
            defaultValue={profile?.bodyweight ?? ""}
            placeholder="e.g. 180"
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-body text-muted" htmlFor="goal_weight">
            Goal Weight (lb)
          </label>
          <Input
            id="goal_weight"
            name="goal_weight"
            type="number"
            inputMode="decimal"
            enterKeyHint="done"
            step="0.5"
            defaultValue={profile?.goal_weight ?? ""}
            placeholder="e.g. 175"
          />
        </div>

        <Button type="submit" size="lg">
          Save
        </Button>
      </form>
    </div>
  );
}
