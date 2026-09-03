# Coach check-in report v1

`src/lib/coach-check-in.ts` defines the versioned `CoachCheckInReport`. It is the single
derived contract for both the Progress snapshot and its clipboard text. Future coach-facing
API work should serialize this report rather than reimplementing the aggregation.

The builder is pure: callers supply sessions, working sets, program days/slots/phases, the
exercise catalog, and bodyweight context. It returns facts and classifications only. It does
not recommend programming changes or mutate training data.

## Time windows

- The default reporting timezone is `America/Chicago`.
- The current window is seven calendar dates ending on `generatedAt` (inclusive).
- The prior comparison window is the immediately preceding seven calendar dates. The windows
  never overlap.
- A session belongs to a window by `performed_at`. Future sessions are excluded.
- Only sessions with `finished_at` contribute to execution metrics. Open sessions are excluded
  and counted as data-quality warnings.

## Metric definitions

- **Adherence:** completed sessions versus the supplied weekly plan count.
- **Duration:** `finished_at - performed_at`, with 45 minutes as the comparison target. Values
  below 5 or above 240 minutes are excluded and flagged.
- **Set execution:** completed non-warmup sets versus the effective prescribed set count for
  each completed session. The session's stored `week_index` selects its phase; deload set
  multipliers and RIR ranges therefore apply to that historical exposure.
- **RIR execution:** actual RIR is compared with the effective phase RIR range. Missing RIR and
  sets that cannot be matched to a program slot are reported explicitly.
- **Hard sets:** non-warmup sets at RIR 0–1. Specialization totals use the explicit mappings
  below. Mappings intentionally overlap because one compound set may provide meaningful volume
  to more than one specialization group.
- **Fixed-load progress:** exact exercise and exact raw logged weight, comparing the best reps
  in the current window with the best reps in the prior window.

| Group | Included movement patterns |
| --- | --- |
| Delts | Vertical press, lateral raise, rear delt |
| Biceps | Elbow flexion |
| Triceps | Elbow extension |
| Quads | Squat, lunge, knee extension |
| Hamstrings | Hinge, knee flexion |
| Glutes | Squat, hinge, lunge, hip thrust |
| Calves | Calf |

## Exercise trend classification

Each exercise needs four completed exposures with valid e1RM values. The last two exposures
form the recent pair and the preceding two form the comparison pair. `gaining` or `declining`
requires both recent marks to clear both comparison marks by the 1% noise margin. Otherwise the
classification is `flat`; fewer than four valid exposures is `insufficient_data`. This prevents
one unusually good or poor session from becoming a trend.

## Privacy and compatibility

The report contains exercise slugs and display names but no email addresses, auth claims, user
IDs, session IDs, program IDs, program-day IDs, or program-slot IDs. Consumers should key on
`version` before relying on its shape. Additive or breaking contract changes require an explicit
version decision and matching fixture coverage.

The current schema does not snapshot a slot prescription when a workout starts. The report uses
the current definition of the historical slot plus the session's stored week. If a slot is
edited after training, the old session's displayed prescription can reflect that edit; unmatched
or deleted slots are surfaced as data-quality warnings rather than guessed.
