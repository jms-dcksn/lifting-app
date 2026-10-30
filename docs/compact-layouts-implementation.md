# Compact workout layouts: implementation plan

Approved direction: the owner approved the [three-screen study](compact-layouts-mock.html) and requested detailed planning, implementation, and a PR closing [#249](https://github.com/jms-dcksn/lifting-app/issues/249). This extends the original investigation into implementation. The [research and comparison](compact-layouts-research.md) remains the design evidence; its measured baseline is illustrative.

## Scope and invariants

Implement read-only plan, active workout, and program create/edit presentation. Reuse semantic tokens, shared buttons/inputs/Sheet, canonical labels and existing exercise art. No new package, schema, migration, calculation, auth path, API, or write scope. Retain complete program metadata/phases, workout editor save scopes and dirty guards, per-set targets and provenance, recovery, unresolved equipment, exact station identity, logged-set edit/delete, bodyweight/assisted semantics, pending/error retention, records, and absolute-timestamp rest persistence.

Keep the original design study as the approved visual reference. Put shipped behavior in UI/planning/features docs. Do not copy the prototype's training fixtures or state management into production.

## 1. Read-only plan

- Reuse the existing compact card shell in both read and edit modes: 64×36 artwork, 16px exercise title and wrapping equipment hierarchy. Keep reorder/removal controls exclusive to editing.
- Add a semantic read-only set table beside the editable table: Set / Weight or Load / Reps / RIR. Use a shared range formatter, not a new prescription model. Preserve every row's exact values.
- Show Suggested / Your target / Weight not set per row so mixed provenance is unambiguous. For assisted exercises explicitly name assistance; for reps-only exercises omit misleading pound targets.
- Keep prescribed tempo, recovery, superset identity and no-rest/round-rest context visible. Keep previous notes and existing Start behavior; pending equipment must not become a new Start blocker.
- Preserve editing, scope selection, save failure, invalid-field focus and Undo without changing their action handlers.
- Regression: mixed manual/suggested rows render as plain values with no editing controls; all relevant load modes and existing editor tests remain valid. Update browser selectors that depended on the old fieldsets to assert semantic set rows.

## 2. Active workout

- Keep document exercise order and mounted entry forms. Default focus to the first incomplete exercise; provide an explicit Log this exercise / Add set entry on every other card. Switching focus hides rather than destroys another form, preserving drafts and existing note guards.
- Use small artwork and compact title/equipment headers. History and Swap remain visible. Move pin/last-used/secondary tools behind a named More Sheet; unresolved station selection remains explicit.
- Keep saved rows visibly separate from the next entry. Align set number, load/result, reps and RIR; expose named edit controls and preserve recorded tempo/setup/note and historical exercise identity. Keep deletion available through the edit presentation, preserving the existing delete action and pending locks.
- Show the next set number and its effective rep/RIR prescription above the existing steppers. Preserve target/recommendation/Coach context and record helpers. Do not infer PRs in UI.
- Retain 44px plus/minus targets; stack their buttons when a three-column entry is too narrow. Keep reps-only and assisted controls and keyboard/hold behavior.
- Move Finish into the workout header using the existing feedback/confirmation flow. Keep a visible persistent bottom rest area, with Ready before a timer and the existing countdown/add/skip behavior thereafter. Preserve loading/error timer state and safe areas.
- Regressions: current/next/complete states, failed and pending writes, edits/deletes, out-of-order entry with draft retention, preserved form values, and existing timer/notes/swap/record tests.

## 3. Program builder

- Use a single capped column on desktop and mobile, matching the approved visual language. Keep program name visible and labeled. Add a settings disclosure for description, tags, progression style, weeks and all phase controls; preserve their handlers and validation.
- Replace the long all-days surface with named day buttons and one selected day. Add day selects it; removing/reordering a day preserves identity and chooses a valid remaining day. Retain day name/reorder/remove controls.
- Compact exercise headers; keep Change exercise, Up and Down visible. Replacement uses the existing picker/catalog resolution without resetting prescription settings.
- Keep Sets / Rep range / RIR visible. Rep range opens a Sheet with independent bounds, validation, explicit Apply and Cancel; dismissal discards only the sheet draft. Apply changes the program draft, not storage.
- More opens rest, tempo, superset and Adaptive patience controls plus removal. Preserve all current fields. Use the shared Sheet focus/dismissal behavior and keep 44px actions.
- Preserve complete draft on failed save. Keep save/cancel semantics and route destinations. Prevent discarded sheet changes from leaking into the program draft.
- Regressions: day switching and reordering, changing exercises without losing prescription, range cancellation/invalid bounds, secondary settings, Classic/Adaptive metadata and save failure retention.

## 4. Verification and review

1. Write focused behavior regressions in the repository's existing jsdom/Vitest seams and run them before implementation to establish a failing signal. Add a program-builder UI seam using real components and mocked action/router boundaries.
2. Implement one surface at a time and rerun its focused tests. Update tests only where the approved interaction contract changed; preserve data/persistence assertions.
3. Run the React checklist and repository standards/spec review against the fetched main merge-base. Update owning docs and keep the historical study clearly labeled.
4. Attempt local disposable Supabase/browser verification with managed Docker/proxy/CA setup. Never use the hosted project for tests. If a prerequisite is blocked, record the exact failure and use PR CI's real Auth/RLS/browser journeys as required by the repository.
5. Inspect rendered production components at 320/390px and desktop in light/dark, long names, distinct targets, recovery, pending equipment, empty/long days, supersets, saved results, keyboard focus and minimum hit targets. Add/update Playwright coverage for the changed flows.
6. Run `npm run verify -- base`, commit and push with hooks enabled. Open one PR containing the study, detailed plan, implementation, evidence and `Closes #249`; attach it to this chat. Never merge.
7. Verify the published PR's current head with `npm run verify:pr -- <number>` or the documented connected-GitHub fallback. Record exact head/run/base/database/authenticated-browser results in the PR description, including failures or blocks.

## Acceptance checklist

- [x] Plan has compact read-only rows and complete context; editor remains functional.
- [x] Active workout has clear saved/next states, accessible arbitrary exercise entry, large controls, history, records and persistent rest.
- [x] Builder has compact exercise prescriptions, range/options disclosures, day navigation and complete settings.
- [x] Relevant regression tests and responsive visual checks pass; persistence contracts unchanged.
- Publication and exact-head CI outcomes belong in the PR description; local Docker setup was blocked by image-layer storage exhaustion.

## Local implementation evidence

- `npm run verify -- base`: PASS (fresh types, lint, indexed slice, hook tests, 1,362 deterministic tests, production build; two gated live tests skipped).
- Renderer review: actual production React components and Tailwind CSS, with server actions disabled, passed 18 viewport/theme button-size/overflow checks and 48 narrow edge-state overflow checks. Range Apply/Cancel, native Escape, open settings and phases were exercised. This is visual/component evidence, not authentication or persistence evidence.
- Local authenticated browser: BLOCKED. The managed Docker daemon could not register the disposable Postgres image layers (`no space left on device`). The attempt was stopped; no hosted database was used. The PR's current-head authenticated CI browser step remains required.
- Standards review: no unresolved findings; existing semantic tokens, primitives, exact identities and action contracts retained.
- Spec review: no unresolved implementation omissions identified; the owner explicitly extended #249 from investigation to implementation. Physical mobile keyboard/safe-area and assistive-technology device testing remain manual checks.
- Migration: none.
