# Glute Focus · Women's Strength & Hypertrophy

Status: approved and implemented as shared template `glute-focus-women-3x`, 2026-10-17.
Existing user programs are unchanged; no database migration or backfill is required.
Original programming informed by the sources below, not a transcription or endorsement
of a commercial program.

## Shared template

The separate 12-week, three-day full-body template prioritizes glutes, with two working sets
per exercise, with glute drive as the only exercise repeated within the week. Keep each
variation fixed throughout the block. Use cable glute kickbacks on B and machine glute
kickbacks on C. On C, perform Bulgarian split squat, machine kickback, then glute drive.
Retain 13 of the reference active program's 18 exercise occurrences (72%), normalizing
owned station variants to their base exercise. Movement-pattern similarity is higher;
72% describes exercise retention, not a validated measure of program equivalence. The
explicit glute-drive exception raises active-copy retention above the original 60–70% aim.

Budget 45–60 minutes including warm-up, with B/C generally longer than A. This deliberately
relaxes the old under-45-minute target: unilateral lunges and kickbacks require both legs.
The tradeoff is more glute work and variety, with no direct calf or abdominal isolation.
Do not add further sets by default.

## Reviewed baseline

Verified the requested account's active program through read-only production queries on
2026-10-17, then compared it with `src/lib/program-templates.ts` and
[Strong Foundations](STRONG-FOUNDATIONS.md). Identifying account details and program IDs
are intentionally omitted from this shareable proposal.

Active program: **Strong Foundations · Women's Glutes & Legs**, classic, 12 weeks,
three nonconsecutive training days. Every exercise has two working sets.

| Day | Current exercises in order, with reps |
| --- | --- |
| A | Leg press 6–10; glute drive 8–12; seated leg curl 10–15; machine chest press 8–12; seated cable row 8–12; seated hip abduction 12–20 |
| B | Barbell RDL 8–10; hack squat 8–12; leg extension 10–15; cable lat pulldown 8–12; dumbbell shoulder press 8–12; standing calf raise 10–15 |
| C | Glute drive 6–10; Bulgarian split squat 8–10/leg; lying leg curl 10–15; incline dumbbell bench 8–12; machine horizontal row 8–12; machine ab crunch 10–15 |

The active copy uses lying curls and machine crunches on C; the shared template uses
seated curls and cable crunches there. Machine variants retain their own load identity.

The baseline is already a sensible lower-body-priority full-body program. It has 36 weekly
working sets: 22 lower-body, 12 upper-body and two core. Glute-focused thrust/abduction
work comprises six sets, alongside eight overlapping sets of leg press, hack squat, RDL
and split squat. These exposures are not interchangeable isolated glute sets. The repeated
glute drive remains a progression anchor by explicit user request; other exercises vary.

## Research findings

The [published-program comparison](2026-10-17-womens-glute-programs-research.md)
covers Bodybuilding.com, Matt Ogus, Bret Contreras, Jessie Hilgenberg, Sohee Lee and Jeff
Nippard, including public samples, reviews and access limits. No named program has been
established here as superior to the others.

- **Closest structural fit:** Booty by Bret's public onboarding recommends three full-body
  days for newcomers. Bodybuilding.com's Nia Shanks article also provides a three-day
  full-body rotation. Preserve the familiar schedule rather than importing a longer split.
  [Booty by Bret](https://bootybybret.com/pages/get-started),
  [Bodybuilding.com](https://shop.bodybuilding.com/blogs/training/these-workouts-are-how-strong-women-get-built).
- **Vixen:** Matt Ogus's public sample includes bridge, squat, hinge, unilateral and cable
  kickback work. Its listing advertises four days but shows five lifting days; detailed
  prescriptions and independent outcome reviews were not verified. Its named glute-medius
  cable variation is not necessarily the ordinary hip-extension kickback proposed here.
  [Official listing](https://marketplace.trainheroic.com/workout-plan/team/vixen).
- **General programming:** the 2026 ACSM position stand supports progressive resistance,
  sufficient weekly volume and heavier work for strength; failure and elaborate methods
  are not required. Our two-set slots, moderate rep ranges and conservative RIR targets
  are practical choices, not proof of an optimal dose for every lifter.
  [Full position stand](https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/).
- **Exercise selection:** a 2025 glute-hypertrophy review supports several hip-extension
  exercises rather than one mandatory lift. Keep thrusts alongside squat/lunge and hinge
  work. It does not prove all variations are equally effective.
  [Review](https://pubmed.ncbi.nlm.nih.gov/40276368/).
- **Thrusts and squat patterns:** Plotkin et al. found similar glute growth after squat or
  hip-thrust training, with greater thigh growth from squats. EMG differences did not
  reliably predict growth. This supports retaining both categories, not claiming a burn
  or high activation establishes superiority. The study did not test this machine mix.
  [Trial](https://pmc.ncbi.nlm.nih.gov/articles/PMC10349977/).
- **Directly relevant new evidence:** Attarieh et al., published October 7, 2026, compared
  cable hip extension and cable abduction in 17 young adults over ten weeks. MRI findings
  suggest differing regional growth patterns. Keep extension and abduction as distinct
  components. Abstract-level access only: this small study does not establish that machine
  kickbacks match cables, that seated abduction matches cable abduction, or that this
  proposed combination is superior. [Study](https://pubmed.ncbi.nlm.nih.gov/42842490/).
- **Rest:** a 2024 meta-analysis suggests a small advantage to rests longer than 60 seconds,
  with uncertainty and little detectable difference beyond 90 seconds. Use longer compound
  rests to preserve performance; avoid turning the sessions into rushed circuits.
  [Review](https://pubmed.ncbi.nlm.nih.gov/39205815/).

The mixed exercise selection is supported by evidence and established coaching practice.
The exact split, substitutions and dose below remain coaching judgments. Keeping weekly
variations, with one approved glute-drive repeat, addresses the user's preference;
variety itself is not claimed to produce more growth. The existing plan already follows
many of these principles.

## Sessions

Train on nonconsecutive days, for example Monday/Wednesday/Friday. Warm up for 5–8 minutes
and use easy ramp-up sets for the first demanding lifts. Listed sets are working sets;
warm-ups do not count. Default effort is two repetitions in reserve (RIR), overridden by
the phase table below. Complete one exercise before moving on; no two-station supersets.

### A · Glute drive and legs

| Order | Exercise | Sets × reps | Rest | Shared exercise ID |
| --- | --- | --- | --- | --- |
| 1 | Glute drive | 2 × 8–12 | 150 sec | `glute-drive` |
| 2 | Leg press | 2 × 6–10 | 120 sec | `leg-press` |
| 3 | Seated leg curl | 2 × 10–15 | 90 sec | `seated-leg-curl` |
| 4 | Seated hip abduction | 2 × 12–20 | 90 sec | `seated-hip-abduction` |
| 5 | Flat dumbbell bench press | 2 × 8–12 | 90 sec | `db-bench` |
| 6 | Seated cable row | 2 × 8–12 | 90 sec | `seated-cable-row` |

Thrust goes first to prioritize its strength progression. Abduction is deliberately distinct
from kickbacks. The bench substitution provides some upper-body variety; no superiority
over machine pressing is claimed.

### B · Hinge, lunge and cable kickback

| Order | Exercise | Sets × reps | Rest | Shared exercise ID |
| --- | --- | --- | --- | --- |
| 1 | Barbell Romanian deadlift | 2 × 8–10 | 150 sec | `bb-rdl` |
| 2 | Hack squat | 2 × 8–12 | 120 sec | `hack-squat` |
| 3 | Dumbbell reverse lunge | 2 × 8–12/leg | 120 sec after both legs | `db-reverse-lunge` |
| 4 | Cable glute kickback | 2 × 12–20/leg | 90 sec after both legs | `cable-glute-kickback` |
| 5 | Cable lat pulldown | 2 × 8–12 | 90 sec | `lat-pulldown` |
| 6 | Dumbbell shoulder press | 2 × 8–12 | 90 sec | `db-shoulder-press` |

Replacing extension/calves reallocates accessory time to glutes while retaining quad work
through the hack squat and lunge. Use hand support for lunges if balance limits loading;
do not force an exaggerated stride or range.

### C · Thrust strength and machine kickback

| Order | Exercise | Sets × reps | Rest | Shared exercise ID |
| --- | --- | --- | --- | --- |
| 1 | Bulgarian split squat | 2 × 8–10/leg | 150 sec after both legs | `db-split-squat` |
| 2 | Machine glute kickback / hip extension | 2 × 10–15/leg | 90 sec after both legs | `machine-glute-kickback` |
| 3 | Glute drive | 2 × 6–10 | 150 sec | `glute-drive` |
| 4 | Lying leg curl | 2 × 10–15 | 90 sec | `lying-leg-curl` |
| 5 | Incline dumbbell bench press | 2 × 8–12 | 90 sec | `db-incline-bench` |
| 6 | Incline chest-supported dumbbell row | 2 × 8–12 | 90 sec | `db-chest-supported-row` |

Glute drive is the sole approved weekly repeat and deliberately comes third on C. Earlier
glute work may reduce the appropriate load; use the prescribed RIR rather than trying to
match a fresh first-exercise performance. The last two exercises can reuse an
adjustable bench, performing all press sets before changing its angle for rows. Machine
kickback is a distinct load identity from cable kickback; its strength numbers are not
directly comparable. All 18 slots reference existing shared catalog exercises.

## Exact differences and similarity

Compare exercise occurrences within each day, ignoring order and machine brand/model.
Rest changes and exercise ordering are additional prescription changes, not extra exercises.

| Day | Active exercise replaced | New exercise | Retained on that day |
| --- | --- | --- | --- |
| A | Machine chest press | Flat dumbbell bench | 5 of 6 |
| B | Leg extension | Cable glute kickback | 4 of 6 |
| B | Standing calf raise | Dumbbell reverse lunge | Included above |
| C | Machine horizontal row | Chest-supported dumbbell row | 4 of 6 |
| C | Machine ab crunch | Machine glute kickback | Included above |

Total: **13/18 = 72.2%** exercise retention versus the active copy. Versus the shared
template it is **12/18 = 66.7%**, because its C seated curl also becomes a lying curl.
There are **17 distinct exercise IDs across 18 slots**. Glute drive appears on A and C
as the sole approved repeat. Similar kickback, curl, lunge and pressing variations are
intentional; no other exact exercise repeats.

## Weekly emphasis and recovery

| Measure, normal training weeks | Active baseline | Glute Focus |
| --- | --- | --- |
| Total working sets | 36 | 36 |
| Lower body / upper body / core isolation | 22 / 12 / 2 | 24 / 12 / 0 |
| Thrust sets | 4 | 4, glute drive on A and C |
| Kickback sets | 0 | 4, split between cable and machine |
| Abduction sets | 2 | 2 |
| Additional glute-involving compound sets | 8 | 10, including the added reverse lunge |
| Curl + RDL sets | 6 | 6 |
| Squat/lunge/leg-extension sets | 8 | 8, with lunge replacing extension |
| Direct calf / abdominal sets | 2 / 2 | 0 / 0 |

Thrust/kickback/abduction work increases from six to ten sets. Additional compounds also
involve glutes, but summing these as 20 identical effective glute sets would be misleading.
The total workload stays constant while local glute demand increases. Two sets per leg
means each leg gets two sets, not four. Time includes both sides.

This is a glute-specialization block, not an equal-priority whole-body program. Do not
automatically add sets. If performance or movement quality persistently declines, or
recovery is inadequate by the next session, reduce accessory work or use an easier week.
The expected advantage is better allocation toward the stated goal, not proven greater
growth than the baseline. Assess adherence, rep/load progress at comparable RIR, comfort
and recovery over several exposures before increasing volume.

## Effort and progression

Preserve the familiar phase schedule. These are manageable coaching defaults, not a
claim that scheduled deloads or this exact periodization outperform simpler programming.

| Weeks | Target RIR | Working sets per exercise |
| --- | --- | --- |
| 1–2 | 3 | 2 |
| 3–5 | 2 | 2 |
| 6 | 4 | 1 |
| 7 | 3 | 2 |
| 8–9 | 2 | 2 |
| 10–11 | 1–2; newer lifters stay at 2 | 2 |
| 12 | 4 | 1 |

Use the app's existing progression: add reps within the range; when the first working
set reaches the ceiling, the app suggests more load and returns to the rep floor. Take
the increase only when technique and prescribed effort hold across the work; log actual
RIR and override an overly large increase. RIR ranges resolve conservatively to their
upper bound. At four RIR the current engine recalculates recovery load without advancing
the normal load progression. All 18 slots halve to one set in weeks 6/12.

Treat each variation and station as its own progression history. Do not copy cable loads
to a machine kickback. Glute drive has different rep ranges and exercise positions on A
and C; preserve their slot-specific targets. The first block includes
calibration of new stations, not targets inferred from a different exercise's stack.

## Kickback execution, logging and equipment

- Cable: low pulley and ankle cuff, light initial load, hand support, stable pelvis;
  extend the hip without swinging or arching the lower back. Use a controlled return.
  This is an ordinary hip-extension kickback, not an attempt to reproduce Vixen's
  differently named high-cable variation.
- Machine: use a dedicated glute kickback/hip-extension machine and follow its pad/pivot
  setup. A glute-drive/bridge machine is not a kickback machine.
- For unilateral work, perform the prescribed reps on each side, then rest. Start with
  the weaker side, match its clean reps on the stronger side and record one paired set
  using the weaker side's reps/RIR. Log one working stack for kickbacks and one dumbbell's
  weight for dumbbell lifts; do not add the two sides together.
- The [StrengthLog technique guide](https://www.strengthlog.com/cable-glute-kickback/)
  provides the cable movement reference. Paired-set logging and exact rep/rest targets
  above are this proposal's conventions, not findings from a hypertrophy trial.
- This template requires a commercial gym with both cable and dedicated machine kickback
  options and a glute-drive machine. Select/calibrate actual stations through the existing
  flow. If equipment is absent, choose another available variation in the
  builder; check that it does not duplicate another day. A missing machine should not
  silently create a second weekly cable kickback.

## Approved decision and implementation boundary

Approved as a separate gallery template, `glute-focus-women-3x`, with 17 distinct
exercises across 18 slots, glute drive as the only weekly repeat, and a 45–60-minute
budget. The final C order was approved before implementation.

**Reason:** preserves the familiar schedule and 67–72% of exercises while adding cable
and machine kickbacks and another unilateral compound. The user's glute-drive exception
takes precedence over the earlier no-repeat rule and original similarity target.

**Risk/tradeoff:** greater local glute fatigue, longer B/C sessions, more equipment
requirements, and no direct calves or abs. Variety entails separate calibration and
progression for each station; no superior growth outcome is guaranteed.

The template lives in `src/lib/program-templates.ts` and appears through the existing
gallery and template-creation action. Existing accounts receive an inactive copy when
they choose it; an account without programs receives an active first program. No new
schema, migration, automatic activation or update to existing program copies is needed.
Station variants are selected/calibrated through the existing workout flow.

## Verification

- Baseline and active phase schedule verified with owner-scoped read-only queries.
- Baseline source inspected at HEAD `61bd15ae1fa9815cf394cd1445378cff43e6a094`.
- Catalog IDs, the sole glute-drive repeat, C exercise order, similarity and volume
  arithmetic checked locally.
- Research uses public first-party program material and published research; paid plans
  were not accessed. The newest regional-hypertrophy study was assessed at abstract level.
- Template tests cover catalog/pattern validity, the sole glute-drive repeat, C order,
  phase coverage and effective set/RIR prescriptions across all twelve weeks.
- `npm run verify` passed typecheck, lint, the strict indexed-access slice, all 1,198
  tests (one skipped) and the production build. All 18 implemented prescriptions were
  also compared with the approved table, including order, sets, rep ranges and rests.
- Authenticated browser verification was unavailable locally. The existing shared
  gallery/action path is reused without UI or persistence changes.
- Real-workout timing remains a planning estimate, not a measured gym result.
