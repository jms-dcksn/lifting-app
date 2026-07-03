import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listProgramSummaries } from "@/lib/program";
import { PROGRAM_TEMPLATES } from "@/lib/program-templates";
import { programNewHref } from "@/lib/program-routes";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { ProgramGallery, type TemplateSummary } from "./program-gallery";
import { createFromTemplate } from "./actions";

const TEMPLATE_SUMMARIES: TemplateSummary[] = PROGRAM_TEMPLATES.map((t) => ({
  id: t.id,
  name: t.name,
  dayCount: t.days.length,
  tags: t.tags,
}));

export default async function ProgramPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const programs = await listProgramSummaries(supabase, userId);

  // First run, no programs: offer the template before showing a blank builder.
  if (programs.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-4 px-6 py-10">
        <div>
          <h1 className="text-display">Build your program</h1>
          <p className="text-body text-muted">Start from a template, or build one from scratch.</p>
        </div>
        <ul className="flex flex-col gap-3">
          {PROGRAM_TEMPLATES.map((t) => (
            <li key={t.id}>
              <form action={createFromTemplate.bind(null, t.id)} className="flex flex-col gap-1">
                <Button size="lg" className="w-full">
                  Start with {t.name}
                </Button>
                <p className="text-caption text-muted">
                  {t.days.length} days/wk · {t.tags.join(" · ")}
                </p>
              </form>
            </li>
          ))}
        </ul>
        <Link href={programNewHref()} className={buttonClasses("secondary", "lg", "w-full")}>
          Build from scratch
        </Link>
      </div>
    );
  }

  return <ProgramGallery programs={programs} templates={TEMPLATE_SUMMARIES} />;
}
