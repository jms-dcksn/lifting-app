"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Program } from "@/lib/program";
import { filterByTag, uniqueTags } from "@/lib/program-tags";
import { buttonClasses } from "@/components/ui/button-styles";
import { ProgramCard } from "./program-card";
import { TagFilter } from "./tag-filter";

// The program index: a tag filter over a list of expandable cards. One card expands at a
// time. Filter + expand state are local; the program data is assembled server-side.
export function ProgramGallery({ programs }: { programs: Program[] }) {
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
    </div>
  );
}
