---
name: show-me-your-work
description: Use for a long unattended run that a reviewer must trust later. Keep one TSV row per decision, with evidence that resolves.
---

# Show me your work

Adapted from Lauren Tan's pstack (MIT). See ../PSTACK-LICENSE and ../NOTICE.

Keep one decision log for a long or unattended run. Skip it for a small, obvious edit. You are one agent. Do not spawn another model to review the log. Audit it yourself against the diff and the commands you actually ran.

## The format

A single TSV file, one row per decision. Cells stay single-line. Evidence is a pointer, not a paragraph.

Copy `references/decision-log-template.tsv` to start. Columns:

- **ts.** ISO8601 timestamp.
- **phase.** The phase or workstream.
- **decision.** What was chosen, one line.
- **why.** The reason in plain words.
- **evidence.** A commit SHA, PR number, `file:line`, command, or artifact path. Never a paragraph.
- **result.** The outcome: `tests green`, `reverted`, `BLOCKED`, `open`.

Append with `scripts/log.sh <logfile> <phase> <decision> <why> <evidence> <result>`. It stamps `ts`, writes the header on first use, and strips tabs and newlines. A bare append is fine if you keep cells on one line.

Log forks, a unit and its check, a revert, and a blocker. Skip trivial edits. When you add to a log that already has rows from another run, the first new row uses phase `start` and its evidence names this run. Read the last rows first so you do not pretend those earlier rows are yours.

## Where it lives

Default path: `decisions.tsv` in the work directory, or `.audit/<task-slug>.tsv` when several efforts run at once. Do not `git add` it unless the task says the reviewer needs the trail in the PR. Prefer evidence from committed checks over a one-off script.

## Rules

- Append-only. A wrong call gets a new row that supersedes it. Never edit or delete a row.
- Do not put secrets, tokens, or hosted connection strings in a cell.

## Audit before you hand back

Walk this run's rows against the diff and the commands you ran.

- Every row maps to a real decision or action.
- Each evidence pointer resolves and shows what the row claims.
- A fork or abandoned approach that shaped the work but is missing is a gap. Add it.

Do not rewrite history. When a row is wrong, append a row that supersedes it and points at the real result.

End the handoff with an **Attention** section. Label it `self-audit` (there is no second model). List weak evidence, skipped checks, and choices that paper over a symptom. "No flags" is allowed only after you looked.

`column -s$'\t' -t decisions.tsv` renders the file in a terminal.
