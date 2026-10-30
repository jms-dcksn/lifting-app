# Compact layouts: design investigation for issue 249

Design proposal, October 29, 2026. Review against [issue 249](https://github.com/jms-dcksn/lifting-app/issues/249), checkout `d3e8c46`, the [approved editor mock](plan-editor-mock.html), [planning contract](WORKOUT-PLANNING.md), and [UI conventions](UI.md). The owner approved this direction and requested implementation. This document retains the original design evidence; [implementation and verification](compact-layouts-implementation.md) and [UI conventions](UI.md) describe the resulting production behavior.

Open the [interactive three-screen study](compact-layouts-mock.html). Theme, scenario, and layout controls live above the screens. Changes are sample data in memory and reset on reload. Each screen can also open independently with `?screen=plan`, `?screen=active`, or `?screen=builder`; add `&theme=light` and `&state=recovery` as needed. The production column remains capped at 512px.

## Recommendation

| Surface | Decision | What transfers | What needs its own treatment |
| --- | --- | --- | --- |
| Read-only plan | **Adopt** compact headers and aligned set rows | Small artwork, clear equipment identity, stable numerical columns | Plain text values, explicit Suggested / Your target, distinct rows for different prescriptions; one Start action |
| Active workout | **Adapt** | Compact identity, aligned completed results, secondary tools in More | Large steppers, explicit next-set target, strong Log action, separate saved results, persistent timer, accessible history and out-of-order exercise entry |
| Program builder | **Adapt** | Compact headers, visible change/reorder, secondary tools in More | One prescription per exercise: Sets / Rep range / RIR. No per-set table or target loads: current program contracts store exercise defaults |

Beauty should come from hierarchy, spacing, consistent alignment, and the existing artwork. Keep the near-monochrome semantic palette, 24/16/14/12 product type scale, 16px cards, 12px controls, and native input affordances. The larger typography on the study cover is presentation chrome, not a proposed product type scale. Color remains meaningful: recovery/equipment context uses calibration color; record gold appears only in the explicit record fixture.

## Research and visual references

These are design inputs, not evidence that the proposed screens improve task performance.

| Source | Finding | Application |
| --- | --- | --- |
| [NN/g: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Keep frequent work at the first level; defer infrequent or advanced work behind clear entry points | Change exercise, reorder, log and history stay visible. Tempo editing, superset configuration, pinning and bulk tools may move into named sheets |
| [NN/g: Recognition and Recall](https://www.nngroup.com/articles/recognition-and-recall/) | Visible context reduces dependence on memory | Keep prescribed reps/RIR beside the next entry; preserve equipment, target provenance, and completed results |
| [W3C: Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) | Enhanced target-size guidance uses 44×44 CSS px, with exceptions | Follow the app's stronger 44px control contract. WCAG 2.2 AA's [minimum criterion](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) is 24px with exceptions; 44px is not a blanket AA requirement |
| [Hevy](https://www.hevyapp.com/) and its [official logging screenshot](https://www.hevyapp.com/wp-content/uploads/image-2-768x785.png) | A concrete reference for aligned set values, completion, previous performance, and a persistent workout context | Borrow the set-table clarity and separation of completed work. Do not import social surfaces or expand this app's scope |
| [Strong](https://www.strong.app/) | Useful product reference for the workout-as-notebook model and keeping tracking out of the way | Favor direct entry and a restrained visual hierarchy. The official embedded screen image could not be fetched; this is a product-positioning reference, not a claimed visual audit |
| [Fitbod](https://fitbod.me/) | Personalized strength recommendations incorporate equipment and recovery | Keep recovery and equipment visible beside the plan. The visual design recommendation is ours; the site copy does not establish usability performance |
| [Apple Fitness Summary](https://support.apple.com/guide/iphone/see-your-activity-summary-iph4c34a8a95/ios) | Progress is summarized and can be personalized | Use a compact progress summary in the workout header. Preserve whitespace around the main action rather than adding more dashboard tiles |

Hevy's official visual was inspected through the web tool. No third-party app imagery is copied into this repository. The mocks reuse this app's existing charcoal/ivory exercise art, which already gives the interface a distinctive visual identity.

## Current layout audit

Source review, not a signed-in production session:

- **Plan:** `workout-planner.tsx` gives each exercise an Exercise row, 114×64 art, equipment hierarchy, tempo, individually bordered and padded set fieldsets, rest prose, and previous notes. Each set repeats “reps”, “RIR”, “lb”, and target provenance. The approved edit mode already uses the smaller 64×36 art and a table, making the view mode visually larger than editing. Edit remains a page-level action; Start remains sticky.
- **Active:** `active-session.tsx` renders large exercise identities, history/swap/pin tools, prescription/progress, tempo, exercise details, recommendations, logged rows with Edit/Delete, and three steppers with Log set. Rest and Finish share the footer. The proposed design preserves the entry size while reducing the repeated header/tool scaffolding. Finish moves to the top; rest owns the bottom. Removing the current high-emphasis Finish action from the footer is a usability hypothesis to review.
- **Builder:** `program-builder.tsx` starts with program metadata/style/phases, then day cards. Each exercise exposes Sets, Rep min, Rep max, RIR, four tempo values, Rest, Superset group, and Adaptive patience when relevant. Exercise/day reorder and removal are always visible. The proposal combines the rep range into one named sheet, keeps common exercise controls visible, and moves secondary settings out of each card. Program metadata uses a Settings entry and days use explicit buttons rather than requiring a long vertical scan on phones.

## Comparison and representative tasks

Measured in Chromium at 390×844, using the same sample data. “Current structure” is a simplified source-based reconstruction in the prototype, not a production screenshot or an exact replica. It omits some conditional recommendation, readiness, phase, and exercise-note content. The active reconstruction particularly understates the current tool density. Treat these as layout-study measurements, not production savings.

| Surface / fixture | Current reconstruction | Proposed | Interpretation |
| --- | ---: | ---: | --- |
| Plan exercise, 3 sets | 413px card | 294px card | 29% less card height; all set targets remain visible |
| Plan, 6 exercises / 18 sets | 2,628px scroll content | 1,918px | 27% less content; maximum scroll travel 2,032 → 1,322px in a 596px pane |
| Active exercise, 1 set logged | 509px card | 481px card | 6% less height; focus and clear state matter more than density |
| Active, 6 exercises | 1,471px scroll content | 1,378px | Small reduction; upcoming exercises remain reachable, with explicit Log this exercise |
| Builder exercise | 390px card | 255px card | 35% less card height; rare controls require an extra disclosure step |
| Builder, selected day / 3 exercises | 1,490px scroll content | 1,085px | 27% less content; maximum scroll travel 874 → 469px in a 616px pane |

Task counts below are structural estimates from the source and mock, not timed participant observations. Text entry is excluded from activation counts.

| Task | Current | Proposed | Tradeoff |
| --- | --- | --- | --- |
| Scan three sets and start | Scroll as needed, Start once | Scroll as needed, Start once | Fewer pixels, same action count; smaller art |
| Check target provenance | Repeated on every set | One label for a uniform exercise target; distinct row values stay visible | Mixed provenance would need per-row labels in production; do not silently merge it |
| Log prefilled set | Log once | Log once | Keep steppers visible and retain failed entry |
| Adjust load by one increment and log | Plus, Log: 2 activations | Plus, Log: 2 | On 320px, plus/minus controls stack vertically to retain 44px targets |
| View history | History, close: 2 | History, close: 2 | Remains a common action, not buried in More |
| Edit logged result | Edit, Save: 2 | Edit icon, Save: 2 | Icon needs an exercise/set-specific accessible name; Delete moves to secondary editing tools in production |
| Change rep min and max in builder | Focus 2 fields | Open Rep range, focus 2 fields, Done: 4 | More actions, clearer range; validate with users before adopting |
| Change rest in builder | Focus field | More, focus field, Done: 3 | Extra disclosure for an occasional setting; rest summary stays visible |
| Reorder exercise | Up/down once per position | Up/down once per position | Keyboard-compatible; no drag-only interaction |
| Add exercise | Add, search, choose | Add, search, choose | Same flow, less preceding content |
| Finish workout | Footer Finish, confirmation | Header Finish, confirmation | Same activation count; less thumb-friendly. Evaluate reach with one-handed use |

No claim of faster logging, fewer errors, better adherence, or preferred aesthetics has been validated with participants. The mock's denser presentation may be harder to learn, and rep-range sheets add taps. A quick moderated comparison should ask users to find set 2's target, explain whether a number is a target or saved result, change a range, log a set and recover from an error.

## States and edge cases

| Case | Mock treatment | Production requirement / limitation |
| --- | --- | --- |
| View vs edit vs log | Plan values are plain text until Edit; builder values have input surfaces; logged values have checkmarks and a named Edit control; next entry has steppers and Log | Keep draft, pending, saved, and failed states explicit; no optimistic success copy before acknowledgment |
| Different per-set targets | “Different set targets” scenario uses 135 / 125 / 115 lb and distinct rep/RIR ranges; individual plan edits update only that row in memory | Reuse canonical planned-set data; never reduce varied sets into an average or a single prescription |
| Suggested vs manual | Uniform provenance shown next to tempo; sample includes Suggested and Your target | For mixed provenance, show row-level provenance, including manual overrides, and use current canonical matching rules |
| Recovery | Effective 2-of-normal-sets pattern and 4 RIR context in scenario; targets are fixture values | Recovery percentages/loads are illustrative, not new training rules. Production uses existing recovery helpers; program-scope editing shows normal-week intent |
| Unresolved equipment | Choose equipment is visible on plan and active; builder also exposes it in its fixture. Choosing updates a sample station | Preserve existing contract: unresolved workout capture may start, but that exercise cannot be logged until resolved. Do not invent a global Start blocker |
| Superset | A1/A2 labels, no rest before A2, round-rest summary | Scenario is illustrative; prototype group selector does not enforce canonical adjacency/normalization, and its timer is not a superset engine. Production retains canonical group ordering and starts rest only after the round |
| Completed and records | Saved rows remain visible; completion shown after all sets; Record feedback scenario has a fixture rep PR, with gold used only there | Production uses existing workout record helpers; no UI-side record inference. Do not fade saved PRs below useful contrast |
| Arbitrary exercise order | Log this exercise switches the focused sample card and retains each exercise's sample results | Keep all exercises independently accessible. Follow-up implementation must decide whether to retain document order when expanded; prototype brings the focused card to the top |
| Empty and long | Empty scenario has an Add action; long scenario has 12 exercises and long equipment names that wrap | Keep errors and actions reachable; preserve visible equipment identity; do not truncate the distinguishing station name |
| Failure | Save failure scenario retains draft; failed Log leaves entry intact and shows error | No real network writes or optimistic reconciliation are simulated |
| Reload and navigation | Prototype explicitly resets on reload; edits are memory-only | Production retains existing draft guards, save scope, and failure behavior. Prototype is not proof of persistence, remount safety, or reload recovery |
| Details and settings | History, notes, tempo, program settings, and options sheets show intended disclosure placement | Some secondary tools are placement sketches: tempo/note field values, pinning, program phases/metadata and deletion undo are not fully modeled |
| Bodyweight and assisted loads | Not modeled by sample controls | Retain current reps-only/assisted Stepper semantics and exact station/loading identity. Do not replace them with ordinary-pound fields |

## Accessibility and responsive review

- Checked all three screens at 320px and 390px, plus a 1280px desktop viewport with the existing 512px column cap, in both themes. Proposed screens had no horizontal card/pane overflow. The design board also shows all three screens side by side on desktop.
- Checked all eight special scenarios at 320px for all three screens. Every rendered proposed-screen button met 44×44px. Small read-only set rows do not need to be touch targets; edit buttons do.
- Container queries stack the active stepper buttons below 350px. This deliberately uses more vertical room. The Log control remains reachable above the fixed footer in the 320×844 sample.
- Native buttons/inputs, scoped table headers/captions, `aria-pressed` day buttons, named icon controls, status/error roles, visible focus rings, and native modal dialog semantics are present. Tested Escape and focus return, including after a re-render. Dialog Tab wrap was added explicitly.
- Screen-reader naming was inspected programmatically; no VoiceOver/NVDA session was run. Full accessibility compliance, native iOS keyboard behavior, browser zoom, touch-device ergonomics, and production safe-area behavior remain to verify. No claim of a complete accessibility audit.
- The prototype exposes no new animation beyond a small pressed state; reduced motion is respected. The product implementation should reuse existing Sheet transition timing and dismissal/dirty-draft guards.

## Reuse and implementation slices after design review

1. **Read-only plan first:** reuse `PlannedSetTable`'s alignment with a semantic read-only variant, `ExerciseCardLabel`, `ExerciseVisual` small, existing `PageHeader`, `Button`, and previous-notes sheet. Preserve set-level provenance and recovery behavior. This is the smallest and clearest density win.
2. **Active workout identity and results:** adapt the compact header and completed-set alignment while retaining the existing `SetEntry`/`Stepper`, absolute-timestamp rest state, history, setup/notes, record calculations, error rollback, and exercise selection. Review header Finish placement before changing it. Avoid changing persistence or workout sequencing.
3. **Builder exercise shell:** keep per-exercise Sets / Rep range / RIR, visible Change and reorder, and More for rest/tempo/superset/patience. Reuse the existing picker, station resolver, Sheet, Input, and validation. Do not introduce per-set program storage. Test the added rep-range sheet steps before committing to that interaction.
4. **Builder organization separately:** review day navigation and Settings disclosure as an independent slice. Preserve all days, progression styles, tags, descriptions, phases, and save/cancel semantics; the mock intentionally sketches only their entry point.

These are proposed follow-ups, not new GitHub issues, implementation approvals, or shipped decisions.

## Verification and handoff

These results describe the original design-only phase. The [implementation plan](compact-layouts-implementation.md) and its PR record the subsequent application changes and current verification.

The standalone HTML was exercised in real headless Chromium with the repository's installed Playwright, using only local fixture data. No authenticated application, Supabase, paid model, or external write was used. Screenshot and machine-readable evidence is under `/workspace/artifacts/issue-249/` in this workspace.

Checks: 18 viewport/theme combinations and 24 narrow scenario combinations; no page-script errors, proposed card/pane overflow, or undersized buttons in those cases. Interaction checks covered load stepper, log/result insertion, automatic timer, editing saved results, history, Escape/focus return, out-of-order exercise selection, builder range/add/save feedback, per-set plan draft, and failed-log retention. Additional targeted checks cover modal Tab wrap, unresolved equipment, supersets and record fixtures.

The source-based baseline is intentionally simplified; metrics are reproducible layout observations, not exact production captures. Application/base/database/hosted CI checks are not evidence for this docs-only design study. Migration: none. No application code changed. No PR, issue comment, label, push, or merge is part of this investigation.
