# Plan and edit the next workout

`/workout/next` uses one **Edit workout** action. Exercise cards stay in place while their
sets become compact aligned rows. Weight is editable inline; tapping a rep or RIR range
opens a focused set sheet with separate minimum/maximum fields, suggested-weight reset
and Remove set. Sheet changes update the workout draft; Done validates that sheet,
while Escape/dismiss retains draft edits. Global Save reopens and focuses invalid hidden
range/rest controls. Exercise and equipment changes stay visible; named 44px move/remove
icons sit in each card header. **More** opens rest/superset options, with bulk set tools
in a collapsed details section. Exercise and set removal both support Undo.
Add/change uses the shared station-resolving catalog picker. Move up/down works with
keyboard or touch. A temporary empty draft is allowed,
but Save requires an exercise with a working set. Start is replaced by sticky Save/Cancel
while editing. Local validation focuses the first invalid field; failed writes retain the
draft. Cancel asks to discard a changed draft and offers Keep editing. Navigation/reload
guards use browser confirmation where supported.

While editing, station-backed movements also offer a direct **Change machine/cable/
platform/rack/bench** action (or **Choose** for unresolved equipment). It opens the
same-movement station form without browsing exercises. The editor injects its local
variant resolver into the shared picker: new stations stay in the draft until atomic
Save, and Cancel discards them. Changing identity clears manual loads and equipment
instance selection, rederives suggestions, and preserves set IDs, rep/RIR bounds, normal-week
rows, rest and grouping. Dumbbell/bodyweight movements without station templates omit it.

## Edit-mode design study

[Interactive HTML mockup](plan-editor-mock.html) records the owner's approved design: compact set rows, visible
exercise/equipment changes and move/remove controls, focused rep/RIR range sheets, and
secondary rest/superset/bulk tools behind **More**. Its rationale panel links the UX
research. Usage priorities come from the owner's expected common actions; they have
not been measured with analytics or usability testing.

The compact layout is implemented in the planner's edit mode using the existing Button,
IconButton, Input, ExerciseCardLabel and native-dialog Sheet components. Read-only cards
retain their existing prescription presentation. The reference HTML uses
sample equipment and suggestions, supports reversible in-memory edits, and has no
database connection. Save affects only that tab; reload resets it. Prototype superset
grouping is illustrative; application rules own equipment resolution, validation, recovery
and superset round rest.

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

Starting an untouched program may capture known equipment templates (for example barbell
bench or cable pulldown) before a station is selected. The active exercise card then offers
Choose bench/cable/machine and hides set entry until a concrete variant is selected. The
selection overlays the snapshot through the existing session swap; the captured prescription
and planned set IDs remain stable. Start-only validation still checks owner, exercise catalog,
structure, numeric values and revisions. Editor saves retain strict station validation.
Direct API logging into a captured session also rejects unresolved equipment; historical
set edits retain their existing behavior. Home Start failures reopen the plan with a retry
message, while plan-page failures stay inline and retain saved changes.

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

Tempo is editable per exercise in both the program builder and upcoming-workout editor.
Explicit four-phase seconds survive save, copy, station selection and start; an inherited
default follows the destination exercise on swaps. Session captures and logged sets freeze
their own tempo. See [workout details](WORKOUT-DETAILS.md) for notation and compatibility.

The start compatibility fix additionally requires `20261027173401_allow_unresolved_workout_start.sql`.
That migration sorts after `20261027010327_exercise_tempo.sql` and replaces the workout
validator and start function. `20261028140000_reapply_exercise_tempo_seams.sql` puts the
tempo checks and start snapshot back onto those replaced definitions. The tempo version
prefix stays `20261027010327`.
`workout_start_station_rls.sql` and `e2e/workout-start-station.spec.ts` cover starting an
untouched program from Home and the planner, pending-equipment logging rejection, and
equipment selection followed by logging/reload without rewriting the snapshot.
