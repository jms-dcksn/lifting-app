# Week-Specific Prescription Design

**Issue:** [#4 — Apply week-specific RIR and deload prescriptions automatically](https://github.com/jms-dcksn/lifting-app/issues/4)

## Outcome

A workout session resolves its working-set count and acceptable RIR range from the session's
stored `week_index`. The result is stable when an old session is reopened, ordinary programs
without weekly phases behave exactly as before, and the same pure resolver is available to the
active workout and future coaching analytics.

## Data model

`program_phase` stores a named, ordered, contiguous week range belonging to a program. A phase
can override the RIR range, multiply working sets, or do both. Program-level phases are enough
for the current HIT block because every slot follows the same weekly intensity cycle; slot-level
rules would add complexity without a current use case.

RIR uses lower and upper bounds. Existing slot prescriptions are treated as a one-value range.
The 0–1 RIR build weeks therefore remain truthful in the UI, while the existing progression
engine receives the upper bound (`1`) as its conservative single-value input.

Deload set counts use `max(1, ceil(base sets × multiplier))`. Rounding up preserves more of the
intended half-volume dose for odd set counts: three sets become two, and one set remains one.

## Resolution contract

`resolvePrescription(base, week, phases)` is framework-free and returns:

- effective working-set count
- rep range from the base slot
- single target RIR for existing recommendation APIs
- displayable RIR minimum and maximum
- the matching phase and its explanatory copy

Authoring rejects overlapping phases. Resolution still sorts by phase position and chooses the
first matching phase, providing deterministic behavior if malformed historical data exists.

## Delivery slices

1. **Domain and schema:** migration, generated types, phase loader, pure resolver and tests.
2. **Active workout:** resolve from stored session week, use effective sets for progress/current
   slot state, show phase guidance and effective RIR range.
3. **Authoring and lifecycle:** seed the James HIT phases and preserve phases through template
   creation, program save, clone, builder, and detail UI.

The three slices are delivered as stacked PRs. The final PR closes #4 after the stack merges.
