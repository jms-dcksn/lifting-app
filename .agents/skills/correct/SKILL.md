---
name: correct
description: Use when agents repeat the same mistake. Make the next copy fail a check, type, or script before you add more instructions.
---

# Correct

Adapted from Lauren Tan's pstack (MIT). See ../PSTACK-LICENSE and ../NOTICE.

The same agent mistake keeps showing up. Change the repo so the next agent cannot make it. Assume the next agent sees only the files it opened, copies the nearest example, and takes the shortest path that compiles.

You are one agent. Do not wait for a live operator. The correction is the task, the review comment, or the incident already in front of you. Proceed on a reversible check. A new public behavior, a hosted database change, or a new CI workflow needs a Decision Card first. Do not run `npx supabase db push`.

## Find the class

Read recent commits, reverts, review notes, and `AGENTS.md`. Group the mistakes. A class counts once it has happened twice, or once when the owner already named it as an incident.

## Fix at the highest level that works

1. **Architecture.** Give each piece of state one owner and each task one supported way. Delete the old path an agent would copy.
2. **Types, then a lint or a script** whose error names the file or function to use instead. If the bad pattern is already common, fail when a change adds more of it.
3. **A behavior test.** Fix or delete a test that still passes when the behavior breaks, or that fails when only internals change.
4. **Docs last**, and only for a judgment call. Nothing fails when an agent skips a paragraph.

## Worked example

PR #188 is the model. A migration was merged and never applied to the live database, so production could ship code that the schema did not have. The lesson is not another reminder. `scripts/check-hosted-migrations.ts` runs before `next build` and exits 1 when a file in `supabase/migrations` is missing from the hosted ledger or is not named `<version>_<name>.sql`. The error tells the human to run `npx supabase db push` from a linked checkout of `main` and redeploy. CI, local, and preview builds do not call the hosted project. Copy that shape: a check that fails on the real past mistake, with the repair named in the output. This skill does not authorize running that push.

## Prove it

Show the new check failing on a real past mistake, or on a fixture that is the same shape, and then passing once the mistake is gone. Run the same command a reviewer can re-run. An exception sits on the offending line with a reason. Do not add a silent allowlist.

## Where the rule lives

If the rule is already in `AGENTS.md` and nothing enforces it, that is a repeat. Fix it at the highest level in the same change. Drop a written rule once the mistake can no longer be expressed. Do not grow `AGENTS.md` with a second copy of a check that already fails the build.
