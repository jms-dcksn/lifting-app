import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveProgram } from "@/lib/program";
import { loadNextWorkout } from "@/lib/next-workout";
import { WorkoutPlanner } from "./workout-planner";

export default async function NextWorkoutPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  const program = await getActiveProgram(supabase, userId);
  if (!program?.days.length) redirect("/program");
  const next = await loadNextWorkout(supabase, userId, program);
  if (next.open) redirect(`/session/${next.open.id}`);
  return <WorkoutPlanner key={next.key} planKey={next.key} programName={program.name}
    dayName={next.day.name} week={next.week} slots={next.slots} catalog={Object.values(next.catalog)} />;
}
