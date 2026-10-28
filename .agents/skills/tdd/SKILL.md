---
name: tdd
description: Use when a bug or behavior change has a cheap local test seam. State the seam in the PR. Do not stop to ask.
---

# TDD

Adapted from Lauren Tan's pstack (MIT). See ../PSTACK-LICENSE and ../NOTICE.

When a change has a clear, cheap test path, make the broken or missing behavior fail before you change production code. The test encodes intended behavior. It fails before the fix and passes after it.

Do not force a test when it would be impractical. Skip a new test when it needs a hosted database, production data, a full browser journey, brittle mocks, or a large unrelated fixture. Say that in the PR and use the closest check from `verify-change`.

Never stop to ask which seam to use. Pick the narrowest practical one, name it in the PR, and proceed.

## Seam in this repo

Prefer an existing Vitest file next to the code: `src/lib/**/*.test.ts`. Good cheap seams include progression and target helpers, the migration-gate decision, and other pure strength-engine functions. Co-locate a new test there. Do not invent a second test runner.

## Workflow

1. Name the intended behavior, the current behavior, and the smallest reproduction.
2. Choose the narrowest existing seam that reaches that behavior. If none is practical, stop this skill and say why in the PR.
3. Write the smallest test that would catch the bug or lock the new behavior. Drive the public function or module contract, not private helpers.
4. Run that test before the production edit. Confirm it fails for the intended reason. If it passes, or fails for something else, fix the test first.
5. Make the smallest production change that satisfies the test and keeps nearby contracts.
6. Re-run the test and confirm it passes.

## Guardrails

- Do not change a test so it matches a wrong implementation.
- Do not weaken an assertion unless the required behavior actually changed. Say why in the PR.
- Keep the test on the bug or the new behavior. Do not expand fixtures for coverage theater.
- If the bug is flaky, pin the signal (time, seed, order) and name that signal in the PR.
- If the bug is a wider class, land this focused test first. Add sibling cases only when they fail for the same cause.

## Report

In the PR, name the seam, the command that failed before the fix, and the command that passed after. If you could not show a failing-before run, say why and name the check you used instead.
