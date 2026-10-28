---
name: close-session
description: Use after a commit or session that changed the repo, or when asked to close the session or refresh docs.
---

# Close a session

Shared continuity lives in versioned docs, Git history, and the task's issue or PR.
Complete the docs refresh and final report before stopping. A fresh cloud clone needs
no previous session file or Claude hooks to follow this skill.

This skill does not build a feature, tick `docs/PLAN.md`, commit, or write project memory. Those are separate asks.

## 1. See what this session changed

The delta is this conversation's work, not a phase checklist.

- Start with `git status`, current HEAD/branch, and the files and commits changed in this task. Use the assigned issue/PR and relevant owning docs for shared context.
- For a PR, compare against its verified base or merge-base. Otherwise use the session's known starting commit. Separate this session's edits from pre-existing changes.
- `.claude/LAST_SESSION.md` is optional local context. Use it only when its `Branch:` matches the current branch and its `Commit:` exactly matches HEAD. Treat other notes as stale; do not infer task scope from them.
- If the starting point is unknown, report that limit and use the observed task changes; do not invent a previous session or treat all recent commits as this session's work.

For read-only sessions with no changes made by this task, report findings without creating
a handoff or editing docs merely to record the session.

## 2. Refresh the owning docs

Update docs only where this delta makes them wrong or silent about new behavior. `docs/README.md` names the owner; the table in `AGENTS.md` names the task trigger.

- Read the code you are about to describe. Commands come from `package.json`. Paths must exist.
- Edit the owner. Surfaces are `docs/` (the owner is named in `docs/README.md`), `AGENTS.md`, `README.md`, and `DEPLOY.md`. Add a new `AGENTS.md` trigger only when a new task branch appeared. Keep `CLAUDE.md` exactly `@AGENTS.md`.
- Dated plans and files under `docs/superpowers/` are history. Leave them unless this session changed that historical record on purpose.
- Stale docs are defects. Do not record planned work as shipped. Preserve an intentional "out of scope" or "not a foreign key" statement. Do not add a new doc file when an owner already exists. Do not edit application code in this step.
- When code and an explicit decision disagree, flag it. Do not quietly rewrite the decision.
- Record a real decision in `docs/DECISIONS.md` when this session made one that is not already there.
- Apply the working rules already in `AGENTS.md`, including the AI Coach explainer when that area changed.
- List every new or edited file under `supabase/migrations/` in the report with its version prefix and apply status. Status is `unapplied` unless the task already records that a human applied that exact version on the hosted project. Do not query the hosted database and do not run `npx supabase db push`.

Docs freshness is this skill. There is no separate docs-freshness-keeper agent.

No doc edit is a valid result; explain why in the final report. Durable decisions,
changed contracts, and actionable remaining work belong in the owning versioned doc,
not solely in chat or an ignored file. Put validation evidence and task-specific follow-up
in the PR description when creating/updating a PR is already authorized; otherwise include
them in the final report. This skill does not authorize external communication or a push.

## 3. Optional local handoff

For continued work in this checkout, you may overwrite `.claude/LAST_SESSION.md` entirely.
It stays gitignored and is not required in disposable cloud sessions. Record exact HEAD
(`git rev-parse HEAD`) and branch (`git symbolic-ref --short -q HEAD`, or `DETACHED`).
No Stop hook requires this file. It cannot replace the durable docs or final report.

```markdown
# Last session — YYYY-MM-DD

Commit: <full HEAD sha>
Branch: <branch name or DETACHED>

## Done
- <specific behavior, fix, or test, naming the files that matter>

## Docs
- <owning doc and what changed in it>
- or: no doc edit — <why this delta does not change a contract>

## Checks
- <command and result actually run this session>
- or: not run — <what is still unverified>

## Tree
- clean, or the uncommitted paths and what they still are

## Next
- <one next action>
- <open thread, or none>
```

Write it for the next session: what is true now, what was verified, what is still dirty, what to do next. Leave out phase status, estimates, and anything `git log` already says unless the reason is not in the commit.

## Done

Report what changed, the docs touched (or why none), checks passed/failed/blocked,
current HEAD, whether this task's changes are committed, and remaining work. Distinguish
local checks from hosted CI and state whether anything was pushed. If no work remains,
say so rather than inventing a next task. A cloud session's report must stand alone without
access to the ignored handoff.
