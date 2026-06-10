import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveProgram,
  getProgram,
  listPrograms,
  recentExerciseIds,
  type Program,
} from "@/lib/program";
import { ProgramBuilder } from "./program-builder";
import { ProgramList } from "./program-list";
import { createFromTemplate } from "./actions";

export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const [programs, recent] = await Promise.all([
    listPrograms(supabase, userId),
    recentExerciseIds(supabase, userId),
  ]);

  let initial: Program | null = null;
  if (id && id !== "new") initial = await getProgram(supabase, userId, id);
  else if (!id) initial = await getActiveProgram(supabase, userId);

  // First run, no programs: offer the template before showing a blank builder.
  if (!initial && programs.length === 0 && id !== "new") {
    return (
      <div className="flex flex-1 flex-col gap-4 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Build your program</h1>
          <p className="text-sm text-zinc-500">Start from a template, or build one from scratch.</p>
        </div>
        <form action={createFromTemplate}>
          <button className="w-full rounded-xl bg-zinc-900 py-3 font-semibold text-white dark:bg-white dark:text-black">
            Start with Push / Pull / Legs
          </button>
        </form>
        <a
          href="/program?id=new"
          className="rounded-xl border border-zinc-300 py-3 text-center text-sm font-medium dark:border-zinc-700"
        >
          Build from scratch
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <ProgramBuilder initial={id === "new" ? null : initial} recentIds={recent} />
      <ProgramList programs={programs} editingId={initial?.id ?? "new"} />
    </div>
  );
}
