# Reflection checklist (ship-phase step 4)

After shipping a phase, scan the turn for durable learnings worth persisting to project memory.

## Persist when you find
- A **gotcha** that cost time and would cost it again (a Next.js 16 breaking change, a Supabase
  RLS/trigger quirk, a build-config trap).
- A **corrected assumption** — something you believed that turned out false.
- A **decision with a rationale** that isn't already in `docs/DECISIONS.md` or `SPEC.md`.
- **User feedback on how to work** — a correction or a confirmed-good approach. Record the why.
- A **project fact** not derivable from code or git (a goal, constraint, deferred idea).

## Do NOT persist
- Anything the repo already records: code structure, file locations, schema, past fixes.
- Anything reconstructable from `git log`.
- Conversation-only detail that won't matter next session.
- A restatement of what's already in `docs/` or `CLAUDE.md`.

If asked to remember something the repo already records, save what was *non-obvious* about it
instead — the reasoning, not the fact.

## How
- One fact per file in the project memory directory, with the standard frontmatter
  (`name`, `description`, `metadata.type`: user | feedback | project | reference).
- Add a one-line pointer to `MEMORY.md`. Link related memories with `[[slug]]`.
- Update an existing file rather than creating a near-duplicate. Delete memories proven wrong.
