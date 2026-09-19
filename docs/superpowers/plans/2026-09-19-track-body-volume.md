# Track body and volume plan

Track Explore becomes the selector for Coach, Body, and Volume.
Coach leaves You.
Bodyweight and tape measurements share one Body page.
Total volume gets its own page, then a per-exercise weekly picker.
The program runs PR1 (#129), PR2 (#130), and PR3 (#131) under autopilot-stack.
The operator lands the stack.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-stack.md`. The operator lands PR1, PR2, and PR3 after each is merge-ready. Owners do not merge.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] On the operator's go, arm a `/goal` with this exact text. "Run `docs/superpowers/plans/2026-09-19-track-body-volume.md`. PR order is #129, #130, #131. Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. The operator lands the stack. Done when Explore opens Coach, Body, and Volume, Body charts tape sites next to weight, and Volume can show weekly tonnage for one exercise."
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `git show origin/main:pstack/skills/swarm/SKILL.md`
  - [ ] `git show origin/main:docs/UI.md`
  - [ ] `git show origin/main:pstack/skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `git show origin/main:pstack/skills/principle-experience-first/SKILL.md`
- [ ] Arm the 30-minute audit tick. In a local session, a real terminal `/loop`. In a cloud root, a cloud-sleeper wake chain. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk and the armed /goal. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a status message to the operator in chat, whether or not anything changed, with the queue table of PR, owner, state, and head SHA, the verdicts since the last tick, what merged, open operator gates, and blockers."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges, or base it on the parent branch when the execution playbook stacks.
  - [ ] PR1 (#129) is first. Branch from `main`.
  - [ ] PR2 (#130) after PR1. Body route must exist.
  - [ ] PR3 (#131) after PR1. Volume route must exist. PR2 and PR3 may stack in parallel on PR1.
- [ ] Hold the file boundaries. PR1 owns Explore, Coach route, Body route shell, Volume route shell, and You. PR2 owns measurement schema, actions, and the Body inches chart. PR3 owns volume filtering and the Volume picker.
- [ ] Hold the review gate. PR1, PR2, and PR3 change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Default to `gh`; if `command -v origin` succeeds and Origin can resolve the repository, use `origin pr` for every PR operation. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, with `origin pr create --status open --base <base-branch>` or `gh pr create --base <base-branch>` according to the resolved forge. A stack child targets its parent branch.
- [ ] Run the repo's lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-reviewer comment per `../references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before babysit and again before the merge-ready report.

### Verdict and merge, for every PR

- [ ] At the merge-ready head SHA, run the swarm per `pstack/skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. One audit lane that reads the diff and the receipts and distrusts the PR body.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner. A new head gets a fresh swarm and a fresh verdict.
- [ ] The root appends the PR to the base-branch stack. The operator lands it bottom-up. Patch-id must match the verdict diff after rebase.

### Boot recipe, for every live lane

Each live lane runs on its own cloud VM at the PR head. Drive through the browser against the Next.js app. `control-ui` from cursor-team-kit is the intended skill. If that skill is missing in this checkout, use Playwright or Chrome against `npm run dev` and record that fallback.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Run `npm run dev` and wait until the app is reachable. Sign in with the preview account when credentials exist. If they do not, drive `/login` and record that later authenticated screens are blocked.
- [ ] Deliver input only through the browser. Read-only diagnostics are the Network tab, the URL bar, and `aria-current` on the tab bar.
- [ ] Save every screenshot to `/tmp/swarm-<pr-id>/worker-<n>/<slug>.png` and return the paths with the report.

## Move Coach onto Track Explore (PR1)

**Depends on.** None. GitHub issue #129.

**Files.**

- [ ] Edit `src/app/(app)/analytics/track-explore-menu.tsx`.
- [ ] Edit `src/app/(app)/analytics/page.tsx`.
- [ ] Edit `src/app/(app)/settings/page.tsx`.
- [ ] Edit `src/app/(app)/settings/coach-section.tsx`.
- [ ] Edit `src/app/(app)/analytics/month/review.tsx`.
- [ ] Create `src/app/(app)/analytics/coach/page.tsx`.
- [ ] Create `src/app/(app)/analytics/body/page.tsx`.
- [ ] Create `src/app/(app)/analytics/volume/page.tsx`.
- [ ] Edit `src/lib/track-explore-menu.test.tsx`.
- [ ] Edit `src/lib/app-chrome.test.ts`.
- [ ] Edit `docs/FEATURES.md`.
- [ ] Edit `docs/UI.md`.
- [ ] Edit `README.md`.
- [ ] Edit `docs/WEIGHT-TRENDS.md`.

**Build.**

- [ ] Turn Coach, Body, and Volume into Explore links like Month review. Nested panels stay only for this week's PRs and All lifts. `CoachSection` renders on `/analytics/coach`. Weight charts render on `/analytics/body`. The current total volume card renders on `/analytics/volume`. You drops Coach. Stall links use `/analytics/coach?exercise=`.

**You see.**

- [ ] Explore lists This week's PRs, Month review, All lifts, Coach, Body, and Volume. Opening Coach shows the check-in on Track. Opening Body shows the weight chart. Opening Volume shows total weekly tonnage. You has no Coach card.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/lib/track-explore-menu.test.tsx` asserts Coach, Body, and Volume hrefs, and no Volume & weight panel. Run `npm test -- src/lib/track-explore-menu.test.tsx src/lib/app-chrome.test.ts src/lib/app-shell.test.tsx`.
- [ ] Chrome tests keep Track current on `/analytics/coach`, `/analytics/body`, and `/analytics/volume`.
- [ ] Lint, typecheck, and `npm run build`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open Track Explore at trunk and head. If trunk lacks the new rows, record that and gate the head list plus the Coach page the user waits for. Save `pr1-lane1-explore.png`. Pass when head Explore includes Coach, Body, and Volume and trunk still shows Volume & weight.
- [ ] Lane 2. Open Coach from Explore. Save `pr1-lane2-coach.png`. Pass when the check-in heading is visible and Track is `aria-current`.
- [ ] Lane 3. Open Body from Explore. Save `pr1-lane3-body.png`. Pass when Bodyweight trend is on its own page with a back link to Track.
- [ ] Lane 4. Open Volume from Explore. Save `pr1-lane4-volume.png`. Pass when Total volume is on its own page and not inside the Explore sheet.
- [ ] Lane 5. Open You. Save `pr1-lane5-you.png`. Pass when Coach is absent and weight, rest, and sign out remain.
- [ ] Lane 6. From Month review, follow a stall Coach link when a stall exists, otherwise load `/analytics/coach?exercise=bb-bench`. Save `pr1-lane6-stall.png`. Pass when the URL is a Track Coach route.
- [ ] Lane 7. Open All lifts from Explore. Save `pr1-lane7-lifts.png`. Pass when the nested list still appears inside the sheet.
- [ ] Lane 8. Open this week's PRs from Explore. Save `pr1-lane8-weekprs.png`. Pass when the nested list still appears inside the sheet.
- [ ] Lane 9. Open Month review from Explore. Save `pr1-lane9-month.png`. Pass when `/analytics/month` still loads.
- [ ] Lane 10. Narrow viewport at 390px on Explore with all six rows. Save `pr1-lane10-narrow.png`. Pass when every row is a 44px target and nothing clips.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from tapping Explore Track to the Explore heading painted, plus time from tapping Coach to the Coach card painted. Trunk measures Explore open and You Coach scroll. Head measures Explore open and `/analytics/coach`.
- [ ] Probe. Chrome performance trace on the same device class, interleaved trunk then head, three taps each.
- [ ] Baseline. Record the trunk Explore-open median first.
- [ ] Rule. Head Explore-open median must stay within 20% of trunk. Coach route first paint must stay under 2500 ms once JS is loaded. Fail if either budget breaks.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 screenshots into `docs/superpowers/plans/2026-09-19-track-body-volume-proto/pr1-review-coach.png`.
- [ ] Record a 30 to 60 second video of Explore to Coach, Body, Volume, and You. Save it as `docs/superpowers/plans/2026-09-19-track-body-volume-proto/pr1-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends PR1 to the stack. The operator squash-merges it.

## Add body measurements on the Body page (PR2)

**Depends on.** PR1 (#129). GitHub issue #130.

**Files.**

- [x] Create `supabase/migrations/*_body_measurement_log.sql`.
- [x] Create `supabase/tests/body_measurement_rls.sql`.
- [x] Create `src/lib/body-measurements.ts`.
- [x] Create `src/lib/body-measurements.test.ts`.
- [x] Create `src/app/(app)/measurements/actions.ts`.
- [x] Create `src/lib/measurement-actions.test.ts`.
- [x] Edit `src/app/(app)/analytics/body/page.tsx`.
- [x] Create `src/app/(app)/analytics/body/measurement-trend-card.tsx`.
- [x] Edit generated Database types after the migration.
- [x] Edit `docs/FEATURES.md`.
- [x] Edit `docs/ARCHITECTURE.md`.
- [x] Create `docs/BODY-MEASUREMENTS.md`.
- [x] Edit `docs/README.md`.
- [x] Edit `AGENTS.md` read-before-changing table.

**Build.**

- [ ] Add `body_measurement_log` with site `waist|neck|arm|thigh|chest`, inches, unique owner plus date plus site, owner RLS, and no future dates. Body renders `WeightTrendCard` then one inches chart with site chips. A Log sheet writes the sites the owner filled. Same date and site replaces. Strength helpers stay untouched.

**You see.**

- [ ] Body shows weight first, then a Tape card. Saving waist 28.5 and neck 13.0 plots both series. Empty Body still shows the weight empty state plus a tape empty line.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/lib/body-measurements.test.ts` covers series by site, replacement, invalid inches, and unknown site. Run `npm test -- src/lib/body-measurements.test.ts src/lib/measurement-actions.test.ts`.
- [ ] `supabase/tests/body_measurement_rls.sql` denies cross-owner reads. Note Docker for `npm run test:db`.
- [ ] Lint, typecheck, and `npm run build`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open Body at trunk and head. If trunk has no Body route, record that and gate head Body plus the tape card the user waits for. Save `pr2-lane1-body.png`. Pass when head Body still shows the weight chart from PR1.
- [ ] Lane 2. Log waist and neck for today. Save `pr2-lane2-log.png`. Pass when both sites appear on the inches chart.
- [ ] Lane 3. Toggle the arm chip off. Save `pr2-lane3-toggle.png`. Pass when the arm series hides and waist remains.
- [ ] Lane 4. Log only chest on a past date. Save `pr2-lane4-backdate.png`. Pass when chest appears and other sites are unchanged.
- [ ] Lane 5. Replace today's waist. Save `pr2-lane5-replace.png`. Pass when the chart uses the new waist and still one point for that date.
- [ ] Lane 6. Submit empty Log. Save `pr2-lane6-empty.png`. Pass when an inline error asks for at least one site and nothing writes.
- [ ] Lane 7. Reject 0 inches and a future date. Save `pr2-lane7-invalid.png`. Pass when the save fails in place.
- [ ] Lane 8. Month review weight card still loads. Save `pr2-lane8-month.png`. Pass when monthly weight is unchanged.
- [ ] Lane 9. Finish a set that needs bodyweight. Save `pr2-lane9-strength.png`. Pass when the target still uses `bodyweight_log`, not tape inches.
- [ ] Lane 10. Narrow 390px Body with weight and tape cards. Save `pr2-lane10-narrow.png`. Pass when chips wrap and charts keep `min-w-0`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Body page time to interactive with weight history plus up to 200 measurement rows. Trunk is PR1 Body with weight only. Head adds the tape card.
- [ ] Probe. Chrome performance trace, interleaved PR1 Body then PR2 Body, three loads each.
- [ ] Baseline. Record the PR1 Body TTI first.
- [ ] Rule. Head TTI must stay within 25% of PR1 Body. Tape chart render after save must stay under 500 ms. Fail if either budget breaks. Do not ratio unlike pages.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 screenshots into `docs/superpowers/plans/2026-09-19-track-body-volume-proto/pr2-review-tape.png`.
- [ ] Record a 30 to 60 second video of logging waist and toggling chips. Save it as `docs/superpowers/plans/2026-09-19-track-body-volume-proto/pr2-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends PR2 to the stack. The operator squash-merges it.

## Add per-exercise weekly volume (PR3)

**Depends on.** PR1 (#129). GitHub issue #131. May stack beside PR2.

**Files.**

- [ ] Edit `src/lib/analytics.ts`.
- [ ] Edit `src/lib/analytics-weekly.test.ts`.
- [ ] Edit `src/lib/analytics-volume.test.ts`.
- [ ] Edit `src/app/(app)/analytics/volume/page.tsx`.
- [ ] Create `src/app/(app)/analytics/volume/volume-exercise-picker.tsx`.
- [ ] Create `src/lib/volume-page.test.tsx`.
- [ ] Edit `docs/FEATURES.md`.

**Build.**

- [ ] Add `rowsForExercise(rows, exerciseId)` that returns working-set rows for that id. Volume page still calls `weeklyVolume(sessionTonnage(...))`. Default is all training. `?exercise=` filters. Search list picks an exercise without leaving Volume.

**You see.**

- [ ] Volume shows All training by default, matching the pre-split total. Picking Goblet squat redraws weekly bars for that exercise only.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `src/lib/analytics-weekly.test.ts` and `src/lib/analytics-volume.test.ts` assert filtered weekly totals. Run `npm test -- src/lib/analytics-weekly.test.ts src/lib/analytics-volume.test.ts src/lib/volume-page.test.tsx`.
- [ ] Unknown `exercise` query falls back to all training.
- [ ] Lint, typecheck, and `npm run build`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `grok-4.6-fast-xhigh` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open Volume at PR1 and head. Save `pr3-lane1-total.png`. Pass when All training bars match PR1 total volume for the same account.
- [ ] Lane 2. Search and pick one exercise. Save `pr3-lane2-pick.png`. Pass when the heading and bars change to that exercise.
- [ ] Lane 3. Return to All training. Save `pr3-lane3-clear.png`. Pass when the total series returns and the query param is gone.
- [ ] Lane 4. Reload a `?exercise=` URL. Save `pr3-lane4-reload.png`. Pass when the same exercise stays selected.
- [ ] Lane 5. Unknown `?exercise=not-a-lift`. Save `pr3-lane5-unknown.png`. Pass when the page falls back to All training without crashing.
- [ ] Lane 6. Exercise with one week of sets. Save `pr3-lane6-thin.png`. Pass when the one-week copy appears instead of a two-point chart.
- [ ] Lane 7. Confirm warmups do not move the bars, using a known warmup-only day if present. Save `pr3-lane7-warmup.png`. Pass when the documented exclusion still holds.
- [ ] Lane 8. Open Volume from Explore. Save `pr3-lane8-explore.png`. Pass when the link still lands on `/analytics/volume`.
- [ ] Lane 9. Body page still loads after the Volume change. Save `pr3-lane9-body.png`. Pass when weight and tape from PR2 (or weight from PR1) remain.
- [ ] Lane 10. Narrow 390px Volume with search focused. Save `pr3-lane10-narrow.png`. Pass when the list and chart stack without horizontal scroll.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from selecting an exercise to updated bars, and Volume TTI for all training. Trunk is PR1 Volume. Head adds the picker.
- [ ] Probe. Chrome performance trace, interleaved PR1 Volume then PR3 pick, three times each.
- [ ] Baseline. Record the PR1 Volume TTI first.
- [ ] Rule. Head all-training TTI must stay within 20% of PR1. Pick-to-bars must stay under 300 ms on the already loaded page. Fail if either budget breaks.

**Review gate.** The operator reviews before merge.

- [ ] Copy lane 2 screenshots into `docs/superpowers/plans/2026-09-19-track-body-volume-proto/pr3-review-pick.png`.
- [ ] Record a 30 to 60 second video of picking an exercise and returning to All training. Save it as `docs/superpowers/plans/2026-09-19-track-body-volume-proto/pr3-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator's click.

**Merge.**

- [ ] Root's clean verdict at the exact head SHA.
- [ ] Bugbot triage done.
- [ ] Rebased onto current trunk after the verdict, patch-id unchanged.
- [ ] The root appends PR3 to the stack. The operator squash-merges it.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the stack root and tip, one-line verdicts, and anything parked.

## Appendix A. Prototype evidence

Throwaway HTML at `docs/superpowers/plans/2026-09-19-track-body-volume-proto/index.html`. Chrome screenshots at phone width 390.

Explore as destination links (`explore-links.png`) beat the nested Volume & weight sheet (`explore-nested.png`). Nested Explore still hides Coach on You and keeps charts inside a sheet.

Body overlay (`body-overlay.png`) beat six stacked charts (`body-stack.png`). The stack hides thigh and chest below the fold. One inches chart with site chips keeps weight and tape on one screen.

Volume search (`volume-search.png`) matches All lifts. No second volume variant was needed because `ExerciseList` already owns that pattern.

Unproven. Authenticated production density, real Recharts collision, and tape calendar vs Log sheet feel on a physical phone.

## Appendix B. Alternatives rejected

Fifth bottom tab for Coach. It would steal a primary slot from Lift, Track, Program, and You. Coach is a review, not a daily loop.

Keep Coach on You and only add an Explore link. Two Coach homes would split stall links and clipboard export.

Wide measurement row with five required columns. People log waist more often than thigh. Site rows make a missing site a missing row, not a null column.

Navy body-fat from waist and neck. The owner did not ask for composition claims. Weight trends already refuse those claims.

Filter volume by equipment instance. All lifts is one row per exercise. Mixing machines is a documented caveat behind InfoButton, not a second picker.

Per-exercise volume as a new aggregator. `weeklyVolume(sessionTonnage(filteredRows))` is the existing math.

## Appendix C. Risks

PR1. Coach data load on a new route may be slower than a section on You. Watch first paint and keep `loadCoachUi` as the single loader.

PR1. Redirect from `/settings?coachExercise=` can miss hash-only bookmarks. Cover query redirects. Hash-only `/settings#coach-next-steps` should 404 the Coach card on You, which is intended.

PR2. Migration must exist on the preview database before Log can persist. Same class of risk as bodyweight calendar.

PR2. Bilateral arm and thigh. V1 stores one arm and one thigh number. Do not silently average left and right.

PR3. Mixed machine loads for one `exerciseId`. InfoButton must say so. Exact identity remains the rule for records and e1RM.

Live lanes. Authenticated preview may be missing. Record that limit instead of inventing a trunk result. `control-ui` is not in this repo checkout.

## Appendix D. Links and reading list

Read before editing. [Features Track](../../FEATURES.md), [UI conventions](../../UI.md), [Weight calendar](../../WEIGHT-CALENDAR.md), [Weight trends](../../WEIGHT-TRENDS.md), [Coach report](../../COACH-REPORT.md), [Architecture strength identity](../../ARCHITECTURE.md).

`architect` skipped. `bodyweight_log`, `/analytics/month`, and `weeklyVolume` already dictate the shapes. Arena on a settled analog is extra machinery.

`how` ran as four Track, Coach, weight, and volume explorers. Entry points are `TrackExploreMenu`, `CoachSection`, `WeightTrendCard`, and `weeklyVolume`.

Trail. Prototype shots in this folder. Issues [epic #128](https://github.com/jms-dcksn/lifting-app/issues/128), [#129](https://github.com/jms-dcksn/lifting-app/issues/129), [#130](https://github.com/jms-dcksn/lifting-app/issues/130), [#131](https://github.com/jms-dcksn/lifting-app/issues/131).
