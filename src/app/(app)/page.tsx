import { createClient } from "@/lib/supabase/server";
import { SEED_PROGRAM } from "./session/seed";
import { startNextSession } from "./session/actions";

export default async function Home() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;

  const { count } = await supabase
    .from("workout_session")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId!)
    .not("finished_at", "is", null);

  const completed = count ?? 0;
  const dayIndex = completed % SEED_PROGRAM.days.length;
  const week = Math.floor(completed / SEED_PROGRAM.days.length) + 1;
  const nextDay = SEED_PROGRAM.days[dayIndex];

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{SEED_PROGRAM.name}</h1>
        <p className="text-sm text-zinc-500">
          Week {week} of {SEED_PROGRAM.weeks} · next: {nextDay.name}
        </p>
      </div>

      <form action={startNextSession}>
        <button className="w-full rounded-xl bg-zinc-900 py-4 text-lg font-semibold text-white dark:bg-white dark:text-black">
          Start next workout
        </button>
      </form>
    </div>
  );
}
