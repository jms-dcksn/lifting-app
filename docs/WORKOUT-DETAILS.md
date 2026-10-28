# Workout tempo and personal details (#236, #240)

## Decision Card

Recommendation: extend the existing prescription and occurrence identities, and store
performed details on actual sets. Keep reusable machine setup separate from observations.
Reason: a prescription, remembered setup, workout observation and set observation have
different lifetimes. Editing one must not rewrite another.
Risk: additive schema and coordinated readers/writers require migrations before rollout.
Decision: implement within the owner's requested scope; hosted rollout and merging remain
separate. No new training policy or interpretation of personal text is introduced.

## Tempo

Tempo is a four-element numeric tuple of non-negative whole seconds: lowering, bottom
pause, lifting, top pause. Zero means no pause. Explicit prescriptions override defaults.
`tempo.ts` owns the explicit big-compound exercise IDs (including their station variants):
3-0-1-0; other exercises default to 2-0-1-0. Missing prescription values remain inherited.
The builder, templates/generated programs, planner and active workout use this resolver.
Session captures freeze the resolved prescription separately from whether it was explicit;
swaps retain explicit tempo and otherwise resolve the destination default. Logged tempo
is a snapshot, never recomputed from today's program. Old sets remain unspecified.

## Personal text contract (next slice)

Text is optional plain text, at most 2,000 Unicode characters; empty saves deliberately
clear it. Workout exercise notes use session + stable occurrence + exact exercise/equipment
identity. Duplicate slots stay independent, including before their first set. A swap selects
the destination's record; prior observations remain available under their original identity.

Setup references use owner + exact exercise + equipment identity. The UI offers remembered
setup explicitly, rather than treating it as a newly recorded observation. Saving setup
records the current occurrence and optionally updates that reusable reference. Each set
captures the setup that applied when logged. Later setup edits affect subsequent sets;
earlier sets retain their original snapshot. Exercise/set observations never auto-copy.

Writes use owner RLS, validated identities and field-specific compare-and-save revisions.
Numeric edits preserve personal details; detail edits preserve numeric data and historical
bodyweight. Conflicts retain the draft for review. Lost-response retries are idempotent;
retrying a set insert reads the saved row without replacing later edits. Notes don't start
rest, create sets, finish work, or trigger Coach interpretation.
