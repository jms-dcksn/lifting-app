# Documentation map

[AGENTS.md](../AGENTS.md) is the sole agent-instruction entry point; `CLAUDE.md` imports it.
Read only the topic needed for the task. Source and tests establish implemented behavior;
if they conflict with an explicit decision, flag the conflict before changing that decision.

| Purpose | Owner |
| --- | --- |
| Setup and product overview | [README](../README.md) |
| Environment, migration and deployment operations | [DEPLOY](../DEPLOY.md) |
| Visual map of experiences, request path, and why the system stays fast | [Architecture map](architecture.html) |
| Current module boundaries and engine/data invariants | [Architecture](ARCHITECTURE.md) |
| Shared components and UI gotchas | [UI conventions](UI.md) |
| Copy density (proposed) | [2026-09-16 spec](superpowers/specs/2026-09-16-visual-copy-density-design.md) |
| Exercise review (Slices A–F shipped) | [2026-09-19 spec](superpowers/specs/2026-09-19-exercise-review-design.md) |
| Shipped behavior | [Features](FEATURES.md) |
| Rationale and record eligibility | [Decisions](DECISIONS.md) |
| Weekly facts, proposals, private API | [Coach report](COACH-REPORT.md) |
| In-app agent, chat overlay, or AI Coach slices | [AI Coach](AI-COACH.md) |
| Active substitutions / pre-workout choices | [Exercise swaps](EXERCISE-SWAPS.md), [planning](WORKOUT-PLANNING.md) |
| Weight observations, charts and goal distance | [Calendar](WEIGHT-CALENDAR.md), [trends](WEIGHT-TRENDS.md) |
| Monthly comparisons, shared stall evidence, or period × performance weeks | [Monthly progress](MONTHLY-PROGRESS.md) |
| Tape sites on Body | [Body measurements](BODY-MEASUREMENTS.md) |
| Track Explore destinations, body measurements, or per-exercise volume | [Track body and volume plan](superpowers/plans/2026-09-19-track-body-volume.md) |
| Strong Foundations template rationale | [Strong Foundations](STRONG-FOUNDATIONS.md) |

[PLAN](PLAN.md) mixes completed milestones with remaining work; its original estimates and
phase checklists are historical. [SPEC](SPEC.md) is the original MVP baseline, superseded
where later decisions and feature contracts say so. [UX-AUDIT](UX-AUDIT.md) records the P6
baseline, not a current bug list. Files under `superpowers/plans/` and `superpowers/specs/`
are dated design/implementation records; their commands and file maps are not current runbooks.

As of 2026-09-19: the Lift/Track/Program/You tab shell (epic #93), cinematic recap, Track
compounds/pins, the monthly dashboard (#31), the period × performance week overlay (#105),
exercise review Slices A–F (#115 dump removal, #116 one destination, #117 Today / 21-day / chart, #118 month-to-month, #119 entry equipment params),
and coach check-in QoL (#126: ranked proposals with Do first / Also tiers, collapsed insufficient-data trends, specialization hard-set shortfall flag)
are implemented. See [Features](FEATURES.md) for current behavior. Issue numbers here identify
planned slices, not a live GitHub status check. Historical verification counts describe their
original runs. AI Coach slices are specified in [AI-COACH.md](AI-COACH.md) and are not
shipped; Slice 0 is the next build.

Update the owning document when behavior changes. Keep root instructions short, link new
contracts by task trigger, and avoid copying inventories or counts available in source.
Local `.claude/LAST_SESSION.md` is a handoff, not an authoritative deployment/status record.
