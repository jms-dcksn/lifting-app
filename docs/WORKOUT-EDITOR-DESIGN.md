# Complete upcoming-workout editor (#238)

Status: **persistence design approved by the owner on 2026-10-24 and implemented on the feature branch; hosted rollout remains separate**.
Source: [issue 238](https://github.com/jms-dcksn/lifting-app/issues/238).
Reviewed checkout: `749b764` (2026-10-24). This document records the approved design; verification evidence belongs in the implementation PR.
The current contract remains [Workout planning](WORKOUT-PLANNING.md).

## Decision Card

**Recommendation:** replace the substitution cookie with an owner-scoped database plan,
store ordered per-set prescriptions on program slots, and capture a versioned full plan
on session creation. Use transactional save/start RPCs under the existing owner source
lock. Keep stable identities for removed program slots and individual planned sets.

**Reason:** the cookie and `exercise_swaps` represent substitutions only. Neither can
represent added slots, removal, order, per-set targets or occurrence-specific rest/groups.
Active session loading currently reads live program slots, so a substitution-only extension
cannot protect a started workout from later program edits.

**Risk:** this changes the durable planning/session contract and the meaning of slot
removal. All relevant readers and writers must adopt it together. Cross-device saves
become available; legacy browser-only choices require a one-time compatibility path.
Production deployment requires a separately authorized hosted migration rollout.

**Approved decision:** database plan + per-set slot prescriptions + immutable
session snapshot design below, including stable retired slot references and conservative
matching of distinct set prescriptions. The owner approved this implementation design,
not permission to apply migrations to the hosted project or merge the eventual PR.

## Constraints verified at the reviewed base

- `src/lib/workout-plan.ts`: cookie key is user/program/day/completed count; values are
  only slot-to-exercise substitutions. Planner actions enforce a 3,800-byte encoded limit.
- `src/lib/next-workout.ts`: Home/planner/start share `loadNextWorkout()` and
  `resolveWorkoutSlots()`. A slot currently has one prescription and effective target.
- `src/app/(app)/session/actions.ts`: both starts converge on `startSession()`;
  creation saves identities in `exercise_swaps`, not structure or per-set prescriptions.
- `src/app/(app)/session/[id]/page.tsx`: session structure comes from current program slots.
  `active-session.tsx` calculates one target per card and counts completion against one
  `targetSets`; both must consume the snapshot's set rows instead.
- `src/lib/effective-workout-target.ts`: history currently selects the first working set
  per session/slot/exact equipment identity. Repeating that input for every edited row
  would incorrectly compare lighter sets with heavy sets.
- `src/lib/periodization.ts`: `effectiveSetCount()` rounds up and retains at least one
  set. `resolvePrescription()` currently lets normal phase RIR override slot RIR.
- `0002_program_builder.sql`: deleting a slot nulls historical `set_log.program_slot_id`.
  `0009_fluid_programs.sql`: deletion cascades its adaptation rows. The editor must not
  use the current `save_program()` deletion path for removals.
- `20261015012412_coach_exception_inbox.sql`: source writes already serialize through
  `private.lock_coach_source()` and increment `coach_refresh_state.source_revision`.
- No tempo prescription contract exists in the reviewed source. Recheck #236 before
  coding; preserve and reuse its contract if it lands first.

## Persistence contract

These names identify the implemented storage boundaries. Version 1 lives inside each full plan JSON value.

| Storage | Purpose |
| --- | --- |
| `workout_plan` | One saved full upcoming occurrence per owner/program/day/completed count; revision, format version, program source revision, full ordered plan and save receipt |
| `program_slot.set_prescriptions` | Versioned ordered normal-week rows with stable UUIDs and explicit/inherited field provenance; null means existing uniform prescription behavior |
| `program_slot.retired_at` | Exclude removed slots from future planning without deleting their historical foreign keys or adaptations |
| `workout_session.plan_snapshot` | Full effective occurrence plan, exact identities, per-set targets, rest, groups, phase/recovery context and format version captured at start |
| `set_log.planned_slot_id`, `set_log.planned_set_id` | Nullable references into that session snapshot, separate from existing program-slot identity and chronological `set_index` |

An ordered plan contains stable slot UUID, optional source program-slot UUID, exact
exercise/equipment identity, rest seconds, superset group, and ordered set UUIDs. A set
contains exact/range rep semantics, resolved RIR bounds, suggested target and nullable
explicit weight/rep overrides. Store provenance rather than inferring edits from numeric
equality. A user explicitly entering the current suggested value still makes an edit.
Persist normal-week intent separately from the effective recovery rows.

Workout-only additions have their own slot UUID and no program-slot foreign key. On a
program-scope save, create real program slots and map those stable draft IDs atomically.
Retained slots keep their existing IDs. Sets keep IDs across reorder and unchanged edits;
new sets receive new IDs rather than reusing a removed row's evidence identity.

Saved occurrence plans sync across devices for the same authenticated user. Keep an
unconsumed plan for up to 30 days; expiry or changed workout position produces an explicit
reload/conflict response rather than silently applying it elsewhere. Clean stale plans
on subsequent owner writes; expired rows are never resolved. A successful start consumes
the saved occurrence in the same transaction as session creation. Session snapshots remain
for the session's lifetime. User deletion cascades owned plans as usual.

Legacy cookie choices are read only when no database plan exists and the existing identity
checks pass. Fold them into the displayed baseline, then migrate on explicit Save or
successful Start. A database plan always wins over a leftover cookie. Clear the legacy
cookie only after the database write succeeds; do not write plans merely by viewing Home.

## Save, conflict and authorization boundary

The editor holds one client draft, including picker results, Undo and scope. No existing
immediately-persisted swap action runs during editing. Station creation needs its own
deferred picker representation: commit any new owner catalog variant within the save
transaction, or select an existing exact variant. Cancel must not create catalog rows.

`save_workout_plan` receives the full draft, expected occurrence, expected source/plan
revisions, scope and request UUID. A single transaction:

1. Authenticates with `auth.uid()`, acquires the existing owner source lock **before**
   row locks, and validates ownership of every referenced program/day/slot/equipment row.
2. Rechecks active program, completed count, selected day and absence of an open session.
   Compares expected source and plan revisions; a stale save returns a reloadable conflict.
3. Validates the entire payload, including format version, unique IDs, catalog eligibility,
   finite numeric values, equipment-specific weight rules and contiguous valid supersets.
   SQL must enforce write invariants even when the RPC is called without the Server Action.
4. For workout scope, writes only the occurrence plan. For program scope, updates only
   this owner's selected day, creates/retains/retires slots, writes per-set normal-week
   intent, and appends applicable `manual_swap` events without deleting prior events.
   Unchanged fields do not acquire explicit overrides. Other days/phases/templates stay
   unchanged. Clear overlapping saved occurrence choices, then save this occurrence's
   exact effective plan in the same transaction.
5. Records the receipt/revision and returns success only after all writes succeed.
   Replaying the same request returns its prior result; reusing it for different input
   fails. A transaction failure preserves the client's complete draft for retry.

Use owner RLS on all exposed tables and invoker RPCs with explicit ownership validation.
Do not allow direct writes to bypass validation/version checks: put validated write guards
on affected rows or use the repository's private executor pattern with narrowly granted
RPC access. Never grant a general elevated client. Choose the exact grant/guard mechanism
during SQL implementation and prove it with authenticated direct-write tests.

Register the new planning sources with Coach invalidation and source locking. Incorporate
the new revision/snapshot in confirmed action context so pre-edit proposals cannot apply
to a changed plan. Every program mutation path, including builder and accepted Coach
actions, must preserve retired references and invalidate conflicting editor drafts.

## Resolution, precedence and progression

One shared resolver serves Home, planner, both starts, active snapshot reads and Coach's
next/program-week views. Resolve in this order:

1. Existing session snapshot, when present; never rebuild it from a newly edited program.
2. Normal slot intent plus accepted Fluid history. Manual exercise changes append existing
   `manual_swap` semantics so an older adaptation cannot restore the previous exercise.
3. Explicit per-set rep/RIR intent over inherited normal-week fields. Untouched values
   retain canonical phase/Fluid behavior; do not freeze every displayed inherited value.
4. Canonical recovery set count and configured recovery RIR over normal-week intent.
5. Canonical per-set suggestions from eligible actual performance.
6. Current occurrence's explicit weight/rep values over suggestions. A refresh cannot erase
   them. Session start freezes the effective result and its provenance.

An entered program-scope weight is an initial seed, not a recorded performance. The exact
current occurrence retains it. Future occurrences use the seed until comparable performance
exists after that edit; then the existing target resolver advances from actual evidence.
Never fabricate sets or feed a seed to `sessionTarget()` as if the user completed it.
Saving/reloading alone cannot advance weight. Replacing an exercise clears incompatible
load seeds and resolves the replacement's exact identity before proposing targets.

For edited heterogeneous slots, match completed evidence by exact exercise/equipment,
stable planned-set ID and saved prescription context (rep bounds and effort/recovery
classification). Filter to eligible completed sessions before selecting progression
references. Keep heavy and lighter rows separate, including when they share rep ranges
but have distinct entered loads. Reorder retains IDs; changing prescription context starts
a fresh comparison context. Use `resolveExactWorkoutTarget()` and its canonical progression
formula on the filtered history; extend its input/history representation for per-set
contexts rather than introducing a new formula in the editor. Repeated-effort evidence
must match the same context, not the old card-wide first-set history.

Legacy uniform slots retain their existing first-working-set and cross-day reference
behavior. Legacy evidence has no trustworthy heterogeneous row identity: do not guess it
from row order or match a heavy row to a lighter row. Starting estimates may still use
canonical strength statistics. Broader movement comparison policy remains unchanged.

For recovery, calculate `effectiveSetCount(normalRows.length, multiplier)` exactly once.
Retain the first N normal rows in order, preserving their IDs and distinct prescriptions.
Four rows become the first two at multiplier 0.5; a heavy row followed by two lighter rows
becomes heavy + first lighter. Apply configured recovery RIR to retained rows. Expose the
effective/normal count in the UI; never overwrite stored normal intent with the reduction.
Editing during recovery must show normal intent and effective recovery separately, so an
unchanged Save cannot halve the normal structure. Current explicit occurrence edits remain
exact; saving future normal intent cannot silently apply a second reduction to them.

Use suggested weight removes only the selected seed/occurrence weight override in the
draft. It retains exercise, set IDs/order, reps, RIR, rest and groups. The apply-to-all
version explicitly names all sets in this exercise. Cancel restores the saved weight.

## Start and existing-session compatibility

`start_workout_plan` shares the owner lock and occurrence/revision validation with Save.
It resumes an existing open session without changing it. Otherwise it validates/resolves
the saved plan and atomically inserts the full snapshot, exact `exercise_swaps` compatibility
identities with the session row serving as the start receipt, then consumes only that saved occurrence. Concurrent starts
must return the same session. A failure rolls back consumption; a stale planner Start
offers reload rather than starting another day. Home Start resolves the same saved plan.

Sessions without snapshots use the existing compatibility loader; do not backfill guessed
historical prescriptions. Later edits cannot alter a new snapshot. Existing in-session
exercise swaps remain supported via their current scoped action, with an explicit
transactional update of that session's selected identity/compatible target fields; they
must preserve its structure and logged rows. The editor never edits an open session.

Retirement requires updating builder, program summary, Fluid/Coach, weekly readers and
session loaders together. Future readers exclude retired slots; snapshot and historical
readers retain them. No program-scope editor path deletes old slots or rewrites `set_log`.
Logging validates planned-set membership against the owned snapshot. Warmup/extra sets
remain separate; `set_index` alone cannot identify which planned row was completed.

## Delivery and acceptance evidence required

After approval, implement in the issue's prescribed order. Keep the future-program scope
hidden until it works completely; close the parent only when both scopes pass together.

| Acceptance area | Required evidence |
| --- | --- |
| Global draft/editor | Mobile and desktop authenticated browser journeys: catalog add/replace, remove/Undo, reorder, valid grouping, keyboard focus, scroll preservation, 44px controls, sticky Save/Cancel, navigation protection |
| Per-set values | Pure validation/serialization tests and save/reload browser checks for distinct loads/reps/RIR, exact/range semantics, rest, apply-to-all, add/remove and weight-only reset |
| Scope isolation/history | Transactional database tests for both scopes, other day/template isolation, retained foreign keys/adaptations and byte-for-byte unchanged completed sets |
| Progression/recovery | Deterministic tests for 4 to 2 sets, retained row order, edited 1 RIR vs recovery, inherited phase behavior, separate heavy/lighter evidence, seed-to-real-performance progression and idempotent reads |
| Start/resume | Home and planner starts produce identical snapshot structure/targets; active completion counts and superset rest consume it; failed and concurrent starts, receipt replay and legacy/open resume tests |
| Authorization/conflicts | Two-owner pgTAP, direct-RPC and direct-write denial, unresolved stations, stale source/occurrence/plan versions, simultaneous saves and injected mid-write rollback |
| Coach compatibility | Stale confirmation rejected after edit; recommendations remain available; workout-only changes stay occurrence-local in program-week reads |
| Shipping gates | Repository tests, lint, fresh typecheck, production build, ownership/concurrency tests and authenticated mobile/desktop browser verification; record actual results and limitations in the implementation PR |

Update the owning planning, swap, session/program and target documentation as their
behavior lands. Update the AI Coach HTML explainer if Coach code changes. Production
migration rollout remains subject to the existing deployment contract and build gate.
