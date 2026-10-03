---
name: close-session
description: Refresh owning docs and overwrite .claude/LAST_SESSION.md after a working session in this lifting app. Use when a session changes code, tests, or docs; when wrapping up; when the Stop hook says HEAD is missing from LAST_SESSION.md; or when the user says close the session, update last session, keep docs fresh, or record what this session did. Also use it after a small feature, fix, or test change, even if nobody said "phase" or "ship".
---

# Close a session

The next session starts from `.claude/LAST_SESSION.md` and the docs, not from this conversation. Two jobs, in order. Do both before stopping when this skill applies.

This skill does not build a feature, tick `docs/PLAN.md`, commit, or write project memory. Those are separate asks.

## 1. See what this session changed

The delta is this conversation's work, not a phase checklist.

- Read `.claude/LAST_SESSION.md` if it exists. Its `Commit:` line is the previous handoff.
- If that sha is an ancestor of `HEAD`, the committed delta is `git log --oneline <that-sha>..HEAD` plus `git diff <that-sha>..HEAD --stat`.
- Also read `git status`. Uncommitted work is part of the session.
- If there is no previous file, use the commits and files this conversation actually touched, plus `git status`.

Skip the rest only when nothing changed: no new commit, a clean tree, and the existing file already names `HEAD`.

## 2. Refresh the owning docs

Update docs only where this delta makes them wrong or silent about new behavior. `docs/README.md` names the owner; the table in `AGENTS.md` names the task trigger.

- Read the code you are about to describe. Commands come from `package.json`. Paths must exist.
- Edit the owner. Add a new `AGENTS.md` trigger only when a new task branch appeared. Keep `CLAUDE.md` exactly `@AGENTS.md`.
- Dated plans and files under `docs/superpowers/` are history. Leave them unless this session changed that historical record on purpose.
- When code and an explicit decision disagree, flag it. Do not quietly rewrite the decision.
- Record a real decision in `docs/DECISIONS.md` when this session made one that is not already there.
- Apply the working rules already in `AGENTS.md`, including the AI Coach explainer when that area changed.

No doc edit is a valid result. The session file has to say why.

## 3. Overwrite the handoff

Overwrite `.claude/LAST_SESSION.md` entirely. It is gitignored local state; do not stage it. The Stop hook greps for the full `HEAD` sha, so the commit line has to be exact (`git rev-parse HEAD`).

```markdown
# Last session — YYYY-MM-DD

Commit: <full HEAD sha>

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

Report the docs touched, the `Commit:` line, whether the tree is clean, and the single next action.
