---
name: typescript-best-practices
description: Use when reading or editing a .ts or .tsx file. Prefer types that make illegal states unwritable.
paths: ["**/*.ts", "**/*.tsx"]
---

# TypeScript best practices

Adapted from Lauren Tan's pstack (MIT). See ../PSTACK-LICENSE and ../NOTICE.

This repo already uses Zod where values cross in from the client, and pure functions in `src/lib` for strength math. Match that. Do not add a second schema library.

| Rule | Summary |
| --- | --- |
| Discriminated unions | Model variants with a shared literal discriminant so impossible states cannot be represented. No optional-field bags. |
| Branded types | Brand a primitive with `& { readonly __brand: "X" }` when mixing them would be a real bug. Validate once at the boundary. A brand comes from a type guard (`input is AgentId`), never from `as`. |
| Constructive modeling | Build the shape so the illegal value cannot be constructed. `[T, ...T[]]` for non-empty. Not a runtime guard repeated at every caller. |
| Simplest total type | Keep `T[]` while every operation on it stays total. Strengthen the type only where the loose type forces `!`, a cast, or a "should never happen" throw. |
| `unknown` over `any` | External data is `unknown`. |
| Schemas before guards | Before a hand-written property walk, use Zod and infer the type (`z.infer`), which this repo already depends on. |
| No `as` casts | Every `as` is a crash waiting. Cast only after validation. |
| Narrowing hierarchy | Discriminant switch, then `in`, then `typeof` / `instanceof`, then a type guard, then `as`. |
| Type guards | Must verify the claim. A lying guard is worse than `as`. Name them `isX` or `hasX`. |
| Exhaustiveness | `const _exhaustive: never = x` in the default arm so a new variant fails the build. |
| `satisfies` over `as` | Checks the value without widening literal types. |
| Boundary validation | Parse where data crosses in, into a named domain type. Trust types inside. Do not re-validate deep in pure helpers. |
| Schema-derived types | Reach for `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited`, and `typeof` before a new interface. |
| Object args | Pass objects, not long positional lists, except on a hot path. |
| Real tests | Do not mock what you can run. Mock at a boundary the production code already has. |
| Structured telemetry | No `console.log` in shipped code. |

Examples: `references/patterns.md`.
