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

## Personal text contract

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


## Storage and edit boundaries

- `workout_exercise_detail`: owner/session/occurrence/exact exercise/equipment, independent
  setup and exercise note. Direct writes are denied; an invoker wrapper calls the existing
  non-login/non-bypass workout executor with owner RLS and validated session identities.
- `exercise_setup`: optional reusable setup for an exact user/exercise/equipment. The editor
  starts with this workout's saved text; **Use remembered setup** explicitly fills a draft.
  **Remember for this machine / cable** also updates the reference on Save. Clear affects
  the reusable reference only when that option is selected.
- `set_log.note`, `setup_snapshot`, `tempo`: one actual set's observation and historical
  context. An insert trigger captures applied setup under the existing owner source lock;
  updates preserve that snapshot. Unapplied remembered setup is never claimed as performed.
- `set_log.edit_revision`: each update advances the compare-and-save revision. The editor
  retains its opening revision. Conflicts retain the draft and ask users to Cancel/reopen.
  Detail-only edits skip numeric/bodyweight/stat/Coach writes, including historical null RIR.
  Numeric edits leave omitted details intact. Replaying an already-applied edit is a no-op.

Exercise/setup saves compare the selected field's prior text, so concurrent unrelated fields
remain independent. An identical successful retry is a no-op in meaning. Optional reference
writes compare their own prior text in the same transaction. Setup/log and other training
writes share the existing owner lock; snapshots reflect the setup committed before insertion.
Set-log retries retain one request key per unchanged draft, read the saved row first and
never replace its details with a stale retry payload.

Finished workouts expose occurrence notes even without sets. Set rows, in-workout history
and exercise review show recorded setup, set notes and the exercise observation. All text is
rendered as plain React text. Text and tempo do not enter progression, PR, calibration or
Coach interpretation rules. Existing whole-session feedback stays separate.

An omitted performed-tempo override uses the captured prescription. Explicitly choosing
**Mark tempo unspecified** stores null and stays unspecified through retries and history;
it is never silently replaced with a default.

## Previous notes (#255)

Exercise cards on Plan workout and active workouts offer **Previous notes** in a
separate personal-details control. The shared read-only sheet starts with the selected
exact exercise/equipment (including null equipment and unsaved planner selections).
It loads only when opened and never creates a session, saves a plan, applies setup, or
changes current note/set drafts. Active workouts exclude their current session.

The signed-in reader pages finished workouts newest first, with session ID as the
tie-breaker and **Load older** for earlier pages. It reads occurrence details independently
of sets, so zero-set observations and unremembered setup remain accessible. Duplicate
occurrences stay distinct within each workout; occurrence IDs only join set context
within that session, never across workouts. Remembered setup is a separate, unapplied
reference; previous workout setup, exercise observations and differing per-set setup
snapshots have separate labels. Preview text expands in place. Empty/loading states and
retry retain existing content; identity changes discard stale responses. Closing the
shared Sheet restores focus without scrolling or discarding the surrounding draft.
