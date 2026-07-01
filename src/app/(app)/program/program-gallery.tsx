"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Program } from "@/lib/program";
import type { ExerciseDef } from "@/lib/strength/coefficients";
import { filterByTag, uniqueTags } from "@/lib/program-tags";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { createFromTemplate } from "./actions";
import { ProgramCard } from "./program-card";
import { TagFilter } from "./tag-filter";

// Serializable summary of a built-in template (full data stays server-side).
export interface TemplateSummary {
  id: string;
  name: string;
  dayCount: number;
  tags: string[];
}

// The program index: a tag filter over a list of expandable cards. One card expands at a
// time. Filter + expand state are local; the program data is assembled server-side.
export function ProgramGallery({
  programs,
  defs,
  templates,
}: {
  programs: Program[];
  defs: Record<string, ExerciseDef>;
  templates: TemplateSummary[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(
    programs.find((p) => p.isActive)?.id ?? null,
  );
  const [tag, setTag] = useState<string | null>(null);

  const tags = useMemo(() => uniqueTags(programs), [programs]);
  const visible = useMemo(() => filterByTag(programs, tag), [programs, tag]);

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-page items-center justify-between gap-3">
        <h1 className="text-display">Programs</h1>
        <Link href="/program?id=new" className={buttonClasses("secondary", "sm")}>
          + New
        </Link>
      </div>

      <TagFilter tags={tags} active={tag} onSelect={setTag} />

      <ul className="flex w-full max-w-page flex-col gap-3">
        {visible.map((program) => (
          <li key={program.id}>
            <ProgramCard
              program={program}
              defs={defs}
              expanded={expandedId === program.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === program.id ? null : program.id))
              }
            />
          </li>
        ))}
        {visible.length === 0 && (
          <li className="text-body text-muted">No programs match this tag.</li>
        )}
      </ul>

      {templates.length > 0 && (
        <div className="mt-4 flex w-full max-w-page flex-col gap-2">
          <h2 className="text-heading">Templates</h2>
          <ul className="flex flex-col divide-y divide-border">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-body">{t.name}</div>
                  <div className="text-caption text-muted">
                    {t.dayCount} days/wk · {t.tags.join(" · ")}
                  </div>
                </div>
                <form action={createFromTemplate.bind(null, t.id)}>
                  <Button variant="secondary" size="sm">
                    Add
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
