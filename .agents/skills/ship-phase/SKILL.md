---
name: ship-phase
description: Use when building or shipping a phase of the MVP build plan for this lifting app. Triggers on "build the next phase", "ship phase N", "build phase N", "/ship-phase", or finishing a chunk of planned work that should be committed. Runs the full build-to-commit ritual end to end.
---

# Ship a Phase

The repeatable turn for this project. Five steps, in order. Do **all** of them — do not stop
after building. Steps 2–5 are not optional even if the user only said "build phase N".

If the user named a phase, build that one. Otherwise read `docs/PLAN.md` and take the next
uncompleted phase.

## 1. Build the phase

- Read `docs/PLAN.md` for the phase's checklist; read `AGENTS.md` for conventions.
- This is Next.js 16 — check `node_modules/next/dist/docs/` before writing framework code.
- Implement every checklist item for the phase. Follow existing patterns; keep code simple.
- Verify before claiming done: `npx tsc --noEmit` and `npm run build` (and `npx tsx --eval`
  sanity checks for any pure strength-engine module). Do not assert success without running them.

## 2. Refresh docs

- Review what changed this phase (files, schema, commands, decisions) and update `docs/`,
  `AGENTS.md`, and `README.md` to stay current.
- Tick the completed items in `docs/PLAN.md` for this phase.

## 3. Stage and commit

- `git status` first. Stage only this phase's work: source, migrations, docs.
- Never stage secrets (`.env.local`) or local-only state (`.claude/LAST_SESSION.md`,
  `.claude/settings.local.json`, `.claude/agent-memory/`). `.gitignore` should already
  exclude these.
- Commit with a descriptive subject + body.

## 4. Reflect and persist learnings

- Look back over the turn. Did anything non-obvious surface — a gotcha, a corrected assumption,
  a decision with a rationale, user feedback on how to work? See
  `references/reflection-checklist.md` for what qualifies (and what does NOT — don't log
  what the repo or git history already records).
- For each durable learning, write/update a file in the project memory directory and add a
  one-line pointer to its `MEMORY.md` index. Follow the memory frontmatter format. Update
  existing files rather than duplicating; delete memories proven wrong.

## 5. Write the session summary

- Overwrite `.claude/LAST_SESSION.md` using `references/session-summary-template.md`.
- It **must** include the line `Commit: <full HEAD sha>` for the most recent commit
  (`git rev-parse HEAD`).
- This file is gitignored (local) and is read at the start of the next session (see AGENTS.md),
  so write it for your future self: what shipped, what's next, any open thread.

## Done

Report a tight summary: phase shipped, what docs changed, the commit sha, any memory written,
and the single next action.
