---
name: code-review
description: Use to review a branch or diff for this repo's standards and for the linked issue. Report the two axes separately.
---

# Code review

Review the diff between `HEAD` and a fixed point on two axes. Report them separately. You are one agent. Do not spawn sub-agents, and do not ask for a fixed point when you can compute one.

- **Standards.** Does the diff follow `AGENTS.md` and the Human review section of `docs/VERIFICATION.md`?
- **Spec.** Does the diff do what the linked GitHub issue asked, and nothing it ruled out?

There is no `docs/agents/issue-tracker.md` in this repo. Do not tell anyone to install another skill pack.

## 1. Pin the diff

Use the fixed point the task named (a SHA, branch, tag, or `main`). If none was named, use the merge-base with `origin/main`:

```bash
git fetch origin main
git diff $(git merge-base origin/main HEAD)...HEAD
git log --oneline $(git merge-base origin/main HEAD)..HEAD
```

Confirm the ref resolves and the diff is non-empty before reviewing. An empty diff is the finding. Stop there.

## 2. Find the spec

Look in this order:

1. The issue linked from the task or the PR body.
2. An issue number in the commit messages (`#123`, `Closes #45`). Read it with the read-only `gh` command if you need the body. Do not comment, label, or edit the issue.
3. A spec path the task already pointed at under `docs/`.

If none of those exist, the Spec section is `no spec available`. Do not invent requirements.

## 3. Standards

Read `AGENTS.md` (working rules, hard rules, principles) and `docs/VERIFICATION.md` under Human review. Also read the owning contract the `AGENTS.md` table names for the area you touched.

Hard misses:

- A behavior change with no check that would fail if the behavior broke.
- A symptom guard where the root cause is still in the code.
- A new migration with no PR note that a human must run `npx supabase db push`, or a filename whose prefix is not the ledger version.
- Hosted SQL, a merge, a push to `main`, or a label/issue the task did not ask for.
- A strength or report number recomputed in UI instead of the shared pure helper.
- Historical set identity or bodyweight rewritten while comparing records.
- A duplicated profile table or a command name that is not in `package.json`.

Human-review focus, not a mechanical nit: training policy and numeric interpretation, comparison scope, ownership and RLS, migrations, and external effects. Boundary changes must preserve historical logs. Verification must cover real authorization, not a more privileged fixture.

Skip style nits that ESLint already enforces. A judgment call stays a judgment call. Cite the rule (`AGENTS.md` or `docs/VERIFICATION.md`) and the hunk.

## 4. Report

Write `## Standards` and `## Spec`. Do not merge the findings into one score.

Under Spec: requirements that are missing or partial, behavior the issue did not ask for, and behavior that looks implemented but wrong. Quote the issue line for each.

End with one line per axis: count of findings, and the worst issue on that axis. Do not pick a single winner across axes.
