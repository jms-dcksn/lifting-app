# Program Gallery + Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/program` into a card gallery where each program card expands inline to show full detail, and give programs a description plus user-defined tags with a chip filter.

**Architecture:** All of the user's programs are assembled server-side (a handful per user — full assembly is cheap) and handed to a client gallery that owns expand-state and the active tag filter. Tagging and description are edited in the existing builder and persisted on the program row. The standalone read-only `ProgramView` and the flat `ProgramList` are retired; their detail rendering moves into the expandable card.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions), React 19, Supabase (Postgres + RLS), Tailwind v4 design tokens, vitest for pure logic. This is Phase A of the spec `docs/superpowers/specs/2026-06-20-program-gallery-tags-rest-timer-design.md`. Phase B (rest timer) is a separate plan.

**Deviation from spec, noted:** the `program` table already has an unused `notes text` column (present only in generated types, never read or written in app code). Rather than add a redundant `description` column, this plan **renames `notes` → `description`**. The collapsed-card day count comes from the assembled `program.days.length`, so the spec's `dayCount` addition to `listPrograms` is replaced by a `listProgramsFull` that assembles every program (the spec's approach (a)).

---

## File map

- `supabase/migrations/0006_program_metadata.sql` — **create**: rename `notes`→`description`, add `tags text[]`.
- `src/lib/supabase/types.ts` — **modify**: program Row/Insert/Update (`notes`→`description`, add `tags`).
- `src/lib/program-tags.ts` — **create**: pure tag helpers (`normalizeTags`, `uniqueTags`, `filterByTag`).
- `src/lib/program-tags.test.ts` — **create**: vitest for the helpers.
- `src/lib/program.ts` — **modify**: `Program` gains `description`/`tags`; `assemble` selects them; add `listProgramsFull`.
- `src/app/(app)/program/actions.ts` — **modify**: `SaveProgramInput` gains `description`/`tags`; `saveProgram` persists them.
- `src/app/(app)/program/tag-input.tsx` — **create**: chip input control for the builder.
- `src/app/(app)/program/program-builder.tsx` — **modify**: blank-program defaults + metadata block (description + tags) + pass through on save.
- `src/app/(app)/program/program-card.tsx` — **create**: collapsed + inline-expanded card (absorbs ProgramView's detail render).
- `src/app/(app)/program/tag-filter.tsx` — **create**: single-select chip filter row.
- `src/app/(app)/program/program-gallery.tsx` — **create**: client gallery owning expand + filter state.
- `src/app/(app)/program/page.tsx` — **modify**: render gallery; route builder by `id`/`mode`.
- `src/app/(app)/program/program-view.tsx` — **delete**.
- `src/app/(app)/program/program-list.tsx` — **delete**.
- `CLAUDE.md` — **modify**: update the program-page architecture notes.

---

## Task 1: Migration + generated types

**Files:**
- Create: `supabase/migrations/0006_program_metadata.sql`
- Modify: `src/lib/supabase/types.ts:110-138` (program Row/Insert/Update)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_program_metadata.sql`:

```sql
-- Program metadata: reuse the unused `notes` column as a description, add free-text tags.
alter table public.program rename column notes to description;
alter table public.program add column tags text[] not null default '{}';
```

- [ ] **Step 2: Apply the migration to the Supabase project**

Apply via the Supabase MCP `apply_migration` tool (name `program_metadata`) or, if the CLI is linked, `supabase db push`. Confirm success before continuing.

- [ ] **Step 3: Update generated types by hand**

In `src/lib/supabase/types.ts`, in the `program` table block (around lines 110-138), rename every `notes` field to `description` and add a `tags` field. Result:

```ts
      program: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          tags: string[]
          user_id: string
          weeks: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tags?: string[]
          user_id: string
          weeks?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tags?: string[]
          user_id?: string
          weeks?: number | null
        }
        Relationships: []
      }
```

Leave the other table's `notes` columns (e.g. `set_log`/`workout_session` around line 329) untouched.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no references to `program.notes` exist in app code, so nothing else breaks).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_program_metadata.sql src/lib/supabase/types.ts
git commit -m "feat: program description (from notes) + tags columns"
```

---

## Task 2: Pure tag helpers (TDD)

**Files:**
- Create: `src/lib/program-tags.ts`
- Test: `src/lib/program-tags.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/program-tags.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeTags, uniqueTags, filterByTag } from "./program-tags";

describe("normalizeTags", () => {
  it("trims, drops empties, and dedupes case-insensitively keeping first form", () => {
    expect(normalizeTags(["  Push ", "push", "", "  ", "Pull"])).toEqual(["Push", "Pull"]);
  });
  it("returns an empty array for no input", () => {
    expect(normalizeTags([])).toEqual([]);
  });
});

describe("uniqueTags", () => {
  it("returns the sorted union across programs, case-insensitively deduped", () => {
    const programs = [
      { tags: ["hypertrophy", "ppl"] },
      { tags: ["PPL", "strength"] },
      { tags: [] },
    ];
    expect(uniqueTags(programs)).toEqual(["hypertrophy", "ppl", "strength"]);
  });
});

describe("filterByTag", () => {
  const programs = [
    { id: "a", tags: ["ppl"] },
    { id: "b", tags: ["strength"] },
    { id: "c", tags: ["PPL", "strength"] },
  ];
  it("returns all programs when tag is null", () => {
    expect(filterByTag(programs, null).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
  it("matches case-insensitively", () => {
    expect(filterByTag(programs, "ppl").map((p) => p.id)).toEqual(["a", "c"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- program-tags`
Expected: FAIL — `Cannot find module './program-tags'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/program-tags.ts`:

```ts
// Pure tag helpers shared by the program gallery and builder. Tags are free text;
// dedupe is case-insensitive but preserves the first-seen capitalization.

export function normalizeTags(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function uniqueTags(programs: { tags: string[] }[]): string[] {
  const union = normalizeTags(programs.flatMap((p) => p.tags));
  return union.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

export function filterByTag<T extends { tags: string[] }>(
  programs: T[],
  tag: string | null,
): T[] {
  if (!tag) return programs;
  const key = tag.toLowerCase();
  return programs.filter((p) => p.tags.some((t) => t.toLowerCase() === key));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- program-tags`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/program-tags.ts src/lib/program-tags.test.ts
git commit -m "feat: pure tag normalize/union/filter helpers"
```

---

## Task 3: Program loader — description, tags, and full assembly

**Files:**
- Modify: `src/lib/program.ts`

- [ ] **Step 1: Add `description`/`tags` to the `Program` interface**

In `src/lib/program.ts`, extend the `Program` interface (around lines 28-34):

```ts
export interface Program {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  weeks: number;
  isActive: boolean;
  days: ProgramDay[];
}
```

- [ ] **Step 2: Select and pass the new columns through `assemble`**

Change `assemble`'s `row` parameter type and return value. Replace the signature (lines 36-39) and the final `return` (lines 70-80):

```ts
async function assemble(
  supabase: Client,
  row: {
    id: string;
    name: string;
    description: string | null;
    tags: string[];
    weeks: number | null;
    is_active: boolean;
  },
): Promise<Program> {
```

and the return:

```ts
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: row.tags ?? [],
    weeks: row.weeks ?? 5,
    isActive: row.is_active,
    days: (days ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      slots: slotsByDay.get(d.id) ?? [],
    })),
  };
```

- [ ] **Step 3: Update the column selection in `getActiveProgram` and `getProgram`**

In both functions, change the `.select(...)` string from
`"id, name, weeks, is_active"` to
`"id, name, description, tags, weeks, is_active"`.

- [ ] **Step 4: Replace `listPrograms` with `listProgramsFull`**

Delete the existing `listPrograms` function (lines 112-127) and add a full-assembly version that the gallery uses:

```ts
// Every program for a user, fully assembled (days + slots), created-order. The gallery
// expands cards inline, so it needs the full tree up front; users have only a handful of
// programs, so assembling all is cheap.
export async function listProgramsFull(
  supabase: Client,
  userId: string,
): Promise<Program[]> {
  const { data: rows } = await supabase
    .from("program")
    .select("id, name, description, tags, weeks, is_active")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return Promise.all((rows ?? []).map((row) => assemble(supabase, row)));
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in `program/page.tsx` (still importing `listPrograms`) — that is fixed in Task 9. If you are running tasks out of order, expect this import to resolve once Task 9 lands.

- [ ] **Step 6: Commit**

```bash
git add src/lib/program.ts
git commit -m "feat: load program description/tags + listProgramsFull"
```

---

## Task 4: Persist description + tags on save

**Files:**
- Modify: `src/app/(app)/program/actions.ts`

- [ ] **Step 1: Extend `SaveProgramInput`**

In `src/app/(app)/program/actions.ts`, add fields to the interface (lines 32-37):

```ts
export interface SaveProgramInput {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  weeks: number;
  days: SaveDayInput[];
}
```

- [ ] **Step 2: Persist them in `saveProgram`**

Add the import at the top of the file:

```ts
import { normalizeTags } from "@/lib/program-tags";
```

Then in `saveProgram`, after `const weeks = ...` (line 50), normalize the new fields and include them in the program upsert (lines 59-61):

```ts
  const description = input.description?.trim() || null;
  const tags = normalizeTags(input.tags);

  // ... (the "clear others" update is unchanged) ...

  const { error: progErr } = await supabase
    .from("program")
    .upsert({ id: input.id, user_id: userId, name, description, tags, weeks, is_active: true });
  if (progErr) throw new Error(progErr.message);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: a type error at the `saveProgram(...)` call in `program-builder.tsx` (it does not yet pass `description`/`tags`) — fixed in Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/program/actions.ts
git commit -m "feat: saveProgram persists description + tags"
```

---

## Task 5: Builder metadata block (description + tag input)

**Files:**
- Create: `src/app/(app)/program/tag-input.tsx`
- Modify: `src/app/(app)/program/program-builder.tsx`

- [ ] **Step 1: Create the tag input control**

Create `src/app/(app)/program/tag-input.tsx`:

```tsx
"use client";

import { useState } from "react";
import { normalizeTags } from "@/lib/program-tags";

// Chip input: type a tag and press Enter or comma to add; × removes; Backspace on an empty
// field removes the last chip. Values are normalized (trim/dedupe) on every change.
export function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState("");

  function commit(raw: string) {
    const next = normalizeTags([...value, raw]);
    onChange(next);
    setText("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-control border border-border-strong bg-transparent p-2">
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full border border-border-strong px-2 py-1 text-caption font-medium"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="text-muted active:text-foreground"
          >
            ✕
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            if (text.trim()) commit(text);
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => text.trim() && commit(text)}
        placeholder={value.length ? "Add tag" : "Add tags (e.g. hypertrophy)"}
        enterKeyHint="done"
        autoComplete="off"
        className="h-8 min-w-24 flex-1 bg-transparent px-1 text-body outline-none"
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire description + tags into the builder draft**

In `src/app/(app)/program/program-builder.tsx`:

Add the import near the other local imports:

```tsx
import { TagInput } from "./tag-input";
```

Update `blankProgram` (lines 19-21) to include the new fields:

```tsx
function blankProgram(): Program {
  return { id: uid(), name: "", description: null, tags: [], weeks: 5, isActive: true, days: [] };
}
```

- [ ] **Step 3: Render the metadata block**

In the builder's header block (the `<div className="flex w-full max-w-page flex-col gap-3">` at lines 166-189), add a description textarea and the tag input after the name `<Input>` and before the weeks row:

```tsx
        <textarea
          value={draft.description ?? ""}
          onChange={(e) =>
            update((d) => ({ ...d, description: e.target.value || null }))
          }
          placeholder="Description (optional)"
          rows={2}
          className="w-full resize-none rounded-control border border-border-strong bg-transparent p-2 text-body outline-none"
        />
        <TagInput
          value={draft.tags}
          onChange={(tags) => update((d) => ({ ...d, tags }))}
        />
```

- [ ] **Step 4: Pass description + tags on save**

In `handleSave`, extend the `saveProgram({ ... })` payload (lines 132-149) to include the new fields alongside `name`/`weeks`:

```tsx
        await saveProgram({
          id: draft.id,
          name: draft.name,
          description: draft.description,
          tags: draft.tags,
          weeks: draft.weeks,
          days: draft.days.map<SaveDayInput>((d) => ({
```

(the rest of the payload is unchanged)

- [ ] **Step 5: Verify build + typecheck**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Manual check**

Run `npm run dev`, open `/program?id=new`, confirm the description textarea and tag chips render, that Enter/comma adds a chip, × removes one, and saving persists them (reopen the program to verify). Note: the gallery does not exist yet, so after save you land on `/` (current `afterSaveHref`) — that is fixed in Task 9.

- [ ] **Step 7: Commit**

```bash
git add src/app/(app)/program/tag-input.tsx src/app/(app)/program/program-builder.tsx
git commit -m "feat: edit program description + tags in the builder"
```

---

## Task 6: Program card (collapsed + inline-expanded)

**Files:**
- Create: `src/app/(app)/program/program-card.tsx`

This card absorbs the day/slot rendering from the soon-to-be-deleted `ProgramView`.

- [ ] **Step 1: Create the card**

Create `src/app/(app)/program/program-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Program, ProgramSlot } from "@/lib/program";
import {
  EXERCISE_BY_ID,
  PATTERN_LABEL,
  type Equipment,
} from "@/lib/strength/coefficients";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { Card } from "@/components/ui/card";
import { cloneProgram, setActiveProgram } from "./actions";

export function ProgramCard({
  program,
  expanded,
  onToggle,
}: {
  program: Program;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const title = program.name.trim() || "Untitled program";
  const editHref = `/program?id=${encodeURIComponent(program.id)}&mode=edit`;

  return (
    <Card tone={program.isActive ? "active" : "default"} className="p-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start justify-between gap-3 p-4 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="break-words text-heading">{title}</span>
            {program.isActive && <ActivePill />}
          </span>
          <span className="mt-0.5 block text-caption text-muted">
            {program.weeks} wk · {program.days.length}{" "}
            {program.days.length === 1 ? "day" : "days"}
          </span>
          {program.tags.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1">
              {program.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border px-2 py-0.5 text-caption text-muted"
                >
                  {tag}
                </span>
              ))}
            </span>
          )}
        </span>
        <span aria-hidden className="shrink-0 text-muted">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="animate-row-in border-t border-border p-4">
          {program.description && (
            <p className="mb-4 whitespace-pre-line text-body text-muted">
              {program.description}
            </p>
          )}

          <div className="flex flex-col gap-4">
            {program.days.map((day) => (
              <div key={day.id}>
                <h3 className="break-words text-body font-semibold">{day.name}</h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {day.slots.map((slot) => (
                    <li key={slot.id} className="rounded-control bg-surface p-3">
                      <h4 className="break-words text-body font-medium">
                        {exerciseName(slot.exerciseId)}
                      </h4>
                      <p className="mt-0.5 text-caption capitalize text-muted">{slotMeta(slot)}</p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <StaticMetric label="Sets" value={slot.targetSets} />
                        <StaticMetric label="Reps" value={repRange(slot)} />
                        <StaticMetric label="RIR" value={slot.targetRir} />
                      </div>
                    </li>
                  ))}
                  {day.slots.length === 0 && (
                    <li className="rounded-control bg-surface p-3 text-body text-muted">
                      No exercises
                    </li>
                  )}
                </ul>
              </div>
            ))}
            {program.days.length === 0 && <p className="text-body text-muted">No days</p>}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={editHref} className={buttonClasses("secondary", "sm")}>
              Edit
            </Link>
            {!program.isActive && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  pending={pending}
                  onClick={() =>
                    start(async () => {
                      await setActiveProgram(program.id);
                      router.refresh();
                    })
                  }
                >
                  Make active
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const id = await cloneProgram(program.id);
                      router.push(`/program?id=${id}&mode=edit`);
                    })
                  }
                >
                  Clone
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function ActivePill() {
  return (
    <span className="rounded-control border border-border px-2 py-0.5 text-caption font-medium uppercase tracking-wide text-muted">
      active
    </span>
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

function exerciseName(id: string) {
  return EXERCISE_BY_ID[id]?.name ?? id;
}

function slotMeta(slot: ProgramSlot) {
  const exercise = EXERCISE_BY_ID[slot.exerciseId];
  const pattern = PATTERN_LABEL[slot.pattern];
  if (!exercise) return pattern;
  return `${pattern} / ${equipmentLabel(exercise.equipment)}`;
}

function equipmentLabel(equipment: Equipment) {
  return equipment.replace(/_/g, " ");
}

function repRange(slot: ProgramSlot) {
  return slot.repMin === slot.repMax ? slot.repMin : `${slot.repMin}-${slot.repMax}`;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from this file (page.tsx errors from Task 3 may still be present until Task 9).

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/program/program-card.tsx
git commit -m "feat: expandable program card"
```

---

## Task 7: Tag filter row

**Files:**
- Create: `src/app/(app)/program/tag-filter.tsx`

- [ ] **Step 1: Create the filter**

Create `src/app/(app)/program/tag-filter.tsx`:

```tsx
"use client";

// Single-select chip filter. "All" clears; tapping a tag filters the gallery to programs
// carrying it. Renders nothing when there are no tags.
export function TagFilter({
  tags,
  active,
  onSelect,
}: {
  tags: string[];
  active: string | null;
  onSelect: (tag: string | null) => void;
}) {
  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Chip selected={active === null} onClick={() => onSelect(null)}>
        All
      </Chip>
      {tags.map((tag) => (
        <Chip key={tag} selected={active === tag} onClick={() => onSelect(tag)}>
          {tag}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={
        "rounded-full border px-3 py-1 text-caption font-medium transition-colors " +
        (selected
          ? "border-foreground bg-foreground text-background"
          : "border-border-strong text-muted active:bg-surface")
      }
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/program/tag-filter.tsx
git commit -m "feat: program tag filter chips"
```

---

## Task 8: Program gallery (state owner)

**Files:**
- Create: `src/app/(app)/program/program-gallery.tsx`

- [ ] **Step 1: Create the gallery**

Create `src/app/(app)/program/program-gallery.tsx`:

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/program/program-gallery.tsx
git commit -m "feat: program gallery with tag filter + expandable cards"
```

---

## Task 9: Rewire the page; retire ProgramView + ProgramList

**Files:**
- Modify: `src/app/(app)/program/page.tsx`
- Modify: `src/app/(app)/program/program-builder.tsx` (save/cancel hrefs)
- Delete: `src/app/(app)/program/program-view.tsx`, `src/app/(app)/program/program-list.tsx`

- [ ] **Step 1: Rewrite `page.tsx`**

Replace the whole file `src/app/(app)/program/page.tsx` with:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getProgram,
  listProgramsFull,
  recentExerciseIds,
  type Program,
} from "@/lib/program";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-styles";
import { ProgramBuilder } from "./program-builder";
import { ProgramGallery } from "./program-gallery";
import { createFromTemplate } from "./actions";

export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; mode?: string }>;
}) {
  const { id, mode } = await searchParams;
  const isNew = id === "new";
  const isEdit = !!id && !isNew && mode === "edit";
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");

  // Builder: new program or editing an existing one.
  if (isNew || isEdit) {
    const recent = await recentExerciseIds(supabase, userId);
    let initial: Program | null = null;
    if (isEdit) initial = await getProgram(supabase, userId, id!);
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
        <ProgramBuilder
          key={isNew ? "new" : (initial?.id ?? "new")}
          initial={isNew ? null : initial}
          recentIds={recent}
          afterSaveHref="/program"
          cancelHref="/program"
        />
      </div>
    );
  }

  // Gallery (default).
  const programs = await listProgramsFull(supabase, userId);

  // First run, no programs: offer the template before showing a blank builder.
  if (programs.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-page flex-1 flex-col gap-4 px-6 py-10">
        <div>
          <h1 className="text-display">Build your program</h1>
          <p className="text-body text-muted">Start from a template, or build one from scratch.</p>
        </div>
        <form action={createFromTemplate}>
          <Button size="lg" className="w-full">
            Start with Push / Pull / Legs
          </Button>
        </form>
        <a href="/program?id=new" className={buttonClasses("secondary", "lg", "w-full")}>
          Build from scratch
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
      <ProgramGallery programs={programs} />
    </div>
  );
}
```

- [ ] **Step 2: Delete the retired components**

```bash
git rm src/app/(app)/program/program-view.tsx src/app/(app)/program/program-list.tsx
```

- [ ] **Step 3: Confirm no dangling references**

Run: `grep -rn "ProgramView\|ProgramList\|listPrograms\b" src/`
Expected: no matches (all were only referenced by the old `page.tsx`).

- [ ] **Step 4: Build, lint, typecheck, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 5: Manual end-to-end check**

Run `npm run dev`:
- `/program` shows the gallery; the active program's card starts expanded with its `active` pill.
- Tapping a collapsed card expands it (and collapses any other); tapping again collapses.
- The tag filter row appears only when a program has tags; selecting a tag filters; "All" clears.
- `Edit` opens the builder; saving returns to `/program`; `Make active` / `Clone` work from an inactive card.
- A brand-new account (no programs) still sees the template offer.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: gallery-first program page; retire ProgramView + ProgramList"
```

---

## Task 10: Refresh docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the program-page architecture notes**

In `CLAUDE.md`, update the "Program loader" and program-page sections to reflect:
- `listPrograms` is replaced by `listProgramsFull` (full assembly for the gallery); `Program` now carries `description` + `tags`.
- `/program` is a gallery of expandable `ProgramCard`s (`program-gallery.tsx` owns expand + single-select tag-filter state via `tag-filter.tsx`); `program-card.tsx` holds the inline detail render that used to live in the deleted `ProgramView`. `program-list.tsx` is also deleted.
- Tags are free text on `program.tags` (migration `0006`, which also renamed the dead `notes` column to `description`); editing happens in the builder via `tag-input.tsx`; `src/lib/program-tags.ts` holds the pure `normalizeTags`/`uniqueTags`/`filterByTag` helpers (unit-tested).

Keep edits concise and in the existing voice.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: program gallery + tags architecture notes"
```

---

## Self-review notes

- **Spec coverage:** gallery (Tasks 8-9), inline expand + active pill + edit/make-active/clone (Task 6), tags storage (Task 1) + edit (Task 5) + filter (Tasks 7-8), description (Tasks 1, 3, 4, 5, 6), retire ProgramView (Task 9), first-run template preserved (Task 9). Rest timer is intentionally out of this plan (Phase B).
- **Deviations from spec, both deliberate and noted in the header:** reuse `notes`→`description` instead of a new column; `listProgramsFull` (assemble-all, spec approach (a)) instead of `listPrograms` + `dayCount`.
- **Type consistency:** `Program` (with `description`/`tags`) is the single shape flowing through `listProgramsFull` → `ProgramGallery` → `ProgramCard`; `normalizeTags`/`uniqueTags`/`filterByTag` signatures are used exactly as defined in Task 2; `SaveProgramInput` gains the same `description: string | null` / `tags: string[]` used by the builder payload.
- **Out of scope (per spec):** `saveProgram` atomicity (still ~7 sequential calls), normalized tag table, multi-select filtering.
