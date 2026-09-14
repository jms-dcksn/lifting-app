# Strong Foundations · Women's Glutes & Legs

Shared template ID: `strong-foundations-women-3x`. Original 12-week plan for
beginner/intermediate women who want glute/thigh development with modest upper-body
volume. Three nonconsecutive days, such as Monday/Wednesday/Friday. Instantiated
through the existing template action; no database migration or per-user seed required.
Existing accounts receive an inactive copy when they choose the template. The September 14
variety revision also updates recognizable existing copies through a one-time data migration.

## Sessions

Each exercise has two working sets. Warm-up sets are additional and should stay easy.

| Day | Exercises in order (reps) |
| --- | --- |
| A | Leg press 6–10; glute drive 8–12; seated leg curl 10–15; machine chest press 8–12; seated cable row 8–12; seated hip abduction 12–20 |
| B | Romanian deadlift 8–10; hack squat 8–12; leg extension 10–15; lat pulldown 8–12; dumbbell shoulder press 8–12; standing calf raise 10–15 |
| C | Glute drive 6–10; Bulgarian split squat 8–10/leg; seated leg curl 10–15; dumbbell incline bench 8–12; machine row 8–12; cable crunch 10–15 |

Normal weekly workload: 36 working sets, comprising 22 lower-body sets, 12 upper-body
sets, and two core sets. Quads receive eight compound/isolation sets; hamstrings
receive six curl/hinge sets. Glute involvement includes four thrust, two hinge,
two leg-press, two hack-squat, two split-squat, and two abduction sets; these are overlapping exposures, not equivalent
isolated glute sets. No direct arm isolation is needed for this time budget.

## Effort and progression

| Weeks | RIR (reps in reserve) | Working sets per exercise |
| --- | --- | --- |
| 1–2 | 3 | 2 |
| 3–5 | 2 | 2 |
| 6 | 4 | 1 |
| 7 | 3 | 2 |
| 8–9 | 2 | 2 |
| 10–11 | 1–2 (beginners stay at 2) | 2 |
| 12 | 4 | 1 |

These are executable phase rules, not just prose. Rep ranges stay unchanged across
all weeks. The app advances from the first working set for each slot/exercise:
below the range recalibrates load, within the range targets another rep, and reaching
the ceiling suggests the exercise's load increment and resets to the rep floor.
The existing weight-increase trigger is reps-only, not RIR-gated. Users must preserve
technique and the prescribed RIR, overriding suggested loads when needed. Recovery
weeks explicitly call for lighter loads as needed; the engine does not automatically
suppress a load increase simply because a week is a deload.

## Time and gym availability

Planning target: 35–44 minutes. Budget eight minutes for warm-up/ramp sets, six for
station setup, nine for working sets (45 seconds each), and 19–20 minutes for all
listed rests, including a conservative rest after the last set of each exercise.
That yields 42–44 minutes without equipment queues. Day C budgets 105 seconds per
split-squat set for both legs and switching, adding two minutes versus bilateral work.
Complete both legs, then rest 120 seconds; log one set with the weaker leg's reps/RIR
and one dumbbell's weight. Start light, use support for balance, and use leg press as
a fallback if split squats are not yet comfortable. RDL rests are 150 seconds;
leg press/thrust 120; curls/extensions/upper-body work 90; final accessories 60.
No supersets requiring two occupied stations. At minute 40, finish the current
exercise and skip remaining accessories to protect the under-45-minute limit.

Choose each machine's brand/type and calibrate it before working sets. Keep equipment
consistent when practical. Use the existing swap flow if equipment is occupied:
glute drive → barbell hip thrust, leg press → hack squat, chest press → dumbbell bench,
seated cable row → machine row. A new machine needs its own calibration; do not copy
stack weights between machines. Abduction remains abduction even though the current
catalog groups it in the hip-thrust pattern. New lifters should learn the RDL with
light loads and competent technique instruction before progressing it.

## Research and design rationale

- [Bret Contreras: Strong Curves overview](https://bretcontreras.com/strong-curves-a-womans-guide-to-building-a-better-butt-and-body-sample-and-coaching-consultation-giveaway/)
  describes 12-week glute-focused routines for different experience levels. Inspiration
  is the glute emphasis within broader resistance training; this is not a reproduction
  or an official Strong Curves program.
- [Bret Contreras: basic workout template](https://bretcontreras.com/basic-template/)
  combines knee/hip-dominant work with pressing/pulling and progressive resistance.
- [Macros Inc: beginner glute plan](https://macrosinc.net/workout/beginner-glute-workout-plan/)
  uses three weekly sessions with lower-body priority and upper-body work. Its stated
  45–60-minute sessions exceed this request, so this plan limits exercises and sets.
- [ACSM 2026 resistance-training guidance](https://acsm.org/resistance-training-guidelines-update-2026/)
  supports consistent training, progressive loading, and goal-specific volume. The
  current plan starts with manageable volume and leaves reps in reserve rather than
  prescribing routine failure. The phase schedule is a coaching choice for practice
  and fatigue management, not a claim that elaborate periodization is essential.

A defined appearance reflects muscle development and body composition. Exercise cannot
promise fat loss from a chosen area, a specific shape, or an absence of muscle growth.
Upper-body volume is modest to prioritize the user's preferred proportions, not because
women require a different biological mechanism for building muscle.


## September 14 variety revision

Four of 18 slots change: B leg press → hack squat; C leg press → Bulgarian split
squat, chest press → dumbbell incline bench, and cable row → machine row. A is
unchanged. A/C overlap falls from five exercises to two (glute drive and seated curl).
The remaining repetitions are deliberate progression anchors. Exercise selection stays
stable across all 12 weeks; weekly volume, upper-body allocation and phases stay unchanged.
This is a coaching choice to improve variety while keeping the program learnable.

Expanded research, reviewed September 14, 2026:

- [Kassiano et al., 2024, randomized study in 33 untrained young women](https://journal.iusca.org/index.php/Journal/article/view/284):
  adding hip thrusts to leg press and stiff-leg deadlift training improved measured glute
  thickness more over ten weeks. The extra exercise also adds volume, so this does not
  establish that variety alone caused the improvement or that this exact plan is optimal.
  It supports retaining thrust work within a broader lower-body routine.
- [Plotkin et al., 2023, squat versus hip thrust trial](https://pmc.ncbi.nlm.nih.gov/articles/PMC10349977/):
  similar glute growth, with greater thigh growth from squats. This informs combining
  squat-pattern and thrust work; it does not directly test hack squats or this program.
- [Girls Gone Strong: glute training](https://www.girlsgonestrong.com/blog/articles/3-moves-super-charge-glute-training/):
  coaching guidance incorporates split squats and hip-extension work. We use ordinary,
  controlled split-squat reps, not its advanced tempo variations. This is practical
  coaching inspiration, not comparative hypertrophy evidence.

### Existing copies and verification

`20260914224239_strong_foundations_variety.sql` updates active and inactive classic
12-week copies with the original name, description prefix and recognizable day/slot
structure. Each replacement requires the original prescription and exercise family;
owner-matched machine variants qualify, while different exercises or customized
prescriptions are preserved. No strength calibration is copied to a new exercise.
Renamed or substantially restructured programs are intentionally outside this backfill.

Program, day and slot IDs, activation, completed sessions, phase rules, and all set logs
are preserved. The migration aborts if an eligible program has an unfinished workout;
finish it and retry. Short transaction locks prevent a workout starting during the update.
The migration is idempotent. Existing workout-only planner selections remain intentional
overrides; reset those selections to use the revised defaults.

Template tests check catalog identity, phase rules, distinct day selection, volume and
an under-45-minute planning budget including both split-squat legs. The SQL regression
script exercises the migration in a rolled-back transaction, including unchanged history,
custom prescriptions, unrelated programs, machine variants and repeat execution.
