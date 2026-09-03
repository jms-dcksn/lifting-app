import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { bodyweightTrend, dateKey, type BodyweightEntry } from "@/lib/bodyweight";
import {
  deleteBodyweightEntry,
  saveBodyweightEntry,
  saveProfile,
} from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const [{ data: profile, error }, { data: weightRows, error: weightError }] =
    await Promise.all([
      supabase
        .from("profile")
        .select("bodyweight, goal_weight, default_rest_seconds")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("bodyweight_log")
        .select("id, logged_on, weight")
        .eq("user_id", userId)
        .order("logged_on", { ascending: false })
        .limit(30),
    ]);

  if (error) {
    throw new Error(`Unable to load profile: ${error.message}`);
  }
  if (weightError) throw new Error(`Unable to load bodyweight history: ${weightError.message}`);

  const today = dateKey(new Date());
  const entries: BodyweightEntry[] = (weightRows ?? []).map((row) => ({
    id: row.id,
    loggedOn: row.logged_on,
    weight: row.weight,
  }));
  const trend = bodyweightTrend(entries, today);
  const currentWeight = trend.latest?.weight ?? profile?.bodyweight ?? null;

  return (
    <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-display">Settings</h1>

      <Card className="flex flex-col gap-4">
        <div>
          <CardLabel className="mb-1">Bodyweight trend</CardLabel>
          <p className="text-heading tabular-nums">
            {trend.current.average == null ? "No recent average" : `${trend.current.average.toFixed(1)} lb`}
          </p>
          <p className="text-caption text-muted">
            Seven-day average · {trend.current.observationCount} reading
            {trend.current.observationCount === 1 ? "" : "s"}
            {trend.change == null ? " · no prior-week comparison" : ` · ${signed(trend.change)} lb vs prior 7 days`}
          </p>
          <p className="mt-2 text-body">
            Latest reading: {currentWeight == null ? "not logged" : `${currentWeight} lb`}
            {!trend.latest && currentWeight != null ? " (saved baseline)" : ""}
          </p>
        </div>

        <form action={saveBodyweightEntry} className="grid grid-cols-[1fr_1fr] gap-3">
          <label className="flex flex-col gap-2 text-caption text-muted">
            Date
            <Input name="logged_on" type="date" defaultValue={today} max={today} required />
          </label>
          <label className="flex flex-col gap-2 text-caption text-muted">
            Weight (lb)
            <Input name="weight" type="number" inputMode="decimal" step="0.1" min="1" max="1500" required placeholder="e.g. 185.4" />
          </label>
          <Button type="submit" className="col-span-2" size="lg">Log weigh-in</Button>
        </form>

        <p className="text-caption text-muted">
          {trend.current.observationCount >= 3
            ? "Three morning weigh-ins logged this week — enough to smooth daily noise."
            : `${trend.current.observationCount}/3 morning weigh-ins this week. Aim for roughly three; consistency matters more than daily logging.`}
          {" "}Logging the same date replaces that date&apos;s reading.
        </p>

        {entries.length > 0 && (
          <div className="border-t border-border pt-3">
            <CardLabel className="mb-2">Recent readings</CardLabel>
            <ul className="flex flex-col gap-2">
              {entries.slice(0, 10).map((entry) => (
                <li key={entry.id} className="rounded-control border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-body">{longDate(entry.loggedOn)}</span>
                    <span className="text-body font-semibold tabular-nums">{entry.weight} lb</span>
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-caption text-muted">Edit or remove</summary>
                    <form action={saveBodyweightEntry} className="mt-3 grid grid-cols-2 gap-2">
                      <input type="hidden" name="entry_id" value={entry.id} />
                      <Input aria-label="Weigh-in date" name="logged_on" type="date" defaultValue={entry.loggedOn} max={today} required />
                      <Input aria-label="Bodyweight in pounds" name="weight" type="number" inputMode="decimal" step="0.1" min="1" max="1500" defaultValue={entry.weight} required />
                      <Button type="submit" variant="secondary">Save</Button>
                    </form>
                    <form action={deleteBodyweightEntry} className="mt-2">
                      <input type="hidden" name="entry_id" value={entry.id} />
                      <Button type="submit" variant="destructive" className="w-full">Remove reading</Button>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <form action={saveProfile} className="flex flex-col gap-6">

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

        <div className="flex flex-col gap-3">
          <label className="text-body text-muted" htmlFor="default_rest_seconds">
            Default rest between sets (seconds)
          </label>
          <Input
            id="default_rest_seconds"
            name="default_rest_seconds"
            type="number"
            inputMode="numeric"
            enterKeyHint="done"
            step="5"
            defaultValue={profile?.default_rest_seconds ?? 120}
            placeholder="e.g. 120"
          />
        </div>

        <Button type="submit" size="lg">
          Save
        </Button>
      </form>
    </div>
  );
}

function signed(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
}

function longDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
