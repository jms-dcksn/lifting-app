# Program transaction atomicity

Investigation of multi-step program mutations for atomic correctness. See issue #56 for context;
implementation work tracked in #57.

## Operations requiring atomicity

### 1. `saveProgram` — builder save

**Current state:** Non-atomic sequence of 7–8 queries (clear active, upsert program, upsert/delete phases, upsert/delete days, upsert/delete slots per day).

**Failure modes:**
- Partial day/slot deletions leave orphaned rows
- Crashed save can leave two programs active (violates partial unique index intent)
- Phase upsert succeeds but subsequent deletion fails → stale phases remain
- Revalidation fires on incomplete state

**Needs atomicity:** Yes. Builder save modifies 4 tables and relies on upsert-then-delete-missing to preserve `set_log.program_slot_id` continuity. Mid-sequence failure breaks program structure.

**Recommendation:** Wrap in RPC with `SECURITY INVOKER`. Input validation (empty days, phase week ranges) remains in Server Action. RPC receives complete tree and executes all writes in one PL/pgSQL transaction.

### 2. `cloneProgram` — duplicate as draft

**Current state:** Non-atomic sequence (select source, insert program, load/insert phases, iterate days with nested slot inserts).

**Failure modes:**
- Partial clone (program exists but days/slots incomplete)
- Aborted iteration leaves trailing days without slots
- No user-visible corruption (clone is always inactive), but UX is broken

**Needs atomicity:** Yes. Partial clone renders the draft unusable and requires manual deletion.

**Recommendation:** Same RPC approach. Alternatively, client-side assembly + reuse `saveProgram` RPC (treats clone as a regular save with new UUIDs). Either works; RPC is simpler.

### 3. `acceptAdaptation` — record fluid proposal

**Current state:** Insert into `movement_adaptation`, then optionally call `swap_session_exercise` RPC.

**Failure modes:**
- Adaptation logged but swap fails → record exists with no session state change
- User sees error, may retry → duplicate adaptation logs (benign but noisy)

**Needs atomicity:** Marginal. The adaptation table is append-only intent, not a cache. A logged acceptance without a corresponding swap is detectable and does not corrupt subsequent folding. However, wrapping both in one RPC would prevent the duplicate-on-retry case.

**Recommendation:** Low priority. If `swap_session_exercise` fails, the Server Action already surfaces the error and does not revalidate. The logged adaptation with failed swap is unusual but recoverable. Consider RPC wrapper only if retry behavior becomes a problem.

### 4. `swapSessionExercise` (program scope) — in-workout swap with program mutation

**Current state:** Already atomic. Implemented as `SECURITY INVOKER` RPC with explicit `FOR UPDATE` locks on session and slot. Updates `workout_session.exercise_swaps` JSON, conditionally updates `program_slot`, conditionally inserts `movement_adaptation` for fluid programs.

**Failure modes:** None. Locking prevents concurrent edits; transaction rollback on error is automatic.

**Needs atomicity:** Already solved.

**Recommendation:** No change needed. This is the reference implementation for other atomic program writes.

### 5. `setActiveProgram` — gallery activate

**Current state:** Two separate updates (clear others, set target).

**Failure modes:**
- First update succeeds, second fails → no active program (violates app invariant)
- Concurrent activations can race (partial unique index eventually enforces one active, but intermediate state is inconsistent)

**Needs atomicity:** Yes. The "single active program" invariant must never show zero or two active programs mid-operation.

**Recommendation:** Wrap in RPC. Minimal: `UPDATE program SET is_active = (id = p_target_id) WHERE user_id = auth.uid()`. Single statement, no explicit transaction block needed.

### 6. `createFromTemplate` — first-run or gallery template addition

**Current state:** Non-atomic sequence (check count, insert program, insert phases, iterate days with nested slot inserts).

**Failure modes:**
- Partial template leaves unusable draft
- First-run template activation can fail mid-insert (violates single-active invariant if prior programs exist)
- Nested iteration aborts mid-day → trailing days without slots

**Needs atomicity:** Yes, same reasons as `cloneProgram` and `saveProgram`.

**Recommendation:** Reuse the unified program-write RPC. Template application becomes: assemble tree → call RPC. First-run activation check remains in Server Action (decides `is_active` boolean before RPC).

## RPC vs interactive transaction

**RPC (stored function) is the only option.** Supabase-js has no interactive transaction API for custom queries; it exposes only read-your-writes semantics within implicit single-query transactions. Multi-statement writes must be server-side functions.

All program mutations use **`SECURITY INVOKER`** (not `DEFINER`). Every RPC query includes explicit `user_id = auth.uid()` predicates. No elevated credential. RLS remains active as defense in depth. This matches the existing `swap_session_exercise` pattern and preserves the established RLS boundary contract.

## Failure UX

**Server Actions already surface RPC errors to the UI.** No new error-handling layer needed. Existing pattern:

1. Server Action validates inputs, rejects trivially bad requests before RPC call
2. RPC raises `exception` with user-facing message on ownership, constraint, or consistency errors
3. Supabase-js call catches and returns `{ error }` in the result
4. Server Action throws, Next.js shows error boundary or form action failure
5. UI component renders the error (e.g., builder save shows banner with retry button)

Atomicity prevents **partial success** (the worst UX: silent corruption). User sees save failure, retries, or cancels. No orphaned rows, no inconsistent program structure, no lost work beyond the rejected operation.

**Long program saves** (many days/slots) remain fast enough for synchronous RPC. The builder caps at 6 days × ~8 slots = ~50 rows max. Postgres bulk insert with upsert-then-delete-missing is sub-100ms. No async job queue or optimistic UI needed.

## RLS

**No new RLS policies required.** Existing table policies (`own rows` on `program`, `program_day`, `program_slot`, `program_phase`) remain unchanged. RPCs use `SECURITY INVOKER` so the caller's RLS policies apply to every query inside the function. Explicit `user_id = auth.uid()` predicates in RPC queries are defensive redundancy, not the primary enforcement mechanism.

**Audit:** Every `SELECT … FOR UPDATE` and `DELETE` in an RPC must include `user_id = auth.uid()` to prevent cross-user access if RLS is ever misconfigured. This is already correct in `swap_session_exercise`; new RPCs must follow the same pattern.

## Test plan

### Functional coverage (Vitest + in-memory adapter)

Extend existing action tests (`src/app/(app)/program/actions.test.ts`, create if missing):

- `saveProgram`: complete save, phase upsert/delete, day deletion cascades slots, empty-days rejection, activates target and clears others, preserves `program_slot_id` continuity across edits
- `cloneProgram`: full tree copy, new UUIDs, inactive draft, phases/days/slots match source structure, restSeconds preservation
- `setActiveProgram`: clears old active, sets new active, single-active constraint holds, concurrent-safe (mock race with serializable check)
- `createFromTemplate`: first-run activates, subsequent templates are inactive, template structure matches seed, caps/defaults applied
- `acceptAdaptation`: logs intent, optionally swaps, error on swap failure surfaces but does not orphan adaptation (acceptable per above)

### SQL regression suite (pgTAP or raw assertions in transaction block)

Add `supabase/tests/program_mutations.sql` covering:

- **Atomicity:** Inject failure mid-RPC (via trigger or constraint), assert rollback leaves no partial state
- **Isolation:** Concurrent save attempts block on `FOR UPDATE`, last writer wins, no interleaved updates
- **Constraint enforcement:** Partial unique index rejects two active programs, even with concurrent calls
- **Cross-user:** RPC correctly rejects operations on another user's programs (via `user_id` predicate + RLS)
- **Cascade:** Deleting a day removes its slots; deleting a program removes days, phases, and slots
- **Idempotency:** Re-running identical save produces identical tree (upserts are stable)

### Compatibility verification

- Existing `saveProgram` calls in UI remain unchanged (Server Action input validation unchanged, only execution path moves to RPC)
- `exercise_swap_scope.sql` test continues to pass (no `swap_session_exercise` changes)
- `set_log.program_slot_id` linkage remains stable across program edits (builder test already covers this, extend to verify after partial-save failure)
- Phase resolution in Coach recommendations unaffected (relies on historical `workout_session.week_index`, not mutated program structure)

## Handoff checklist for #57

Implementation sequence (smallest correct atomicity, no over-engineering):

1. **Create `save_program` RPC** — single entry point for insert, upsert, and clone. Takes JSONB tree input (program metadata + arrays of phases, days with nested slots). Validates phase weeks, activates/deactivates in one statement, upserts phases/days/slots, deletes missing. Returns program UUID or raises exception.

2. **Refactor `saveProgram` Server Action** — keep input validation (empty days, week bounds, catalog checks), assemble JSONB payload, call RPC, revalidate on success. No UI change.

3. **Refactor `cloneProgram`** — load source tree, generate new UUIDs, call `save_program` RPC with `is_active = false`. Delete old separate clone logic.

4. **Refactor `createFromTemplate`** — check count, assemble template tree with UUIDs, call `save_program` RPC with conditional `is_active`. Delete old day-iteration logic.

5. **Create `set_active_program` RPC** — single `UPDATE` statement with conditional (`is_active = (id = p_target_id)`). Refactor Server Action to call it.

6. **Optional: wrap `acceptAdaptation` + swap** — if retry duplication becomes a problem, create RPC that inserts adaptation and conditionally calls `swap_session_exercise` in one function. Otherwise leave as-is.

7. **Write Vitest action tests** — cover new RPC call paths, assert same behavior as before (continuity, activation, structure preservation).

8. **Write SQL regression tests** — `program_mutations.sql` with rollback fixture, atomicity checks, cross-user rejection, constraint enforcement.

9. **Verify existing test suite passes** — `npm test`, `npm run lint`, `npx tsc --noEmit`, `supabase/tests/` (all existing SQL tests unchanged).

10. **Update this document** — record any deviations, new RPC signatures, test outcomes.

## Explicit non-goals

- **No optimistic UI for program saves.** Builder already shows pending state via `useFormStatus`; save completes in <100ms. Optimistic local update + background sync would add complexity for no UX gain.

- **No retry queue or background job.** All operations are synchronous RPC calls. User-triggered, user-waits, immediate feedback. Failures surface as errors with retry button, not silent background attempts.

- **No distributed transaction or saga.** Single-user app, single Postgres database, standard ACID transactions. No coordination across services, no event sourcing, no compensation logic.

- **No RPC for simple single-statement writes.** `logSet`, `deleteSet`, `finishSession` remain Server Action → single Supabase-js call. Only multi-statement sequences with rollback requirements need RPC.

- **No preemptive locking on program reads.** Program detail and gallery remain `SELECT` without `FOR UPDATE`. Optimistic concurrency is acceptable (last save wins). Conflicts are rare (single user editing one program), and explicit conflict resolution UI would add more complexity than it solves.

- **No change to RLS policies or ownership model.** `SECURITY INVOKER` + explicit `user_id` predicates maintain the established boundary. No elevated credential, no cross-user reads, no shared template mutation.

- **No migration or backfill.** New RPCs are additive. Existing program data is already valid (partial unique index enforces single active, foreign keys enforce referential integrity). No historical correction needed.

- **No version or ETag concurrency control.** Builder cancel returns to detail; concurrent edits are prevented by single-device usage pattern. If concurrency becomes a problem in practice, add `updated_at` + version check before save. Not needed for V1.
