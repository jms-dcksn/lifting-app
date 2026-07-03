# Program Grid Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace expandable program cards with a lightweight summary grid and move complete program viewing and actions to a dedicated read-only detail route.

**Architecture:** `/program` loads batched `ProgramSummary` records and renders filterable linked tiles without loading exercise definitions or complete program trees. `/program/[id]` loads one complete program for read-only display, while `/program/[id]?mode=edit` and `/program/new` reuse the existing builder. Pure route and summary helpers provide the test seams; Server Components own data loading and small Client Components own filtering and mutations.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase SSR/PostgREST, Tailwind CSS v4, Vitest.

**Design spec:** `docs/superpowers/specs/2026-07-03-program-grid-navigation-design.md`

---

## File map

- Create `src/lib/program-routes.ts` — canonical index, create, detail, and edit URLs.
- Create `src/lib/program-routes.test.ts` — route contract tests.
- Create `src/lib/program-summary.ts` — summary types plus pure count/order aggregation.
- Create `src/lib/program-summary.test.ts` — aggregation and ordering tests.
- Modify `src/lib/program.ts` — add the three-query summary loader; remove full-list loading.
- Create `src/app/(app)/program/program-tile.tsx` — one semantic, action-free summary link.
- Modify `src/app/(app)/program/program-gallery.tsx` — responsive filtered summary grid.
- Create `src/app/(app)/program/program-detail.tsx` — full read-only day grid and actions.
- Modify `src/app/(app)/program/page.tsx` — summary-only index and first-run state.
- Create `src/app/(app)/program/new/page.tsx` — new-program builder route.
- Create `src/app/(app)/program/[id]/page.tsx` — read-only detail and edit mode.
- Modify `src/app/(app)/program/actions.ts` — revalidate detail routes and preserve metadata when cloning.
- Delete `src/app/(app)/program/program-card.tsx` — remove inline expansion implementation.
- Modify `CLAUDE.md`, `README.md`, `docs/FEATURES.md`, and `docs/DECISIONS.md` — record the current route and loader architecture.

---

### Task 1: Canonical program routes

**Files:**
- Create: `src/lib/program-routes.test.ts`
- Create: `src/lib/program-routes.ts`

- [ ] **Step 1: Write the failing route tests**

Create `src/lib/program-routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  programDetailHref,
  programEditHref,
  programIndexHref,
  programNewHref,
} from "./program-routes";

describe("program routes", () => {
  it("builds index and create routes", () => {
    expect(programIndexHref()).toBe("/program");
    expect(programNewHref()).toBe("/program/new");
  });

  it("encodes ids in detail and edit routes", () => {
    expect(programDetailHref("abc/123")).toBe("/program/abc%2F123");
    expect(programEditHref("abc/123")).toBe("/program/abc%2F123?mode=edit");
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run: `npm test -- program-routes`

Expected: FAIL because `./program-routes` does not exist.

- [ ] **Step 3: Implement the route helpers**

Create `src/lib/program-routes.ts`:

```ts
export function programIndexHref() {
  return "/program";
}

export function programNewHref() {
  return "/program/new";
}

export function programDetailHref(id: string) {
  return `/program/${encodeURIComponent(id)}`;
}

export function programEditHref(id: string) {
  return `${programDetailHref(id)}?mode=edit`;
}
```

- [ ] **Step 4: Run the focused test**

Run: `npm test -- program-routes`

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit the route contract**

```bash
git add src/lib/program-routes.ts src/lib/program-routes.test.ts
git commit -m "test: define program route contract"
```

---

### Task 2: Pure program summary aggregation

**Files:**
- Create: `src/lib/program-summary.test.ts`
- Create: `src/lib/program-summary.ts`

- [ ] **Step 1: Write failing aggregation tests**

Create `src/lib/program-summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildProgramSummaries } from "./program-summary";

describe("buildProgramSummaries", () => {
  it("returns an empty list without programs", () => {
    expect(buildProgramSummaries([], [], [])).toEqual([]);
  });

  it("returns zero counts for one program without days", () => {
    expect(
      buildProgramSummaries(
        [{
          id: "solo",
          name: "Solo",
          tags: ["strength"],
          weeks: 4,
          is_active: true,
          style: "classic",
          created_at: "2026-04-01T00:00:00Z",
        }],
        [],
        [],
      ),
    ).toEqual([{
      id: "solo",
      name: "Solo",
      tags: ["strength"],
      weeks: 4,
      isActive: true,
      style: "classic",
      dayCount: 0,
      exerciseCount: 0,
    }]);
  });

  it("pins active first, then sorts newest first and counts days and exercises", () => {
    const programs = [
      {
        id: "older",
        name: "Older",
        tags: [],
        weeks: 5,
        is_active: false,
        style: "classic",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "newer",
        name: "Newer",
        tags: ["hypertrophy"],
        weeks: 6,
        is_active: false,
        style: "fluid",
        created_at: "2026-03-01T00:00:00Z",
      },
      {
        id: "active",
        name: "Active",
        tags: ["strength", "four-day"],
        weeks: null,
        is_active: true,
        style: "classic",
        created_at: "2026-02-01T00:00:00Z",
      },
    ];
    const days = [
      { id: "a1", program_id: "active" },
      { id: "a2", program_id: "active" },
      { id: "n1", program_id: "newer" },
    ];
    const slots = [
      { program_day_id: "a1" },
      { program_day_id: "a1" },
      { program_day_id: "a2" },
      { program_day_id: "n1" },
    ];

    expect(buildProgramSummaries(programs, days, slots)).toEqual([
      {
        id: "active",
        name: "Active",
        tags: ["strength", "four-day"],
        weeks: 5,
        isActive: true,
        style: "classic",
        dayCount: 2,
        exerciseCount: 3,
      },
      {
        id: "newer",
        name: "Newer",
        tags: ["hypertrophy"],
        weeks: 6,
        isActive: false,
        style: "fluid",
        dayCount: 1,
        exerciseCount: 1,
      },
      {
        id: "older",
        name: "Older",
        tags: [],
        weeks: 5,
        isActive: false,
        style: "classic",
        dayCount: 0,
        exerciseCount: 0,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run: `npm test -- program-summary`

Expected: FAIL because `./program-summary` does not exist.

- [ ] **Step 3: Implement the pure summary builder**

Create `src/lib/program-summary.ts`:

```ts
export interface ProgramSummary {
  id: string;
  name: string;
  tags: string[];
  weeks: number;
  isActive: boolean;
  style: "classic" | "fluid";
  dayCount: number;
  exerciseCount: number;
}

export interface ProgramSummaryRow {
  id: string;
  name: string;
  tags: string[] | null;
  weeks: number | null;
  is_active: boolean;
  style: string;
  created_at: string;
}

export interface ProgramDaySummaryRow {
  id: string;
  program_id: string;
}

export interface ProgramSlotSummaryRow {
  program_day_id: string;
}

export function buildProgramSummaries(
  programs: ProgramSummaryRow[],
  days: ProgramDaySummaryRow[],
  slots: ProgramSlotSummaryRow[],
): ProgramSummary[] {
  const programIdByDayId = new Map(days.map((day) => [day.id, day.program_id]));
  const dayCounts = new Map<string, number>();
  const exerciseCounts = new Map<string, number>();

  for (const day of days) {
    dayCounts.set(day.program_id, (dayCounts.get(day.program_id) ?? 0) + 1);
  }

  for (const slot of slots) {
    const programId = programIdByDayId.get(slot.program_day_id);
    if (!programId) continue;
    exerciseCounts.set(programId, (exerciseCounts.get(programId) ?? 0) + 1);
  }

  return [...programs]
    .sort(
      (a, b) =>
        Number(b.is_active) - Number(a.is_active) ||
        b.created_at.localeCompare(a.created_at),
    )
    .map((program) => ({
      id: program.id,
      name: program.name,
      tags: program.tags ?? [],
      weeks: program.weeks ?? 5,
      isActive: program.is_active,
      style: program.style === "fluid" ? "fluid" : "classic",
      dayCount: dayCounts.get(program.id) ?? 0,
      exerciseCount: exerciseCounts.get(program.id) ?? 0,
    }));
}
```

- [ ] **Step 4: Run the focused test**

Run: `npm test -- program-summary`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit summary logic**

```bash
git add src/lib/program-summary.ts src/lib/program-summary.test.ts
git commit -m "feat: aggregate program summaries"
```

---

### Task 3: Batched summary loader

**Files:**
- Modify: `src/lib/program.ts`

- [ ] **Step 1: Add the batched summary loader alongside the current loader**

Add this import near the top of `src/lib/program.ts`:

```ts
import {
  buildProgramSummaries,
  type ProgramSummary,
} from "@/lib/program-summary";
```

Keep `listProgramsFull()` temporarily and add this new loader below it:

```ts
export async function listProgramSummaries(
  supabase: Client,
  userId: string,
): Promise<ProgramSummary[]> {
  const { data: programs } = await supabase
    .from("program")
    .select("id, name, tags, weeks, is_active, style, created_at")
    .eq("user_id", userId);

  if (!programs?.length) return [];

  const { data: days } = await supabase
    .from("program_day")
    .select("id, program_id")
    .in("program_id", programs.map((program) => program.id));

  if (!days?.length) return buildProgramSummaries(programs, [], []);

  const { data: slots } = await supabase
    .from("program_slot")
    .select("program_day_id")
    .in("program_day_id", days.map((day) => day.id));

  return buildProgramSummaries(programs, days, slots ?? []);
}
```

Update the file comment above this function to state that the index uses three batched queries and only `getProgram()` assembles a complete program.

- [ ] **Step 2: Run focused tests and typecheck**

Run:

```bash
npm test -- program-summary
npx tsc --noEmit
```

Expected: summary tests PASS and typecheck exits 0. The current index still uses `listProgramsFull()` until Task 4.

- [ ] **Step 3: Commit the loader**

```bash
git add src/lib/program.ts
git commit -m "feat: load batched program summaries"
```

---

### Task 4: Responsive summary grid

**Files:**
- Create: `src/app/(app)/program/program-tile.tsx`
- Modify: `src/app/(app)/program/program-gallery.tsx`
- Modify: `src/app/(app)/program/page.tsx`
- Modify: `src/lib/program.ts`

- [ ] **Step 1: Create the action-free tile**

Create `src/app/(app)/program/program-tile.tsx`:

```tsx
import Link from "next/link";
import type { ProgramSummary } from "@/lib/program-summary";
import { programDetailHref } from "@/lib/program-routes";
import { cx } from "@/components/ui/cx";

export function ProgramTile({ program }: { program: ProgramSummary }) {
  const title = program.name.trim() || "Untitled program";
  const primaryTag = program.tags[0];

  return (
    <Link
      href={programDetailHref(program.id)}
      className={cx(
        "flex min-h-36 flex-col rounded-card border p-4 transition-[border-color,background-color] hover:border-border-strong active:bg-surface",
        program.isActive ? "border-border-strong" : "border-border",
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="break-words text-heading">{title}</span>
        {program.isActive && (
          <span className="shrink-0 rounded-control border border-border px-2 py-0.5 text-caption font-medium uppercase tracking-wide text-muted">
            active
          </span>
        )}
      </span>

      <span className="mt-auto pt-5 text-caption text-muted">
        {program.dayCount} days/wk · {program.weeks} weeks · {program.exerciseCount} exercises
      </span>

      <span className="mt-2 flex flex-wrap gap-1">
        <span className="rounded-full border border-border px-2 py-0.5 text-caption text-muted">
          {program.style}
        </span>
        {primaryTag && (
          <span className="rounded-full border border-border px-2 py-0.5 text-caption text-muted">
            {primaryTag}
          </span>
        )}
      </span>
    </Link>
  );
}
```

- [ ] **Step 2: Replace expandable gallery state with summary filtering**

Replace `src/app/(app)/program/program-gallery.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ProgramSummary } from "@/lib/program-summary";
import { programNewHref } from "@/lib/program-routes";
import { filterByTag, uniqueTags } from "@/lib/program-tags";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { createFromTemplate } from "./actions";
import { ProgramTile } from "./program-tile";
import { TagFilter } from "./tag-filter";

export interface TemplateSummary {
  id: string;
  name: string;
  dayCount: number;
  tags: string[];
}

export function ProgramGallery({
  programs,
  templates,
}: {
  programs: ProgramSummary[];
  templates: TemplateSummary[];
}) {
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => uniqueTags(programs), [programs]);
  const visible = useMemo(() => filterByTag(programs, tag), [programs, tag]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-display">Programs</h1>
        <Link href={programNewHref()} className={buttonClasses("secondary", "sm")}>
          + New
        </Link>
      </div>

      <TagFilter tags={tags} active={tag} onSelect={setTag} />

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((program) => (
          <li key={program.id}>
            <ProgramTile program={program} />
          </li>
        ))}
      </ul>

      {visible.length === 0 && (
        <p className="text-body text-muted">No programs match this tag.</p>
      )}

      {templates.length > 0 && (
        <div className="mt-4 w-full max-w-page">
          <h2 className="text-heading">Templates</h2>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {templates.map((template) => (
              <li key={template.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-body">{template.name}</div>
                  <div className="text-caption text-muted">
                    {template.dayCount} days/wk · {template.tags.join(" · ")}
                  </div>
                </div>
                <form action={createFromTemplate.bind(null, template.id)}>
                  <Button variant="secondary" size="sm">Add</Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Make `/program` an index-only Server Component**

Replace `src/app/(app)/program/page.tsx` with:

```tsx
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

const TEMPLATE_SUMMARIES: TemplateSummary[] = PROGRAM_TEMPLATES.map((template) => ({
  id: template.id,
  name: template.name,
  dayCount: template.days.length,
  tags: template.tags,
}));

export default async function ProgramPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const programs = await listProgramSummaries(supabase, userId);

  if (programs.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-4 px-6 py-10">
        <div>
          <h1 className="text-display">Build your program</h1>
          <p className="text-body text-muted">Start from a template, or build one from scratch.</p>
        </div>
        <ul className="flex flex-col gap-3">
          {PROGRAM_TEMPLATES.map((template) => (
            <li key={template.id}>
              <form action={createFromTemplate.bind(null, template.id)} className="flex flex-col gap-1">
                <Button size="lg" className="w-full">Start with {template.name}</Button>
                <p className="text-caption text-muted">
                  {template.days.length} days/wk · {template.tags.join(" · ")}
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
```

After the index no longer imports it, delete `listProgramsFull()` from `src/lib/program.ts`.

- [ ] **Step 4: Verify the summary index compiles**

Run:

```bash
npm test -- program-summary program-routes program-tags
npx tsc --noEmit
```

Expected: all focused tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit the loader and index together**

```bash
git add src/lib/program.ts "src/app/(app)/program/page.tsx" "src/app/(app)/program/program-gallery.tsx" "src/app/(app)/program/program-tile.tsx"
git commit -m "feat: render lightweight program tile grid"
```

---

### Task 5: Read-only program detail component

**Files:**
- Create: `src/app/(app)/program/program-detail.tsx`

- [ ] **Step 1: Create the detail component**

Create `src/app/(app)/program/program-detail.tsx` by moving the exercise display helpers from `program-card.tsx` and using this component contract and structure:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Program, ProgramSlot } from "@/lib/program";
import { programEditHref, programIndexHref } from "@/lib/program-routes";
import { PATTERN_LABEL, type Equipment, type ExerciseDef } from "@/lib/strength/coefficients";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { cloneProgram, setActiveProgram } from "./actions";

export function ProgramDetail({
  program,
  defs,
}: {
  program: Program;
  defs: Record<string, ExerciseDef>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const title = program.name.trim() || "Untitled program";
  const exerciseCount = program.days.reduce((count, day) => count + day.slots.length, 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header>
        <Link href={programIndexHref()} className="text-caption text-muted hover:text-foreground">
          ← Programs
        </Link>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-display">{title}</h1>
            <p className="text-body text-muted">
              {program.days.length} days/wk · {program.weeks} weeks · {exerciseCount} exercises · {program.style}
            </p>
          </div>
          {program.isActive && (
            <span className="shrink-0 rounded-control border border-border px-2 py-1 text-caption font-medium uppercase tracking-wide text-muted">
              active
            </span>
          )}
        </div>
        {program.description && (
          <p className="mt-3 whitespace-pre-line text-body text-muted">{program.description}</p>
        )}
        {program.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {program.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-caption text-muted">
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        {program.days.map((day) => (
          <Card key={day.id}>
            <h2 className="break-words text-heading">{day.name}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {day.slots.map((slot) => (
                <li key={slot.id} className="rounded-control bg-surface p-3">
                  <h3 className="break-words text-body font-medium">
                    {defs[slot.exerciseId]?.name ?? slot.exerciseId}
                  </h3>
                  <p className="mt-0.5 text-caption capitalize text-muted">
                    {slotMeta(defs, slot)}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <StaticMetric label="Sets" value={slot.targetSets} />
                    <StaticMetric label="Reps" value={repRange(slot)} />
                    <StaticMetric label="RIR" value={slot.targetRir} />
                  </div>
                </li>
              ))}
              {day.slots.length === 0 && (
                <li className="rounded-control bg-surface p-3 text-body text-muted">No exercises</li>
              )}
            </ul>
          </Card>
        ))}
      </div>

      {program.days.length === 0 && <Card><p className="text-body text-muted">No days</p></Card>}

      <div className="flex flex-wrap gap-2">
        <Link href={programEditHref(program.id)} className={buttonClasses("secondary", "sm")}>
          Edit
        </Link>
        {!program.isActive && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            pending={pending}
            onClick={() => start(async () => {
              await setActiveProgram(program.id);
              router.refresh();
            })}
          >
            Make active
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => start(async () => {
            const id = await cloneProgram(program.id);
            router.push(programEditHref(id));
          })}
        >
          Clone
        </Button>
      </div>
    </div>
  );
}

function StaticMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-center text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="flex h-11 min-w-0 items-center justify-center rounded-control border border-border-strong bg-background px-1 text-center text-sm font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function slotMeta(defs: Record<string, ExerciseDef>, slot: ProgramSlot) {
  const exercise = defs[slot.exerciseId];
  const pattern = PATTERN_LABEL[slot.pattern];
  return exercise ? `${pattern} / ${equipmentLabel(exercise.equipment)}` : pattern;
}

function equipmentLabel(equipment: Equipment) {
  return equipment.replace(/_/g, " ");
}

function repRange(slot: ProgramSlot) {
  return slot.repMin === slot.repMax ? slot.repMin : `${slot.repMin}-${slot.repMax}`;
}
```

- [ ] **Step 2: Typecheck the isolated component**

Run: `npx tsc --noEmit`

Expected: PASS. The component is not routed yet, but all imports and props compile.

- [ ] **Step 3: Commit the detail component**

```bash
git add "src/app/(app)/program/program-detail.tsx"
git commit -m "feat: add read-only program detail view"
```

---

### Task 6: Dedicated create, detail, and edit routes

**Files:**
- Create: `src/app/(app)/program/new/page.tsx`
- Create: `src/app/(app)/program/[id]/page.tsx`
- Modify: `src/app/(app)/program/actions.ts`
- Delete: `src/app/(app)/program/program-card.tsx`

- [ ] **Step 1: Add the new-program route**

Create `src/app/(app)/program/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCatalogMap } from "@/lib/catalog";
import { recentExerciseIds } from "@/lib/program";
import { programIndexHref } from "@/lib/program-routes";
import { createClient } from "@/lib/supabase/server";
import { ProgramBuilder } from "../program-builder";

export default async function NewProgramPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const [recentIds, catalog] = await Promise.all([
    recentExerciseIds(supabase, userId),
    getCatalogMap(supabase, userId),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
      <ProgramBuilder
        initial={null}
        recentIds={recentIds}
        catalog={Object.values(catalog)}
        afterSaveHref={programIndexHref()}
        cancelHref={programIndexHref()}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the dynamic detail/edit route**

Create `src/app/(app)/program/[id]/page.tsx` using the Next.js 16 async `params` and `searchParams` contract:

```tsx
import { notFound, redirect } from "next/navigation";
import { getCatalogMap } from "@/lib/catalog";
import { getProgram, recentExerciseIds } from "@/lib/program";
import { programDetailHref } from "@/lib/program-routes";
import { createClient } from "@/lib/supabase/server";
import { ProgramBuilder } from "../program-builder";
import { ProgramDetail } from "../program-detail";

export default async function ProgramDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const [{ id }, { mode }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  const program = await getProgram(supabase, userId, id);
  if (!program) notFound();

  if (mode === "edit") {
    const [recentIds, catalog] = await Promise.all([
      recentExerciseIds(supabase, userId),
      getCatalogMap(supabase, userId),
    ]);
    const detailHref = programDetailHref(program.id);
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <ProgramBuilder
          initial={program}
          recentIds={recentIds}
          catalog={Object.values(catalog)}
          afterSaveHref={detailHref}
          cancelHref={detailHref}
        />
      </div>
    );
  }

  const catalog = await getCatalogMap(supabase, userId);
  return <ProgramDetail program={program} defs={catalog} />;
}
```

- [ ] **Step 3: Preserve metadata in Clone and revalidate detail routes**

In `src/app/(app)/program/actions.ts`, import `programDetailHref`:

```ts
import { programDetailHref } from "@/lib/program-routes";
```

After `revalidatePath("/program")` in `saveProgram`, add:

```ts
revalidatePath(programDetailHref(input.id));
```

After `revalidatePath("/program")` in `setActiveProgram`, add:

```ts
revalidatePath(programDetailHref(id));
```

Change Clone's source select to:

```ts
.select("name, description, tags, weeks, style")
```

Change the cloned program insert to:

```ts
.insert({
  user_id: userId,
  name: `${src.name} (copy)`,
  description: src.description,
  tags: src.tags,
  weeks: src.weeks,
  style: src.style,
  is_active: false,
})
```

Keep day, slot, rest, and plateau-patience copying unchanged.

- [ ] **Step 4: Remove the obsolete expandable card**

Delete `src/app/(app)/program/program-card.tsx`. Confirm no source references remain:

Run: `rg -n "ProgramCard|program-card|expandedId|/program\?id" src`

Expected: no output.

- [ ] **Step 5: Verify route and type contracts**

Run:

```bash
npm test -- program-routes program-summary program-tags
npx tsc --noEmit
npm run lint
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit the route migration**

```bash
git add "src/app/(app)/program/new/page.tsx" "src/app/(app)/program/[id]/page.tsx" "src/app/(app)/program/actions.ts" "src/app/(app)/program/program-card.tsx"
git commit -m "feat: route programs through dedicated detail screens"
```

---

### Task 7: Documentation and end-to-end verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/FEATURES.md`
- Modify: `docs/DECISIONS.md`

- [ ] **Step 1: Update current architecture documentation**

In `CLAUDE.md`, replace the Program loader and Program page sections with concise text stating:

```md
### Program loader (`src/lib/program.ts`)

`getProgram` assembles one complete program for home, detail, edit, and session flows.
`listProgramSummaries` powers `/program` with three batched queries (programs, days, slots)
and returns counts without assembling every program tree. Pure aggregation and ordering live
in `src/lib/program-summary.ts`: active first, then newest first.

### Program routes (`src/app/(app)/program/`)

`/program` is a filterable responsive grid of linked summary tiles. Tiles show essential
metadata only and contain no actions. `/program/[id]` is the read-only full program view;
`/program/[id]?mode=edit` edits that program; `/program/new` creates one. Save/cancel from
an existing edit returns to detail. Edit, Make active, and Clone live on detail. Templates
remain a compact list below the owned-program grid.
```

In `README.md`, replace the expandable-gallery architecture bullet with:

```md
- `src/app/(app)/program/` — summary tile grid + dedicated read-only detail route + builder (Classic/Adaptive style, catalog-driven picker, custom exercises, server actions)
```

In `docs/FEATURES.md`, replace the Programs Gallery bullets and Builder heading with:

```md
### Program grid and detail
- **Responsive program grid** — active program first, then newest first; tiles show days,
  weeks, exercise count, style, and primary tag.
- **Tag filter** — single-select filtering over all program tags.
- **Dedicated detail screen** — `/program/[id]` shows description, tags, and a responsive
  day grid with Edit, Make active, and Clone actions.
- **Templates** — creation shortcuts remain separate below owned programs.

### Builder (`/program/new`, `/program/[id]?mode=edit`)
```

Append this superseding decision to `docs/DECISIONS.md` after the existing Phase A decisions; do not rewrite the historical record:

```md
## Program grid navigation (2026-07-03)

**Dedicated summary and detail paths supersede inline expansion.** `/program` now loads
batched summaries and renders linked tiles; `/program/[id]` loads one full program. This
reverses the earlier full-gallery assembly decision because inline expansion created large
cards and avoidable scroll friction. Actions live on detail, edit remains explicit, and no
schema change is required.
```

- [ ] **Step 2: Run complete automated verification**

Run:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all Vitest tests pass, TypeScript and ESLint exit 0, and Next.js 16 completes a production build with `/program`, `/program/new`, and `/program/[id]` in the route output.

- [ ] **Step 3: Run browser verification at phone and desktop widths**

Start the app with `npm run dev`. Verify these exact flows:

1. `/program` shows one tile column at 390px and two columns at 768px or wider.
2. The active tile is first; remaining tiles are newest first.
3. Keyboard Tab visibly focuses the whole tile; Enter opens `/program/[id]`.
4. Tag filtering changes only the saved-program grid; templates remain separate.
5. Detail shows all metadata, all tags, and one/two day columns at the same breakpoints.
6. Edit opens `?mode=edit`; Save and Cancel return to `/program/[id]`.
7. Make active removes its own button after refresh and pins the program first on return.
8. Clone opens `/program/[clone-id]?mode=edit` and retains description, tags, days, slots, rest overrides, and plateau patience.
9. `/program/new` saves back to `/program`; template Add returns to `/program`.
10. An unknown UUID under `/program/[id]` renders the normal not-found screen.

- [ ] **Step 4: Confirm only intended files changed**

Run:

```bash
git status --short
git diff --check
```

Expected: only the documented implementation files are modified; the user's pre-existing `AGENTS.md` change remains untouched.

- [ ] **Step 5: Commit documentation**

```bash
git add CLAUDE.md README.md docs/FEATURES.md docs/DECISIONS.md
git commit -m "docs: record program grid navigation"
```

- [ ] **Step 6: Run the ship-phase closeout before claiming completion**

Use the repository's `ship-phase` skill to refresh `.claude/LAST_SESSION.md`, run its final validation, review the complete diff, and create the final implementation commit only if that workflow finds uncommitted implementation changes. Do not include the user's unrelated `AGENTS.md` modification.
