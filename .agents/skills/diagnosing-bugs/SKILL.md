---
name: diagnosing-bugs
description: Use when something is broken, throwing, failing, or slow. Reproduce, fix the root cause, then verify-change.
---

# Diagnosing bugs

Protocol for a bug or a performance regression in this repo. You are unattended. Do not stop to ask for a hypothesis ranking or a seam. Record what you could not prove in the PR and continue only on evidence you have.

Redact secrets before you paste a command or a log. Write `<REDACTED>` in their place. Quote only the lines that carry the signal.

Domain words come from the code, `docs/DECISIONS.md`, and `docs/GLOSSARY.md` when that file exists. There is no root `CONTEXT.md` and no `docs/adr/` directory.

## 1. Reproduce

Build one command that fails on this bug. Prefer a cheap seam and follow `tdd`: a Vitest file under `src/lib/**/*.test.ts` that asserts the user's symptom. If that seam is impractical (hosted data, a full signed-in journey, a flake you cannot raise), say so in the PR and use the next loop that actually runs: a local script, `node scripts/browser-local.mjs` when the bug is in the authenticated UI, or a captured request replayed through the same function. Do not use the hosted database as the loop.

The loop is done when you have run one command that goes red on this symptom for the reason the user described. Paste the invocation and the redacted result. If you cannot build that loop, stop guessing. List what you tried and what evidence is missing. Do not ship a fix for a cause you did not reproduce.

Shrink the repro until every remaining input is load-bearing. That smaller case becomes the regression test.

## 2. Name the root cause

The symptom is where a wrong state became visible. The root cause is the first place the system did something it should not do, or failed to handle a state it is allowed to be in.

- Ask why at each step until the answer is a wrong decision in the code, not a consequence of an earlier one.
- If the state that blew up is legitimate, handling it there is the fix. If that state should never exist, a guard at the crash site hides the bug. Find what produced the state.
- Guards, retries, swallowed errors, clamped values, and discarded state are the usual ways to hide a bug. A paragraph-long comment justifying a workaround means the code is still wrong.
- When something fails only after a restart, suspect persisted state first.
- Fix every place with the same fault, not only the one that happened to throw.
- If two attempted fixes fail the same check, stop. Write the premise they share and test that premise before a third fix.

State the root cause in one or two sentences in the PR. "Added a null check" is not a root cause.

## 3. Regression test

Turn the minimized repro into a failing test at the seam that sees the real bug, then make it pass. If no such seam exists, say that in the PR. A test that only mocks the crash does not count. Follow `tdd`.

## 4. Verify

Remove temporary logs. Search for any debug prefix you added. Then follow `verify-change`. Do not merge.
