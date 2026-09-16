# Visual / copy density design

**Status:** Proposed. Spec only — no product UI in this PR. Awaiting James approval.

**Audited:** boarded product UI on `main` at `aba7a51` (includes #76 Rest complete tone).
Surfaces: `src/app/(app)/`, `src/components/`, login. Docs checked: `docs/UI.md`,
`docs/FEATURES.md`, `docs/PERIOD-TRACKING.md`.

**Companion issue:** [#77](https://github.com/jms-dcksn/lifting-app/issues/77).

Too much always-visible text. Prefer labels, icons, and one optional ⓘ that opens a short
Sheet. The rest-tone caption shipped in #76 is the canonical before/after.

---

## 1. Principles

Apply in this order. Prefer the earlier option.

1. **Labels do the work.** A control's name should be enough to use it. If the label is
   unclear, fix the label before adding a caption.
2. **Delete over relocate.** If the sentence educates the developer, future API, or
   implementation (Web Audio, notification permission, Coach API, calibration internals),
   remove it from the product. Do not hide it behind ⓘ.
3. **Helper prose is default-hidden.** How-it-works, chart legends, and "why this exists"
   live behind one ⓘ (or nowhere). They are not captions under the control.
4. **One ⓘ pattern.** Same `InfoButton` + `Sheet` everywhere. No tooltips, no inline
   essays, no second overlay primitive.
5. **Glanceable mid-set.** Session, rest, and swap are the strictest screens. One data
   line beats one sentence. Affordances stay large; copy gets smaller, not the reverse.
6. **Empty states may keep one short sentence + a CTA.** Not a paragraph. Not two
   sentences that restate the CTA.
7. **Keep: errors, pending status, confirmations, and live values.** Alerts, "Saving…",
   destructive confirmations, prescriptions, and numbers are not density problems.
8. **Privacy copy stays behind a tap.** Period tracking remains female + opt-in. Consent,
   disable, and delete explanations stay in the existing confirmation Sheets. Do not put
   cycle/bleeding essays on the Settings landing surface. Do not invent more clinical copy.
9. **Icons for glanceable primary actions only.** Do not start a full icon system. Text
   labels remain the default for nav, forms, and secondary actions.

**Cap for visible helper text:** if it is not a label, value, error, or confirmation, it
should be **≤ ~6 words** or gone.

---

## 2. Shared pattern: InfoButton → Sheet

Reuse the existing `Sheet` (`src/components/ui/sheet.tsx`). Do not add a second modal.

### 2.1 Component

Proposed `src/components/ui/info-button.tsx` (implementation slice, not this PR):

- Client component. Renders a button +, when open, a `Sheet`.
- **Glyph:** 16–18px inline SVG circle-i, `currentColor`, no new icon package.
- **Hit target:** `min-h-11 min-w-11` (44px), even though the glyph is small. Gym thumbs.
- **Placement:** inline after the control label, `items-center`, does not wrap under the
  checkbox/input.
- **API:** `title: string`, `children` (body), optional `label` override for `aria-label`.
  Default `aria-label`: `About {title}`.
- **Keyboard:** native button (Tab, Enter/Space). Sheet already traps focus.
- **Dark theme:** inherit tokens (`text-muted` glyph at rest, `text-foreground` on
  press/focus). Focus ring matches `Button` / `Input` (`outline-foreground`).
- **Reduced motion:** inherit Sheet's existing exit + global `prefers-reduced-motion`.

### 2.2 Sheet content

| Rule | Spec |
| --- | --- |
| Title | `h2.text-heading`, same as other Sheets. Usually the control label. |
| Body | 1–3 short sentences, **≤ ~50 words**. No bullets unless a privacy/consent Sheet that already uses them. |
| Dismiss | Existing Sheet: Escape, scrim, handle. Plus a **Done** ghost/secondary button. |
| No actions | Info Sheets are read-only. Enable/Disable/Save stay on the originating control. |
| a11y | `Sheet ariaLabel={title}`. Body is text, not an image. Return focus to the InfoButton on close (Sheet already restores dialog focus; verify). |
| Length test | If the body needs a list of implementation caveats, most of it should have been **deleted**, not moved. |

### 2.3 When not to use ⓘ

- The user is about to **enable, disable, or delete** something sensitive (period
  consent / disable / delete). Those stay dedicated confirmation Sheets with actions.
- The copy is an **error, retry, or save status**.
- The copy is a **live value** ("Last here: 185 lb × 8").
- You would only be relocating developer notes (see principle 2).

---

## 3. Iconography

**Current state (keep it light):** no Lucide/Heroicons dependency. Icons in product UI
are Unicode (`★` on PR pills, `✓` on login sent, `←` `→` `↑` `↓` `✕`, `+` add). Charts
use inline SVG. Actions are text buttons (`Swap`, `History`, `+30s`, `Skip`).

**Do not add an icon library.** One new inline SVG (the ⓘ glyph) is enough for this
project. If a later slice wants a rest-tone speaker affordance, that is a second inline
SVG, still not a package.

**Guidance for later slices (not blocking this spec):**

| Kind | Treatment |
| --- | --- |
| Info | Circle-i InfoButton (this spec). |
| Primary session actions | Keep text. Optional later: swap / history as icon+text only if the label already fits; never icon-only without `aria-label`. |
| PR / overload | Keep `★` and color tokens. |
| Nav | Keep word marks (Lift, Progress, Program, Settings). |

---

## 4. Gold standard: Rest complete tone

Canonical bad example, just shipped in #76. Use this as the template for every similar
caption.

### Before (`src/app/(app)/settings/page.tsx`)

```
☐ Rest complete tone
  Two short in-app beeps when rest ends. Uses this tab's audio — no
  notification permission. Phone vibration is unchanged.
```

Problems: the label already says what the checkbox does. The caption explains Web Audio,
permissions, and vibration — developer/system notes. The lifter did not ask.

### After (visible)

```
☐ Rest complete tone  ⓘ
```

No caption. Checkbox + label + InfoButton on one row.

### After (ⓘ Sheet)

- **Title:** Rest complete tone
- **Body:** Two short beeps play in this tab when rest ends. Phone vibration is separate.
- **Dismiss:** Done

**Deleted, not relocated:** "Uses this tab's audio", "no notification permission",
"Web Audio". Those are implementation constraints (`docs/UI.md` / `FEATURES.md` already
record: no Notification API). They do not belong in the product. Out of scope for this
work: changing notification permission or adding system notifications.

`docs/FEATURES.md` currently describes the caption in product voice ("No notification
permission"). After the Settings slice ships, that bullet should describe the *setting*,
not the caption.

---

## 5. Per-screen inventory

Classification: **delete** | **shorten** (≤ ~6 words or icon-sized label) | **ⓘ** (move
behind InfoButton) | **keep** (one-line why).

Quotes are from source on `aba7a51`. Errors, pending status, and field labels are omitted
unless they are essays.

### 5.1 Settings — `/settings`

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| Rest complete tone caption | "Two short in-app beeps when rest ends. Uses this tab's audio — no notification permission. Phone vibration is unchanged." | **ⓘ** + **delete** the permission/Web Audio clauses | Label `Rest complete tone`. ⓘ body per §4. |
| Bodyweight coaching | "Three morning weigh-ins logged this week — enough to smooth daily noise." / "{n}/3 morning weigh-ins this week. Aim for roughly three; consistency matters more than daily logging." + "Open the calendar to log an earlier day or correct a reading." | **delete** | The Log weight button and Recent readings list are the UI. No essay. |
| Seven-day average line | "Seven-day average · {n} readings · {delta} lb vs prior 7 days" | **keep** | Live statistic, not a helper. |
| Latest reading | "Latest reading: {n} lb" / "(saved baseline)" | **keep** | Live value. |
| Sex caption | "Allows optional period tracking for menstrual cycle context in monthly progress review. Not required for training." | **delete** | Label `Sex (optional)` is enough. Period section only appears for Female; do not advertise cycle tracking on a control everyone sees. |
| Goal Weight / Default rest labels | "Goal Weight (lb)", "Default rest between sets (seconds)" | **keep** | Labels doing the work. Optional shorten rest to `Default rest (seconds)`. |
| Recent readings "Edit or remove" | button label | **keep** | Action label. |

### 5.2 Period tracking — `period-tracking-settings.tsx`

Privacy: female + opt-in. Do not add inference, symptoms, or "cycle" coaching.

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| Off, never enabled — card body | "Mark observed menstrual period days on a calendar. These appear as context bands on monthly weight and strength charts. No predictions, no training adjustments, no external sharing. Your period data stays private." | **delete** from the card | Card: heading `Period tracking (optional)` + button `Enable period tracking`. The **existing consent Sheet** already holds the explanation (and should keep it — that is a confirmation, not a caption). |
| Consent Sheet body | Four bullets on blank days, no predictions, private/not shared, can disable | **keep** | Required consent. Already behind a tap. Do not expand. |
| Enabled card body | "Mark period days and view them as context on monthly charts." | **delete** | Heading `Period tracking` + `Log period days` + `Disable tracking` are enough. Optional ⓘ: "Marked days can show as bands on monthly charts. Nothing is predicted or sent out." |
| Disabled + kept history | "Your period data is kept privately and hidden. You can re-enable tracking to see it again, or delete it permanently." | **shorten** | Visible: heading `Period tracking (disabled)` + the two buttons. Buttons already say Re-enable / Delete. |
| Hidden data (sex ≠ female) | "Period tracking is unavailable for this profile. Recorded period days stay hidden until you select Female and re-enable tracking, or delete them." | **shorten** | `Period data is hidden.` Keep Delete confirmation Sheet as-is. |
| Disable Sheet explanations | Keep vs Delete paragraphs under the buttons | **keep** (already in a Sheet) | Destructive choice. May shorten each to one sentence. |
| Delete confirm | "Permanently delete all recorded period days? This cannot be undone." | **keep** | Destructive. |

### 5.3 Period calendar — `period-calendar.tsx`

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| Subtitle | "Mark the days you observed menstrual bleeding." | **shorten** | Drop it. Title `Period calendar` + day actions are enough. If needed, ⓘ: "Mark days you observed bleeding. Blank days are not confirmed absences." |
| Selected empty day | "Not marked yet. Mark this day if you observed menstrual bleeding." | **delete** | Primary button `Mark this day` is the instruction. |
| Selected marked day | "Period day recorded. Remove this mark if needed." | **delete** | `Remove` button is enough. |
| Confirm remove | "Remove period mark for {date}?" | **keep** | Confirmation. |

### 5.4 Weight calendar — `weight-calendar.tsx` + `ui/calendar.tsx`

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| Sheet subtitle | "Choose a day to log or correct your weight." | **delete** | Title `Weight calendar` + grid. |
| Empty day | "No reading yet. Add the weight you recorded that day." | **delete** | Weight field + `Save reading`. |
| Existing day | "{n} lb recorded · Update or remove this reading." | **shorten** | `{n} lb` (value). Buttons already say Update / Remove. |
| Shared legend | "Dot = logged weight · Outline = today. Use arrow keys to browse days." | **ⓘ** + **fix** | Visible: none (dots and today outline are visual). ⓘ: "Dot marks a logged day. Outline is today." **Bug in current copy:** this string is shared; on the period calendar it still says "logged weight". After the slice, either a `legend` prop or no visible legend. Keyboard hint is for assistive users — put `aria-describedby` on the grid, not a caption everyone reads. |
| Replace conflict | "Replace {n} lb on {date} with {n} lb? The original date will be cleared only if the replacement succeeds." | **keep** | Confirmation. Second sentence may drop ("only if replacement succeeds" is engine talk). |

### 5.5 Home — `/`

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| No-program empty | "No active program" / "Build one to start training." / CTA `Build your program` | **keep** | One short sentence + CTA. |
| Fluid caption | "Session {n} · adaptive — movements adjust as you plateau" | **shorten** | `Session {n} · Adaptive`. ⓘ on Adaptive if we need the plateau sentence. |
| Block progress | "{n} of {n} sessions this block" | **keep** | Live count next to the bar. |
| Next-workout link | "View details & plan workout →" | **shorten** | `Plan workout` (or drop; the card is already the link). |
| Last session | day, sets, top lift, PR pill, "N records this week" | **keep** | Data, not essays. |

### 5.6 Workout planner — `/workout/next`

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| Eyebrow | "Plan your workout" | **delete** | H1 is the day name. |
| How-it-works | "Choose machines and swap exercises for this workout. Changes are saved in this browser. Your timer begins when you press Start workout." | **delete** | Buttons (`Choose machine` / `Swap exercise` / `Start workout`) already say this. Cookie persistence is not a lifter concern. |
| Rest line | "Rest {n} seconds between sets" | **keep** | Glanceable fact. Optional: `Rest {n}s`. |
| Phase description | program-authored `phase.description` | **keep** | User/template content, not chrome. |

### 5.7 Active session — `/session/[id]`

Gym context: mid-set, glanceable, bigger affordances.

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| Rest bar (`Rest` + time + `+30s` / `Skip`) | — | **keep** | Already visual. No caption. |
| Prescription line | `{sets} × {min}–{max} @ {RIR} RIR` | **keep** | The work. |
| Target / Start + weight × reps | — | **keep** | The work. |
| Last here / Best recent | `Last here: … · Best recent: …` | **keep** | Live comparison. |
| No history | "No history yet — log a set to set your baseline." | **shorten** | `Log a set to start.` |
| Calibrate | "New machine — feel out the first set, then it calibrates to you." | **shorten** + **ⓘ** | Visible: `Feel out this set.` (calibrate color stays). ⓘ: "First session on this machine is a conservative start. After you log it, the target is yours." |
| Low confidence | "Starting estimate from your similar lifts." | **delete** | The Start weight is the estimate. |
| Plateau card | "Plateau detected" / "{name} · no new e1RM high in {n} sessions." / "Try {reps} @ {lb}." / "Stuck here — try a different movement:" | **shorten** | Keep heading `Plateau` + the proposed reps/weight or candidate names + Accept / Keep going. Drop "no new e1RM high…" (that's why) into ⓘ or the existing Coach "Why this suggestion?" pattern. Mid-set should not teach hysteresis. |
| Swap Sheet | "Replace {name}. Sets already logged stay unchanged." / "Your usual exercise returns next time." / "This workout and future workouts for this exercise slot on this program day." | **shorten** | Title `Use {name} for…`. Buttons `This workout only` and `Remainder of program` are the explanation. Drop the two captions. Keep one line if needed: `Logged sets stay.` |
| History Sheet subtitle | "Last 10 logged sets · All machines · Previous workouts" | **delete** | Title `{name} history`. Empty: `No previous sets.` |
| Choose machine CTA | "Choose machine (brand & type)" | **shorten** | `Choose machine` (the picker subtitle already says brand & type). |
| Readiness prompt | "How ready do you feel to train right now?" + "1 = depleted" / "5 = ready" | **keep** scale labels; **shorten** question | Heading `Readiness` + 1–5. Keep `1 depleted` / `5 ready` (three words each, they *are* the labels). Drop the question sentence. |
| Finish Sheet intro | "Optional. Two quick signals help explain your performance." | **delete** | Title `How did that session feel?` + Skip. Optional is already "Skip and finish". |
| Joint-pain warning | "Pause progression advice and review this before loading the affected area again." | **keep** | Safety, not chrome. |
| Recompute warning | "Set saved, but couldn't update exercise stats. Your progress tracking may be temporarily out of sync." | **keep** | Error/status. |
| Phase banner caption | "Effective RIR: … · {n}% working sets" | **keep** | Live prescription. |
| Phase fallback | "Follow the week {n} prescription shown on each exercise." | **delete** | Restates the cards below. |
| Recap "Across N exercises" | — | **keep** | Count. |
| PR pills including "(estimated)" | — | **keep** the PR; **delete** "(estimated)" | Pill already says e1RM. |

### 5.8 Exercise picker / machine brand

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| Machine subtitle | "Choose brand & type" | **keep** | Short, names the step. |
| Custom subtitle | "Maps to a movement pattern" | **delete** | Pattern field label is enough. Engine talk. |
| Empty search | "No matches" | **keep** | One short empty state. |

### 5.9 Programs — gallery, detail, builder

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| First-run | "Start from a template, or build one from scratch." | **keep** | One sentence + CTAs. |
| Style Classic | "Fixed block of weeks with double-progression." | **ⓘ** | Visible: Classic / Adaptive toggle only. ⓘ Classic: "A set number of weeks. Add weight when you hit the top of the rep range." |
| Style Adaptive | "Runs indefinitely. Each movement is tracked for plateaus and swapped or re-ranged when it stalls." | **ⓘ** | ⓘ Adaptive: "No end week. When a lift stalls, the app suggests a new rep range or exercise." |
| Weekly phases helper | "Optional week ranges override every exercise's working sets and RIR target." | **ⓘ** | Heading `Weekly phases` + Add phase. ⓘ: "A phase can change RIR and working-set volume for a week range." |
| Phases empty | "No weekly overrides. Every week uses the exercise prescriptions below." | **shorten** | `Using the prescriptions below.` |
| Phase placeholder | "Explain this phase to the lifter" | **keep** | Authoring hint on an optional field. |
| Patience | label `Patience` + Auto/Low/… | **keep** label; **ⓘ** | ⓘ: "How many stalled sessions before a suggestion. Auto follows the movement." Do not put that under every slot. |
| Detail phases intro | "These rules replace the default set and RIR prescription during their week range." | **delete** | Phase names, week range, and RIR/volume lines already show the rules. |
| "No programs match this tag." | — | **keep** | Empty state. |
| "No exercises" / "No days" | — | **keep** | Empty states. |

### 5.10 Progress hub — `/analytics`

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| Month review link | "Month review · strength, records & weight →" | **shorten** | `Month review` |
| Empty hub | "Finish a workout and this hub will show volume, records, and exercise trends." | **keep** | One sentence, no extra CTA on this card (nav already exists). |
| Coach intro | "One factual weekly report powers this snapshot, the clipboard export, and the future Coach API." | **delete** | Developer/future-API. Label `Coach check-in` + Copy button. |
| Copy button | "Copy weekly coach check-in" / "Copied — paste it into our chat" | **shorten** | `Copy report` / `Copied`. "Our chat" assumes an external coach workflow; keep if James still uses paste-into-chat, else drop. |
| Proposed next steps caption | "Accepting records your plan; your program stays unchanged." | **ⓘ** | Visible: heading + Accept all. ⓘ: "Accept records the plan. It does not change your program." |
| Why this suggestion? | details/summary with rationale | **keep** | Already collapsed. This is the right pattern for long coach evidence. |
| Volume empty | "One week so far — the chart appears after the next week." | **keep** | One sentence. |
| "Log another week for a delta." | — | **delete** | Absence of a delta is visible. |
| Highlight empty | "No lift has two e1RM sessions with a gain yet." | **shorten** | `No gains yet.` |
| Records empty | "Records appear after your first e1RM set." | **keep** | One sentence. |
| Excluded bodyweight sets | "{n} bodyweight sets excluded" | **ⓘ** | Don't show a caption; ⓘ on Total volume if count > 0: "Sets without a bodyweight reading are left out of tonnage." |
| Metric details (`prior n`, `% complete`, `target 45 min`, `no known gaps`) | — | **keep** | Compact stats. "review export details" → **shorten** to `see report` or drop. |
| "Specialization sets · hard at RIR 0–1" | — | **keep** as section label; optional ⓘ for "hard" | |

### 5.11 Weight trends card — Progress + Month

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| Window line | "{start}–{end} · summary as of {anchor}. Goal uses your current Settings value." | **shorten** | Dates only. Goal footnote → ⓘ if needed. |
| Chart legend | "Dots: weigh-ins · Line: 7-day average · Hollow marks: fewer than 3 readings · Dashed: goal · Purple bands: period days. Tap a weigh-in to edit." | **ⓘ** | Chart is visual. ⓘ holds the legend. Keep `aria-label` on the chart. |
| Weekly averages intro | "Monday–Sunday calendar weeks. The current week is partial. Missing weeks have no bar." | **delete** | The `partial` tag and missing bars are visible. |
| Table caption | "All values in lb. Each average covers the date shown and 6 preceding days. …" | **keep** in `<caption>` | That's a data-table caption (a11y), not chrome on the card. |
| No readings in 7 days | "No readings in the 7 days ending {anchor}. Your latest weight is outside this trend window." | **shorten** | `Latest weigh-in is outside this window.` |
| Empty trend | "Log your first weight to start your trend. A few readings each week help reveal the direction." | **shorten** | `Log a weight to start.` (Log weight button is adjacent.) |
| Show period context | checkbox label | **keep** | Short, opt-in visual. |

### 5.12 Month review — `/analytics/month`

Highest density screen after Settings. Most of the prose restates the cards.

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| Window + timezone | current/prior range · timezone | **shorten** | Keep the two date ranges. Drop timezone from the headline (keep in ⓘ or document). |
| PR counting essay | "Rep PRs count improved reps at the same effective load. e1RM PRs count improved estimated strength. First marks and ties do not count; one workout can earn both." | **ⓘ** | Visible: the metric cards. ⓘ title `How PRs are counted` with that body (already ≤ 50 words). |
| Empty month | "Choose another month to review earlier training. You can still log and review your weight below." | **shorten** | `No workouts this month.` Keep `View weight trends` link. |
| Where you improved intro | "Ranked by monthly best e1RM change. Dashed trends: prior window; solid: selected month. Each machine is compared separately." | **ⓘ** | Section title is enough. Legend → ⓘ. |
| Worth reviewing intro | "Repeated comparable workouts without an estimated-strength or fixed-load rep gain. These are review signals; your program is unchanged." | **ⓘ** | Title `Worth reviewing` + stall rows. ⓘ: "Same equipment and range, no e1RM or rep gain. Review only — program unchanged." |
| All lifts intro | "Flat or lower monthly bests alone do not establish a stall. New and untrained lifts are kept separate from gains and declines. Trends: prior dashed, current solid." | **ⓘ** | Same ⓘ as improved/stalls, or one shared "How this review works" at the page heading. |
| Data coverage | "Data coverage: {n} ineligible working sets excluded; {n} eligible sets without stored estimates omitted from strength comparisons." | **ⓘ** | Only if counts > 0, an ⓘ `Data coverage` — not a footer paragraph. |
| Achievements empty | "No improvement records in this window. New lifts establish a baseline." | **shorten** | `No records this month.` |
| Equipment instance ids shown raw | `Equipment {equipmentInstanceId}` | **keep** for identity; later polish out of this spec | Exact equipment matters (architecture). Not a copy-density fix. |

### 5.13 History — `/history/[exerciseId]`

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| Session count + current e1RM | — | **keep** | Data. |
| Chart empty | "One session so far — log another to see your trend line." | **keep** | One sentence. |
| Monthly drill-down legend | "Best stored e1RM per completed workout. Prior window dashed; selected month solid. Open supporting workouts for dates, values, and logged sets." | **ⓘ** | Same chart-legend pattern as month review. |
| "No working sets logged yet." | — | **keep** | Empty state. |

### 5.14 Login

| Item | Current copy | Rec | Proposed |
| --- | --- | --- | --- |
| "Sign in with a magic link." | — | **keep** | One sentence; the form is the rest. |
| Sent state | "We sent a sign-in link to {email}. Open it on this device to continue." | **keep** | Necessary instruction (same-device). |

### 5.15 Already dense-enough (no change)

Nav word marks; rest timer chrome; steppers; program tiles; prescription grids; error
boundaries; `Sign out`; most button labels (`Start next workout`, `Save`, `Finish`).

---

## 6. Out of scope

- **Native iOS** ([#43](https://github.com/jms-dcksn/lifting-app/issues/43)).
- **In-app AI coach** ([#44](https://github.com/jms-dcksn/lifting-app/issues/44)).
- **Training logic / algorithms** (targets, plateau, records, Coach proposals). Copy and
  layout only.
- **Notification permission / system notifications.** Rest tone stays in-tab Web Audio.
  Do not add a permission prompt, Notification API, or push. Do not put those words in
  the Settings UI.
- **New overlay primitive.** Info uses `Sheet`.
- **Icon library / design-system expansion.**
- **Rewriting user-authored program/phase descriptions.**
- **Period-tracking policy changes.** Still female + explicit opt-in; no inference; no
  Coach/API sharing.

`docs/UX-AUDIT.md` is a historical P6 walk, not a bug list to reopen.

---

## 7. Docs alignment (after approval)

`docs/UI.md` today covers primitives, tokens, Sheet, and rest-timer mechanics. It has
**no copy-density rule**, so captions like rest-tone were easy to ship.

After James approves this spec, implementation PRs should:

1. Add a short **Copy density** subsection to `docs/UI.md` pointing here (labels first;
   helper prose behind InfoButton; delete developer notes; one ⓘ pattern).
2. Mention `InfoButton` next to `Sheet` / `Button` in the primitives list.
3. Update `docs/FEATURES.md` rest-tone and Settings bullets so they describe behavior,
   not the removed captions.
4. Do **not** paste this inventory into `FEATURES.md` or `AGENTS.md`.

`docs/PERIOD-TRACKING.md` §7 still lists long Settings explanations as always-visible.
The implementation already put consent in a Sheet (good). After the Settings slice,
update §7 so the **card** is heading + Enable, and the **consent Sheet** keeps the
privacy text. Do not reopen the privacy model.

---

## 8. Implementation slices (follow-up issues — do not build here)

Open after spec approval. Each slice is UI-only, uses the InfoButton primitive, and
updates the owning screen's tests/docs. No algorithm changes.

| # | Suggested issue title | Scope |
| --- | --- | --- |
| 1 | `[UI] InfoButton primitive + Rest complete tone` | Add `info-button.tsx`. Convert rest-tone to the gold-standard treatment. Tests: a11y name, Sheet open/close, setting still saves. |
| 2 | `[UI] Settings copy-density pass` | Weight coaching paragraph, sex caption, period card surface copy (consent/disable Sheets stay). Calendar legend / shared weight-vs-period help bug. |
| 3 | `[UI] Session, rest, planner, swap copy-density pass` | Planner essay, readiness/finish intros, calibrate/low-confidence, plateau/swap captions, history subtitle. Rest bar unchanged. |
| 4 | `[UI] Progress, Coach, month, history copy-density pass` | Coach intro (delete API sentence), next-steps caption → ⓘ, chart legends → ⓘ, month-review essays → ⓘ, empty-state trims. |
| 5 | `[UI] Program builder/detail copy-density pass` | Classic/Adaptive captions → ⓘ, phases helper, patience ⓘ, detail intro delete. |
| 6 | `[Docs] UI.md copy-density principles` | After slices 1–2 land, write the UI.md subsection and FEATURES/PERIOD-TRACKING caption updates. |

Slice 1 is the template. Later slices copy its pattern, not new overlay types.

---

## 9. Decisions for James

Approve as a set, or comment exceptions:

1. **Gold-standard rest tone** (§4) — label + ⓘ; delete permission/Web Audio/vibration
   caption from Settings.
2. **One InfoButton + existing Sheet** — no tooltips, no Lucide.
3. **Delete developer/future copy** — Coach API sentence, notification-permission
   caption, "maps to a movement pattern", cookie/timer planner essay.
4. **Period: surface silent, consent Sheet unchanged.**
5. **Month review / chart legends behind ⓘ**, not deleted — the rules are useful once,
   not on every visit.
6. **Follow-up slices 1–6** as separate issues after merge; this PR ships no UI.

**Spec version:** 1.0 (2026-09-16)
**Owner:** James (jms-dcksn)
**Status:** Awaiting review
