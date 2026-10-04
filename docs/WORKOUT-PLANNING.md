# Plan the next workout

Home's Upcoming workout card links to `/workout/next`. The full-page planner shows every
exercise with the effective week-specific sets, reps, RIR, rest, and phase description.
It shares the station-resolving ExercisePicker (`resolveStations`) with the active workout. Reset removes
only that slot's planned choice. An open workout redirects to its active session.

## Persistence and start boundary

Planning choices apply to the upcoming workout only when the user picks **This workout
only**. They are stored for up to 30 days in a same-site, HTTP-only cookie in the current
browser; they do not sync across devices. The UI states this limitation. Creating a new
station variant still persists its catalog row through the existing authenticated picker
action. Planning never creates a session or logs a set, so it contributes no duration,
adherence, or training-history data.

Choosing **Remainder of program** after Swap exercise or Swap machine uses the same
`swap_program_slot_exercise` RPC path as in-session program-scope swaps: it updates the
matching `program_slot` and, on fluid programs, appends a `manual_swap` adaptation row.
It clears any cookie override for that slot so the durable program change is what future
planner loads and session starts inherit.

The cookie identity contains the authenticated user, active program, next day, and completed
session count. Reads reject other identities and filter deleted slots, unknown exercises,
and unresolved station templates. Saves authenticate, reload the active program and current
position, validate the slot/exercise, and reject stale pages or already-open workouts.
Cookie size is checked before writing; errors are visible instead of reporting success.

`loadNextWorkout` is shared by Home, the planner, and Start. It resolves classic weekly
phases and folds fluid adaptations using the same functions as the active session. Database
read errors surface instead of silently defaulting to week one. Both Start buttons insert
validated draft choices directly into `workout_session.exercise_swaps` alongside session
creation. A failed insert retains the draft. A successful insert clears it. An existing
session is resumed without overwriting its choices. A stale planner Start refreshes the
planning route instead of starting a different workout.

In-session swapping still offers workout-only / remainder-of-program scope. The planner
uses the same confirmation sheet copy and scope buttons after picking a replacement.
Workout-only choices stay cookie-scoped; program scope writes through
`swap_program_slot_exercise` and leaves adaptation history intact for fluid programs.

## Verification

`workout-plan.test.ts` covers user/program/day/exposure isolation, malformed cookies, removed
slots, unknown exercises, and station-template rejection. `workout-planning-actions.test.ts`
checks the authenticated action boundary with mocked database/cookie adapters: saving without
session creation, preserving other choices, program-scope RPC delegation, reset, stale/invalid
rejection, resume behavior, atomic insert payload, and draft retention on failure. These do not
replace an authenticated browser test against the deployed Supabase instance.

The planner program-scope path adds `swap_program_slot_exercise` (same slot/adaptation writes
as in-session program scope, without touching `workout_session`). Type checking, ESLint,
Vitest, and the production build are the shipping gates.
