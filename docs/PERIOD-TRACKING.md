# Period tracking (#32 design spec)

**Status:** Proposed design for review. Implementation follows in #33.

Female-only, opt-in menstrual period tracking for monthly progress context. Records observed
bleeding days; adds markers on monthly calendar and shaded bands on weight/e1RM timelines.
Privacy-first design: no inference, no auto-fill, no external sharing by default, no
training/target automation. V1 = calendar observations only; hormonal phases, symptoms,
fertility, and contraception remain out of scope.

---

## 1. User journey and scope

### 1.1 Who can access period tracking

- **Required:** User selects Female as profile sex in Settings (separate field).
- **And:** User opts in to period tracking with explicit consent.
- Female selection alone does not enable tracking. No inference from name, program, weight, or
  training data. Existing users remain sex-unspecified; new users default to unspecified.
  Sex disclosure and period tracking remain optional.

### 1.2 Onboarding sequence

1. **Settings disclosure** — User navigates to Settings; if sex is unspecified, a one-time prompt
   offers "Add profile sex (optional)" with a brief explanation: "Allows optional period tracking
   for menstrual cycle context in monthly progress review. Not required for training."
2. **Sex selection** — Picker shows Male / Female / Prefer not to say. Male and Prefer-not-to-say
   hide the period-tracking option permanently; Female reveals it as a distinct section below the
   sex field, default off.
3. **Explanation before opt-in** — The period-tracking section shows:
   - Heading: "Period tracking (optional)"
   - Short explanation: "Mark observed menstrual period days on a calendar. Appear as context
     bands on monthly weight and strength charts. No predictions or auto-adjustments to training.
     Your period data stays private and is not shared with external AI or Coach by default."
   - Toggle: "Enable period tracking" (off)
4. **Opt-in confirmation** — Enabling shows a brief "What's recorded" confirmation modal: "You can
   mark period days on the calendar. These appear as shaded bands on monthly charts to add context.
   Blank days are not treated as confirmed cycle absences. No training advice, predictions, or
   auto-adjustments. You can disable tracking or delete history at any time in Settings." Actions:
   Cancel / Enable.
5. **Calendar onboarding** — After confirmation, Settings shows "Log period days" entry point
   (same calendar Sheet as weight); the monthly Progress route gains a view toggle to show/hide
   context bands.

### 1.3 V1 included

- Mark single day or contiguous range of observed bleeding days.
- Edit or clear previously marked days.
- Backfill historical observations.
- Markers on monthly calendar.
- Shaded/labeled bands on the monthly weight chart and on Exercise review **All history**
  e1RM (not on the last-8 default). Period × performance weeks stay on Month review.
- View toggle (show/hide) per monthly review session (not a persisted preference).
- Disable tracking with choice to Keep history (private) or Delete history.
- Delete account includes period history with other user data.
- Cross-month periods clipped correctly per calendar-month view.

### 1.4 V1 excluded (deferred)

- Cycle length prediction or auto-filled future periods.
- Hormonal phase labels (follicular, luteal, ovulation estimates).
- Symptoms, flow intensity, mood.
- Fertility window, contraception, pregnancy tracking.
- Diagnostic claims or medical advice.
- Integration with Coach API, exports, or external AI (no period data leaves the app).
- Automatic correlation with training stalls, weight changes, or performance metrics.
- Period-aware target adjustments or stall-threshold changes.
- Period notifications or reminders.
- iOS native app or push notifications (web PWA only in V1).

---

## 2. Data contract (proposed — no migrations in this PR)

### 2.1 Profile sex field

Add `profile.sex` column:

- Type: `text` or small enum (`male`, `female`, `unspecified`).
- Default: `unspecified` (existing users and new signups stay unspecified).
- Nullable: no (defaults to `unspecified`).
- Values: `unspecified`, `male`, `female`.
- Optional fourth value `prefer_not_to_say` maps to `unspecified` at save time or treated
  identically in queries (collapsing to three effective states simplifies consent logic).

**RLS:** Owned by user (`user_id`); same read/write rules as `profile.bodyweight`.

### 2.2 Period tracking consent

Add consent fields to `profile`:

- `period_tracking_enabled`: boolean, default `false`.
- `period_consent_version`: small integer or text (`"v1"`), nullable. Set when consent is granted;
  cleared on disable/revoke.
- `period_consent_granted_at`: timestamptz, nullable. Records when consent was granted (supports
  audit and future consent-version migration). Cleared on disable if user chooses Delete history;
  retained if Keep history.

**Eligibility check:** `sex = 'female' AND period_tracking_enabled = true`.

**Privacy rule:** Period observations must not be returned or visible unless the above check
passes **at read time**. Changing sex or disabling tracking immediately hides data without
destructive deletion (unless user chooses Delete).

### 2.3 Period observations table

New table: `period_observation` (or `menstrual_period_log`; final name in #33).

Columns:

- `id`: uuid primary key.
- `user_id`: uuid, not null, references `auth.users(id)` or user table; owner scope.
- `observed_on`: date (not timestamptz), not null. Date-only in America/Chicago, aligned with
  weight calendar and monthly progress.
- `created_at`: timestamptz, default now().
- `updated_at`: timestamptz, default now(), updated on edit.

**Unique constraint:** `(user_id, observed_on)` — one observation per user per date.

**Index:** `(user_id, observed_on)` for calendar-month range queries.

**RLS:**
- INSERT/UPDATE/DELETE/SELECT policies scoped to `auth.uid() = user_id`.
- **Additional read gate:** Queries must confirm `period_tracking_enabled = true` in the user's
  profile at runtime. Alternatively, application queries enforce this check before calling
  Supabase (preferred for explicitness).

**Retention:** Observations remain in the table after `period_tracking_enabled = false` unless
user chooses Delete history. Disable + Keep history preserves rows invisibly; re-enabling shows
them. Disable + Delete history hard-deletes rows.

**Date semantics:** Date-only observations, never time-of-day. Display and edit use
America/Chicago for consistency with weight calendar. `observed_on` stores a `YYYY-MM-DD` string
(PostgreSQL date type) without time or zone ambiguity.

### 2.4 Proposed schema summary

```sql
-- Migration 00XX adds profile.sex and period consent fields (exact number TBD in #33)
ALTER TABLE profile
  ADD COLUMN sex text NOT NULL DEFAULT 'unspecified',
  ADD COLUMN period_tracking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN period_consent_version text,
  ADD COLUMN period_consent_granted_at timestamptz;

-- New table for period observations
CREATE TABLE period_observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  observed_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, observed_on)
);

CREATE INDEX idx_period_observation_user_date ON period_observation (user_id, observed_on);

-- RLS policies
ALTER TABLE period_observation ENABLE ROW LEVEL SECURITY;

CREATE POLICY period_observation_owner_all ON period_observation
  FOR ALL USING (auth.uid() = user_id);
```

**Mark as PROPOSED.** No migrations ship in this PR. Implementation in #33 creates migrations and
updates `types.ts`.

---

## 3. Calendar entry and editing

### 3.1 Entry points

- Settings shows **"Log period days"** button when `sex = 'female' AND period_tracking_enabled = true`.
- Opens the same calendar Sheet used for weight logging; separate mode or tab.
- Calendar starts on current month, Monday-first week layout; dots mark recorded period days;
  outline marks today.

### 3.2 Marking periods: single day vs range

**Recommended approach for V1:** Daily boolean observations (presence = period day recorded).

**Rationale:**
- Editing and clearing are simpler: tap a day to toggle or clear, no start/end coupling.
- Overlaps are impossible (each day is independent).
- Ongoing periods are natural: user marks each day during menstruation; stops when period ends.
- Backfilling any non-contiguous days is trivial (tap each observed day).
- No "open-ended period" state required (avoids showing an unbounded future span or requiring an
  explicit end-date action).

**Alternative (if implementation finds daily writes costly):** Interval records (start_date,
end_date) where end_date can be null for ongoing periods. Requires more complex:
- Edit/clear logic (split intervals, update ends).
- Overlap normalization (merge or reject overlapping intervals on save).
- Ongoing-period representation (show shaded span into the future until user ends it).
- Decision: Does marking day 3 of an ongoing period retroactively fill days 1–2, or must user
  mark them separately?

**Decision for #33:** Use daily observations unless interval records offer a compelling storage or
query benefit. Document the choice in the implementation PR.

### 3.3 Calendar interactions

- **Mark a day:** Tap/select an empty day → confirmation Sheet: "Mark [Date] as a period day?" →
  Save / Cancel. Saved day shows a dot (distinct color/shape from weight-log dots if shared calendar,
  or separate mode prevents collision).
- **Clear a day:** Tap an existing period day → confirmation Sheet: "Remove period mark for [Date]?" →
  Remove / Cancel.
- **Mark a range (optional refinement):** Select start day, then "Mark range" action, select end day →
  confirmation lists dates → Save / Cancel. All dates in range saved as individual observations.
- **Backfill:** Any past date is editable. No upper date limit (user can mark future observed days
  after the fact).
- **Ongoing period:** If using daily observations, no special "end period" action needed. User
  simply stops marking days when menstruation stops. Calendar shows dots on marked days only.
- **Edit/undo:** Selecting a marked day offers Remove. No inline value editing (unlike weight's
  numeric entry) — presence/absence is binary.

**Overlap and validation:**
- Daily observations: unique constraint on `(user_id, observed_on)` prevents duplicates; tapping
  an existing day offers Remove, not a second write.
- Interval records (if chosen): overlapping intervals either merge on save (prefer this for
  simplicity) or reject with an error prompting user to adjust dates.

### 3.4 Cross-month and sparse data

- Calendar browses one month at a time with arrows or Jump to month.
- A period starting in one month and continuing into the next appears as separate dots in each
  month's view (observations span the boundary naturally; no special cross-month record).
- Months with no recorded period days are empty (blank ≠ confirmed absence of menstruation; blank
  = no observation logged). No empty-state prompt or cycle prediction.
- Long gaps (several months unmarked) are fine. No warnings, no auto-fill, no inferred cycle.

---

## 4. Monthly review annotations

### 4.1 Context bands on charts

When `period_tracking_enabled = true` and the monthly review `/analytics/month` is open, charts
optionally show period context:

- **Monthly calendar (weight card):** Small colored markers on period days (dots or background tint).
- **Weight timeline (7-day rolling mean):** Shaded vertical bands or background regions for days
  with period observations. Label: "Period" in legend or tooltip.
- **Per-exercise e1RM timelines (lift detail charts):** Same shaded bands aligned with session dates.

**View toggle:** Monthly review includes a **"Show period context"** toggle (checkbox or switch)
above charts, default on when tracking is enabled. Toggle state is per-session (not saved to
profile). Hiding context removes bands/markers; showing them overlays period days on existing
chart rendering.

**Cross-month periods on monthly view:** Monthly review shows one calendar month at a time. A
period starting before or continuing after the selected month is clipped to the month's boundaries:
only days within `[month start, month end]` appear as bands/markers. No visual indication that the
period extends beyond the window (user can browse adjacent months to see continuation).

### 4.2 Accessibility and legend

- **Color/pattern:** Use a distinct, non-semantic color or pattern (not red by default to avoid
  reinforcing stigma; consider muted purple, teal, or neutral pattern). Must meet contrast
  requirements and distinguish from weight/strength chart colors.
- **Legend:** Charts include a legend entry "Period days" when toggle is on.
- **Tooltips:** Hovering/tapping a period-marked date shows "Period" in the tooltip alongside
  weight or e1RM value.
- **Screen reader:** Announced as "Period observation on [date]" or similar. Chart data tables
  include a period column when toggle is on.

### 4.3 Integration with existing monthly features

- Period bands are **context only**. They do not:
  - Change stall classification or plateau detection.
  - Alter "Best e1RM" or "Monthly change" calculations.
  - Affect PR totals or workout records.
  - Appear in Coach recommendations or weekly API responses.
  - Modify bodyweight trend calculations or goal distance.
- Weight and strength data remain authoritative; period markers add optional visual context for
  interpretation by the lifter.

### 4.4 Period × performance week overlay (#105)

Month review also shows a single week timeline when tracking is enabled. Each Monday-Sunday
row overlays observed period days, that week's bodyweight-average change, and canonical PR
counts. This is the glanceable answer to "in a period week, what happened to weight and
strength?" It reuses the same eligibility gate, month clipping, and no-inference rules as
the chart bands. Helper copy stays behind ⓘ. Period data is not sent to Coach.

---

## 5. Settings and state transitions

### 5.1 State matrix

| Profile sex | Tracking enabled | Observations exist | Visible to user | Entry point | Charts show context |
| --- | --- | --- | --- | --- | --- |
| Unspecified | N/A | No | No | Sex field offers opt-in explanation | No |
| Male | N/A | No | No | Period section hidden | No |
| Prefer not to say | N/A | No | No | Period section hidden | No |
| Female | False (never enabled) | No | No | Period section visible, toggle off | No |
| Female | False (disabled, kept history) | Yes | No (hidden) | Re-enable offer visible | No |
| Female | False (disabled, deleted history) | No | No | Period section visible, toggle off | No |
| Female | True | No | Yes (empty state) | "Log period days" button | Yes (toggle default on, no data) |
| Female | True | Yes | Yes | "Log period days" button | Yes (bands appear) |
| Changed to Male (was Female+enabled) | Auto-disabled | Yes (retained) | No (hidden) | Disabled message, delete option remains | No |

**Key transitions:**

1. **Unspecified → Female:** Sex selection enables the period-tracking section (default off).
2. **Female + toggle on:** Consent modal → confirmation → enabled.
3. **Enabled → Disabled:** User toggles off → confirmation: "Keep history private (can re-enable
   later) or Delete history permanently?" → choice persists.
4. **Disabled (kept history) → Re-enabled:** Toggle on again; no consent re-prompt if same version;
   observations reappear.
5. **Female → Male/Unspecified:** Tracking auto-disables, observations hidden (not deleted). User
   can still access Settings → "Manage period data" → Delete if desired. Never silently delete on
   profile edit.
6. **Delete account:** All user data including period observations deleted per existing cascade.

### 5.2 Disable and history management

When user disables period tracking (`period_tracking_enabled = false`):

1. **Immediate effects:**
   - Log period days button hidden.
   - Monthly review context toggle hidden (no bands shown).
   - Existing observations remain in database but are not queried or displayed.
2. **Choice at disable time:**
   - **Keep history (private):** Observations remain; user can re-enable tracking to see them again.
   - **Delete history:** Hard delete all `period_observation` rows for this user; irreversible.
     Confirmation: "Permanently delete all recorded period days? This cannot be undone."
3. **Re-enable after disable (kept history):** Toggling on again shows previous observations without
   re-consent (consent version unchanged). If consent version changes in a future release, require
   new consent and show migration explanation.

**Settings UI for disabled state (kept history):**

```
Period tracking (disabled)

Your period data is kept privately and hidden. You can:
- [Re-enable tracking] (shows data again)
- [Delete history permanently] (removes all recorded period days)
```

### 5.3 Data deletion paths

- **Disable + Delete history:** User-initiated, Settings confirmation modal, hard delete on confirm.
- **Change sex away from Female:** Auto-disable (observations hidden), separate Delete history option
  remains accessible ("Manage hidden period data" section).
- **Delete account:** Cascade deletes all `period_observation` rows (existing `ON DELETE CASCADE`
  foreign-key behavior or application-level cleanup).

**Privacy guarantee:** Changing sex to Male or disabling tracking never silently deletes observations.
User must explicitly choose Delete history for removal. Retained observations remain inaccessible to
all queries (enforced by application-level `period_tracking_enabled` check) until re-enabled.

---

## 6. Acceptance examples and edge cases

### 6.1 Typical flow

**Scenario:** New female user enables tracking, logs three periods over four months, views monthly
progress.

1. User creates account (sex unspecified).
2. Opens Settings → sees "Add profile sex (optional)" prompt → selects Female.
3. Period tracking section appears, toggle off → reads explanation → enables toggle.
4. Consent modal → confirms → "Log period days" button appears.
5. Opens calendar, marks days (e.g., March 5–9, April 2–6, May 10–14).
6. Navigates to Track → Month review (April).
7. Charts show shaded bands for April 2–6; toggle on/off to hide/show context.
8. Weight and e1RM data unchanged; period days add visual reference only.

### 6.2 Irregular cycles and sparse data

**Scenario:** User has irregular periods; logs some months but not others.

- User marks February 3–7, skips March (no observation), marks April 15–19.
- March monthly review: no period context bands (blank = no data, not "confirmed no period").
- April monthly review: bands appear for April 15–19 only.
- No warnings, no missing-data prompts, no cycle-length calculation.

**Empty-state messaging:** If user enabled tracking but has not logged any period days, monthly
review shows no bands and no empty-state prompt (charts render normally). Calendar shows no dots.
Settings shows "No period days logged yet" in the calendar history (if that section exists), but
monthly review stays silent (bands are optional context, not a required input).

### 6.3 Cross-month periods

**Scenario:** Period starts March 29, ends April 2.

- User marks March 29, 30, 31 in March calendar view.
- Marks April 1, 2 in April calendar view.
- March monthly review: bands appear on March 29–31 only (clipped to month end).
- April monthly review: bands appear on April 1–2 only (clipped to month start).
- No cross-month label or continuation indicator (each month shows its own observations independently).

### 6.4 Ongoing period at month boundary

**Scenario:** Using daily observations. User starts period March 28, continues into April.

- User marks March 28, 29, 30, 31 during March.
- On April 1, still menstruating → marks April 1, 2, 3, then period ends.
- March monthly review (viewed during or after period): shows March 28–31.
- April monthly review: shows April 1–3.
- No "ongoing period" state needed; user simply marks each day as it occurs.

### 6.5 Backfilling historical periods

**Scenario:** User enables tracking in May; wants to log prior months.

- Opens calendar, navigates to January → marks January 5–9.
- Navigates to February → marks February 2–6.
- Navigates to March → marks March 10–14.
- All observations saved; monthly reviews for January, February, March show respective bands.
- No limit on how far back user can log.

### 6.6 Disable and re-enable

**Scenario:** User disables tracking temporarily, then re-enables.

1. User disables tracking in Settings → chooses "Keep history private."
2. Log period days button disappears; monthly review context toggle hidden.
3. One month later, user re-enables tracking → observations reappear immediately.
4. Calendar shows previous dots; monthly reviews show previous bands.
5. User continues logging new periods; history is continuous.

**Scenario:** User disables and deletes history.

1. User disables tracking → chooses "Delete history permanently" → confirms.
2. All `period_observation` rows deleted.
3. User changes mind, re-enables tracking → starts fresh (no previous data).

### 6.7 Change sex after tracking

**Scenario:** User tracked periods as Female, then changes sex to Male.

1. User navigates to Settings → changes sex from Female to Male.
2. Period tracking auto-disables; observations hidden.
3. Settings shows "Manage hidden period data" section: [Delete history permanently].
4. User can delete if desired, or leave hidden indefinitely.
5. If user changes back to Female later, observations remain (unless deleted) and can be re-enabled.

---

## 7. Copy, messaging, and accessibility

### 7.1 Settings section copy (when sex = Female)

**Card (off, never enabled):** heading `Period tracking (optional)` + button
`Enable period tracking`. No body copy on the card.

**Card (enabled):** heading `Period tracking` + `Log period days` + `Disable tracking`.

**Card (disabled, history kept):** heading `Period tracking (disabled)` + `Re-enable tracking`
/ `Delete history permanently`.

**Consent Sheet (on enable):**

**Title:** Enable period tracking?

**Body:**
> You can mark the days you observe menstrual bleeding on the calendar. These days appear as shaded
> bands on your monthly progress charts to provide context.
>
> - Blank days are not treated as confirmed absences.
> - No cycle predictions or auto-adjustments to training.
> - Your period data is private and not shared with external AI or Coach by default.
> - You can disable tracking or delete history at any time.

**Actions:** Cancel / Enable

### 7.2 Disable confirmation

**Title:** Disable period tracking?

**Body:**
> Period days will no longer appear on charts. You can:
>
> - **Keep history (private):** Your recorded period days stay in your account. Re-enabling tracking
>   will show them again.
> - **Delete history permanently:** Remove all recorded period days. This cannot be undone.

**Actions:** Cancel / Keep history & disable / Delete history & disable

### 7.3 Calendar and chart copy

- **Calendar day marker aria-label:** "Period day, [date]"
- **Chart band aria-label:** "Period observation, [date]"
- **Legend entry:** "Period days"
- **Toggle label (monthly review):** "Show period context"
- **Empty state (Settings, if no observations):** "No period days logged yet. Open the calendar to
  mark observed days."

### 7.4 Accessibility requirements

- All interactive elements keyboard-accessible (tab navigation, Enter/Space to activate).
- Period markers distinguishable from weight dots (separate shape or pattern if same calendar).
- Chart bands meet WCAG AA contrast against background and do not rely solely on color.
- Screen readers announce period days in calendar and chart tooltips.
- Consent and confirmation modals support Escape to cancel and focus management (return focus to
  toggle on close).

---

## 8. Open decisions and questions for #33

### 8.1 Resolved recommendations (lock these unless strong conflict arises)

- **Daily observations** (not interval records) for simplicity.
- **Explicit opt-in required**; Female sex alone does not enable tracking.
- **No cycle prediction or phase labels** in V1.
- **No Coach API or export** in V1 (consent is in-app context only).
- **America/Chicago date-only** observations (aligned with weight calendar).
- **One table** (`period_observation`) with unique per-user/date constraint.
- **Disable offers Keep or Delete**; changing sex auto-disables without silent deletion.

### 8.2 Open for #33 implementation decisions

1. **Calendar mode:** Shared weight/period calendar with mode toggle, or separate "Log period"
   Sheet? Shared calendar risks UI complexity; separate Sheet is simpler but duplicates navigation.
   **Recommendation:** Separate Sheet initially; merge later if usage shows need.

2. **Chart band rendering:** SVG overlays, CSS background shading, or Recharts reference areas?
   **Recommendation:** Recharts `ReferenceArea` for weight/e1RM charts (consistent with existing
   chart library).

3. **Period marker visual:** Dot, pill, bar, background tint? Color choice?
   **Recommendation:** Muted purple or teal dot/bar; avoid red. Match existing dot size/style on
   calendar; use consistent color across calendar and charts. Define in design tokens.

4. **Table name:** `period_observation`, `menstrual_period_log`, `cycle_observation`?
   **Recommendation:** `period_observation` (clearest and least clinical).

5. **Consent version evolution:** If consent requirements change (e.g., add Coach sharing), require
   re-consent or auto-migrate?
   **Recommendation:** Require re-consent on breaking changes; `period_consent_version` column
   supports this. Add migration guide in DEPLOY.md.

6. **Query performance:** Index on `(user_id, observed_on)` sufficient for calendar-month range
   queries? Any additional covering index needed?
   **Recommendation:** Start with basic index; monitor query patterns in production.

7. **Sex field validation:** Enforce `profile.sex IN ('unspecified', 'male', 'female')` at DB level
   (check constraint) or application validation only?
   **Recommendation:** Add check constraint for data integrity; application validation as well for
   clear error messages.

---

## 9. Implementation handoff checklist for #33

### 9.1 Schema and migrations

- [ ] Create migration adding `profile.sex`, `period_tracking_enabled`, `period_consent_version`,
      `period_consent_granted_at`.
- [ ] Create `period_observation` table with unique constraint and index.
- [ ] Add RLS policies to `period_observation`.
- [ ] Add check constraint on `profile.sex` (if decided).
- [ ] Update `src/lib/supabase/types.ts` from schema.

### 9.2 Data layer

- [ ] `loadPeriodObservations(userId, startDate, endDate)` — fetch observations for calendar month.
- [ ] `savePeriodObservation(userId, date)` — insert or upsert observation.
- [ ] `deletePeriodObservation(userId, date)` — remove observation.
- [ ] `deleteAllPeriodObservations(userId)` — hard delete all observations (disable flow).
- [ ] Application-level check: gate period reads on `period_tracking_enabled = true`.

### 9.3 Settings UI

- [ ] Add sex field to Settings (picker: Unspecified / Male / Female / Prefer not to say).
- [ ] Add period tracking section (visible when sex = Female).
- [ ] Consent modal on enable.
- [ ] Disable confirmation with Keep/Delete choice.
- [ ] Manage hidden data section (when disabled with kept history or sex changed).
- [ ] "Log period days" button (opens calendar Sheet).
- [ ] Update `saveProfile` action to handle `sex` and `period_tracking_enabled`.

### 9.4 Period calendar

- [ ] Create or extend calendar Sheet for period logging.
- [ ] Mark day interaction (single-day save).
- [ ] Optional: Mark range interaction (multiple-day save).
- [ ] Clear day interaction (delete confirmation).
- [ ] Display period day dots (distinct from weight dots).
- [ ] Month navigation.
- [ ] Keyboard accessibility.

### 9.5 Monthly review annotations

- [ ] Add "Show period context" toggle to `/analytics/month` page (session state, not saved).
- [ ] Fetch period observations for selected month (only if toggle on and tracking enabled).
- [ ] Render shaded bands on weight timeline (7-day rolling mean chart).
- [ ] Render shaded bands on per-exercise e1RM timelines (lift detail charts).
- [ ] Add period markers on monthly calendar (weight card).
- [ ] Update chart legends to include "Period days."
- [ ] Update tooltips to show "Period" when hovering period-marked dates.
- [ ] Clip cross-month observations to selected month boundaries.
- [ ] Accessible chart data tables include period column when toggle on.

### 9.6 State transitions

- [ ] Auto-disable tracking when sex changes from Female to other.
- [ ] Preserve observations on disable (unless user chooses Delete).
- [ ] Re-enable flow shows previous observations (if kept).
- [ ] Delete account cascade includes `period_observation`.

### 9.7 Testing

- [ ] Unit tests for period observation CRUD actions.
- [ ] Unit tests for eligibility checks (sex + enabled gating).
- [ ] Integration tests for Settings save/disable/delete flows.
- [ ] Chart rendering tests (bands appear/hide on toggle).
- [ ] Cross-month observation tests (clipping logic).
- [ ] Accessibility tests (keyboard navigation, screen reader labels).
- [ ] Manual testing: enable, log days, view monthly, disable, re-enable, delete.

### 9.8 Documentation

- [ ] Update `FEATURES.md` to reference period tracking (pointer to this doc).
- [ ] Update `MONTHLY-PROGRESS.md` to note period context bands (pointer to this doc).
- [ ] Add short ADR to `DECISIONS.md` if it fits existing style (optional).
- [ ] Update DEPLOY.md if consent version management needs ops notes.
- [ ] Write `.claude/LAST_SESSION.md` after completion.

---

## 10. Privacy and security verification

### 10.1 Privacy principles enforcement

- [ ] **No inference:** Confirm no code infers menstruation from weight, training, or demographic data.
- [ ] **No auto-fill:** Confirm no cycle prediction or future-date auto-population.
- [ ] **Explicit consent:** Confirm tracking requires both Female sex and explicit enable toggle.
- [ ] **No external sharing:** Confirm period data excluded from Coach API, exports, and any AI
      integrations by default (future consent required for sharing).
- [ ] **Immediate hide on disable:** Confirm disabling or changing sex hides data instantly (no
      cached queries leak observations).
- [ ] **User-controlled deletion:** Confirm disable flow offers explicit Delete choice; profile
      edit never silently deletes.

### 10.2 Data isolation checks

- [ ] RLS policies tested: user A cannot read user B's observations.
- [ ] Application-level `period_tracking_enabled` check tested: disabled users see no data even if
      rows exist.
- [ ] Foreign key cascade tested: deleting account removes period observations.
- [ ] Hard delete tested: Delete history removes all rows, no soft-delete leakage.

### 10.3 Accessibility and inclusivity

- [ ] Consent language is neutral and informative, not clinical or stigmatizing.
- [ ] Copy avoids unnecessary medical jargon (use "period" not "menstruation" in UI).
- [ ] No red-only color coding (avoid reinforcing stigma; use muted purple, teal, or neutral).
- [ ] Keyboard and screen reader support verified.
- [ ] Tracking is optional, discoverable, and easily disabled.

---

## 11. Design approval and next steps

**This PR (#32 design spec) delivers documentation only.** No schema changes, no UI code, no
migrations. Review focuses on:

1. **Completeness:** Does the spec answer every product behavior question for #33?
2. **Privacy:** Are consent, data isolation, and deletion paths explicit and testable?
3. **Feasibility:** Are proposed tables, queries, and UI patterns implementable in Next.js +
   Supabase + existing chart components?
4. **Scope discipline:** Is V1 minimal and deferral list realistic?

**Approval criteria:**

- James reviews and approves the spec (comment on PR or close #32 with approval note).
- Open questions in §8 are resolved or marked as implementation decisions for #33.
- Privacy principles in §10 are accepted as non-negotiable.

**After approval:**

- Close this PR and merge to main (or James merges).
- Open #33 (implementation) referencing this spec.
- #33 creates migrations, UI components, tests, and ships the feature.
- #33 marks items in §9 checklist as it progresses.

---

**Spec version:** 1.0 (2026-09-15)
**Owner:** James (jms-dcksn)
**Status:** Awaiting review
