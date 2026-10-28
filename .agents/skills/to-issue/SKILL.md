---
name: to-issue
description: Use to draft a spec or issue body for a human to file. Apply no labels, create no issues, and post no comments.
---

# To issue

Draft one spec or issue body for a human to file. This skill does not apply labels, create issues, post comments, or run `gh issue create`. The draft is the deliverable.

Work from the conversation, the code, and `docs/DECISIONS.md`. When `docs/GLOSSARY.md` exists, use its terms. Do not invent a tracker config, a label vocabulary, or a `docs/agents/` layout.

## What the draft must contain

- **Outcome.** What is true when the work is done, from the user's side. Current behavior and desired behavior, including the edge that matters.
- **Acceptance criteria.** Checkboxes a later agent can verify. "It should work" is not a criterion. Each box is an observable result.
- **Boundaries.** What this work will not change. Name the adjacent feature that looks related and is out of scope.
- **Verification.** Which `verify-change` profiles apply, and the test seam if one is cheap. If a migration is in scope, say the human must run `npx supabase db push` after merge and that the agent must not.
- **Decision Card.** `yes` or `no`. If yes, include recommendation, reason, risk, and the decision needed. Use a card for hard-to-reverse architecture, spending, external-facing changes, new scope, or an assumption you could not validate.

Write behavior and interfaces, not a procedure. Do not cite line numbers. A path goes stale; use one only when the identity of that module is the requirement. The brief should still make sense if a file is renamed.

## One body, or slices

Default is one body. If the human asked to split the work, keep the slices inside that same draft. Do not file them.

Each slice is a narrow path that can be verified on its own, names what blocks it, and fits one agent run. A wide mechanical change (a rename that breaks every caller at once) is three draft slices: expand the new form beside the old, migrate callers, then delete the old form. Still one document. Still not filed.

## Where it goes

Put the draft in the reply. If a PR is already open for this task, put the same draft in the PR body. The human files it.

```markdown
## Outcome
<what is true when this is done>

## Acceptance criteria
- [ ] <observable result>

## Boundaries
- <out of scope>

## Verification
- Profiles: <base | agent | database | browser | none>
- Seam: <test file or "none — why">

## Decision Card
no
```
