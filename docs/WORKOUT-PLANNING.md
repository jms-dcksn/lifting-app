# Plan the next workout

Home's Upcoming workout card links to `/workout/next`. The full-page planner shows every
exercise with the effective week-specific sets, reps, RIR, rest, and phase description.
It shares the machine-resolving ExercisePicker with the active workout. Reset removes
only that slot's planned choice. An open workout redirects to its active session.

## Persistence and start boundary

Planning choices apply to the upcoming workout only. They are stored for up to 30 days
in a same-site, HTTP-only cookie in the current browser; they do not sync across devices.
The UI states this limitation. Creating a new machine still persists its catalog variant
through the existing authenticated picker action. Planning never creates a session or
logs a set, so it contributes no duration, adherence, or training-history data.

The cookie identity contains the authenticated user, active program, next day, and completed
session count. Reads reject other identities and filter deleted slots, unknown exercises,
and unresolved machine templates. Saves authenticate, reload the active program and current
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
currently saves workout-only choices and leaves program defaults/adaptation history intact.

## Verification

`workout-plan.test.ts` covers user/program/day/exposure isolation, malformed cookies, removed
slots, unknown exercises, and machine-template rejection. `workout-planning-actions.test.ts`
checks the authenticated action boundary with mocked database/cookie adapters: saving without
session creation, preserving other choices, reset, stale/invalid rejection, resume behavior,
atomic insert payload, and draft retention on failure. These do not replace an authenticated
browser test against the deployed Supabase instance.

No migration or environment-variable changes are required; this uses the existing
`exercise_swaps` column. Type checking, ESLint, Vitest, and the production build are the
shipping gates.
