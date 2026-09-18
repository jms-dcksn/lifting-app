# Weight calendar (#28)

You (`/settings`) and the Board More weight card open the shared Weight calendar Sheet.
Today is selected initially; recent Settings readings open their own date. Browse with
month arrows or Jump to month. The calendar starts on Monday; dots identify recorded
readings and an outline identifies today. Arrow keys move focus, Home/End move within a
week, and PageUp/PageDown move between months. Enter/Space selects a day.

Selecting an empty day offers Save; existing readings prefill the value and offer Update
or Remove. Correct the date moves an existing reading. If its destination is occupied,
a separate confirmation identifies the reading that will be replaced. Removal also asks
for confirmation. Failed saves retain input; failed month loads have an inline retry.

## Data contract

`loadWeightMonth` reads one calendar month with explicit user/date predicates (at most
31 rows under the existing unique constraint). `writeWeightEntry` validates real dates
and positive weights up to 1,500 lb. Today uses America/Chicago; stored observations
remain date-only. The new SECURITY INVOKER `save_bodyweight_entry` RPC authenticates its
caller, locks calendar writes per owner, checks source ownership, and saves/moves/replaces
in one transaction. Replacement requires the destination's explicitly confirmed id.
The migration adds only this function and its grants; it does not rewrite observations.

`getCurrentBodyweight` remains newest-date-first with the profile baseline as fallback.
Calendar writes never update profile bodyweight, historical sets, e1RMs, or strength caches.
They revalidate Home, You, Board, next-workout preview, and session pages. Goal
setting changes now also revalidate Board.

## Verification

- `npm test`: includes calendar date boundaries and authenticated action coverage.
- `supabase/tests/bodyweight_calendar_writes.sql`: rollback-only synthetic-user checks,
  including cross-user denial and injected failure after deleting a replacement target.
- Mobile browser fixture checks are separate from authenticated deployment testing.
- Preview review: open Log weight, select a date several months ago, save/update/remove,
  correct a reading onto an occupied date, and confirm or cancel replacement.

The additive migration must be available in the preview's database before testing saves.
Weight charts (#29) and the first monthly review (#30) are now implemented in separate slices;
see [trends](WEIGHT-TRENDS.md) and [monthly progress](MONTHLY-PROGRESS.md) for current scope
and the remaining dashboard/stall work. Period tracking (#32–33) remains planned.
