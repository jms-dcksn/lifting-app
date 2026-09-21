# Exercise swap scope

In an active workout, tap Swap (or the profile-specific Choose machine / cable /
bench / rack / platform control), select the replacement, then choose:

- **This workout only:** use the replacement now; keep the program's exercise next time.
- **Remainder of program:** use the replacement now and for the same slot each time this
  program day recurs. Other slots/days and shared program templates are unaffected.

Cancel leaves the selected exercise unchanged. Failed saves show an error and allow retry.
The confirmation sheet cannot be dismissed while saving. Finished workouts reject swaps.
Both scopes save before the first set and survive reload. Sets already logged retain their
original exercise and performance; their exercise name appears below the set when it differs
from the current selection. Weight recommendations continue to use each exercise's own history.

## Persistence

The additive exercise_swap_scope migration adds an empty-by-default JSON object to
workout_session, keyed by program_slot_id. Session loading resolves explicit choice first,
then legacy logged exercise, then adaptive/program default. No synthetic set logs are created.

The SECURITY INVOKER swap_session_exercise RPC uses the authenticated user's RLS policies,
checks the session is open and that slot/day/program belong together, locks the session and
slot, and atomically updates the session choice and optional program-slot exercise/pattern.
JSON updates preserve choices for other slots. The Server Action validates the replacement
against the caller's merged catalog and rejects unresolved station templates. No elevated
credential is used. Program/home paths are revalidated after program-wide changes.

For fluid programs, a manual_swap event supersedes earlier exercise adaptations while
preserving the effective rep range and resetting plateau state. Coach-generated swaps still
use their existing home-band reset and also persist the active session's choice.

## Verification

- npm test: includes manual substitutions after prior fluid swaps/rep changes/dismissals.
- npm run lint; npx tsc --noEmit; npm run build.
- supabase/tests/exercise_swap_scope.sql: transaction-scoped fixtures and rollback; exercises
  both scopes, independent JSON keys, later temporary swaps, unchanged logged sets and other
  days, future-session inheritance, fluid events, invalid scope, invalid slot, finished
  sessions, and cross-user rejection. Execute as postgres; assertions run as authenticated.
