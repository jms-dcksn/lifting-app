# Plan and edit the next workout

`/workout/next` uses one **Edit workout** action. Exercise cards stay in place while their
sets, rep bounds, RIR bounds, loads, rest and superset grouping become labeled controls.
Add/replace uses the shared station-resolving catalog picker. Move up/down works with
keyboard or touch; removal supports draft Undo. A temporary empty draft is allowed,
but Save requires an exercise with a working set. Start is replaced by sticky Save/Cancel
while editing. Local validation focuses the first invalid field; failed writes retain the
draft. Navigation/reload guards use browser confirmation where supported.

## Save scopes and persistence

One scope selector applies to the whole draft, defaulting to **This workout only**.
**This day for the remainder of the program** writes this occurrence and only the selected
owner's day. Other days, shared templates, completed sets and unrelated adaptations remain
unchanged. Catalog station selections are deferred until Save; Cancel creates no variants.

`workout_plan` stores the full versioned occurrence by owner/program/day/completed count.
It syncs across devices, expires after 30 days, and is consumed atomically by successful
session creation. A failed save/start retains it. The old substitution cookie is a read-only
compatibility input when no database plan exists; clear it only after a successful write.
Planning creates no sessions, performance evidence, duration or adherence statistics.

`save_workout_plan` and `start_workout_plan` use the existing owner source lock, expected
source/plan revisions, and current active-program position. Saves have immutable request
receipts for lost-response retries. Starts resume an existing open session before considering
new input; concurrent starts return one session. A changed day/program fingerprint or stale
revision returns a conflict requiring review. No partial program write reports success.
Owner RLS and the private non-login/non-bypass executor deny direct plan writes.

## Program intent, recovery and targets

`program_slot.set_prescriptions` stores ordered normal-week rows with stable set UUIDs and
explicit/inherited field flags. Explicit rep/RIR edits persist; untouched fields still follow
phase/Fluid rules. Exercise replacement appends existing Fluid `manual_swap` semantics.
Retirement removes a future slot without nulling historical set references or deleting its
adaptations. Future program/Coach readers exclude retired slots; history retains them.

Recovery applies `effectiveSetCount` once to normal rows, retaining the first N in order,
then applies configured recovery RIR over normal-week effort edits. Normal intent remains
separate from effective recovery rows while switching scopes or saving during recovery. Four sets become two
at 0.5 volume. In program scope during recovery, the editor exposes normal-week rows;
the server derives the effective occurrence separately. Saved reduced rows do not become
next week's normal count.

An entered weight remains exact for the saved upcoming occurrence. For future occurrences
it is a seed until comparable actual performance exists after that edit. Read/refresh never
simulates completion or compounds a weight increase. Distinct set rows match by stable set
identity, exact exercise/equipment and saved rep/effort context; heavy and lighter rows do
not share the old card-wide first-set reference. Context edits start a new comparison window.
The canonical `resolveExactWorkoutTarget` calculation still owns suggestions and repeated
effort adjustments. Legacy uniform slots retain their existing first-working-set behavior.

**Use suggested weight** clears only that row's weight adjustment. Its apply-to-all control
explicitly names all sets in the exercise. It does not reset reps, RIR, rest, order, grouping,
or exercise identity, and remains a draft change until Save.

## Session boundary and compatibility

Home Start and planner Start share `loadNextWorkout()` and the atomic start RPC. New sessions
capture `workout_session.plan_snapshot`: ordered slots, exact identities, per-set targets,
rest, groups and phase context. Active logging reads this capture and advances through the
individual planned rows. `set_log.planned_slot_id` and `planned_set_id` distinguish added
workout-only exercises and completion even after deleting a logged row. `program_slot_id`
continues to preserve historical program identity. Extra sets remain separate.

Later program edits cannot rewrite a capture. Explicit in-session swaps overlay the saved
identity and rederive compatible targets without changing logged rows. Workout-only added
slots support workout-only in-session swaps. Existing sessions without a snapshot retain
the legacy loader; no historical prescriptions are guessed or backfilled. An open workout
continues to redirect the planner to Resume.

Superset members remain contiguous; singleton/split groups dissolve in the draft. Intermediate
members do not start rest; the final member uses its saved interval after the round. Every group rest control edits that final member's round interval. Active
counts and the expandable Planned sets list use the captured rows.

## Verification and rollout

[The approved persistence design](WORKOUT-EDITOR-DESIGN.md) records the decision, compatibility
boundaries and acceptance matrix. Pure tests cover serialization, equipment validation,
recovery retention and per-set evidence matching. UI tests cover local draft/Undo/Cancel,
failed-save retry identity and invalid-field focus. `workout_editor_rls.sql` covers scope,
ownership, immutable snapshots, version conflicts, rollback and historical references.
`test-workout-editor-concurrency.mjs` exercises actual competing save/start connections.
`e2e/workout-editor.spec.ts` checks authenticated mobile/desktop save/reload/start/logging
and both scopes against the disposable stack. The PR records actual results and limits.

The migration must be applied through the existing hosted deployment workflow before
production can run this code; no hosted migration is authorized by local verification.
