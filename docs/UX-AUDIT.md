# UX Audit — P6 baseline for the P7 polish pass

Walked 2026-06-10 at 390×844 (Chromium, emulated mobile, light scheme) against the P6
design system, logged in as a fresh test user (`aadrdemofacilities@gmail.com` — created
via the real magic-link flow; delete from Supabase Auth if unwanted). Full flow exercised:
login → home (empty) → onboarding → builder (PPL template) → picker sheet → save → home
(active) → session (log via stepper taps + hold-repeat, optimistic row, swap → machine,
log calibration set) → finish summary → history → settings. Screenshots in
`.playwright-mcp/audit-*.png` (gitignored).

Items marked **[device]** can only be verified on a real phone and fold into P7's final
pass, together with the outstanding P4/P5 verification against real (non-test) data.

## Global

- [ ] No `loading.tsx` skeletons — server navigations (home → session, history) show a
      dead white screen for the round-trip (P7 navigation item)
- [ ] Header nav links have no active state
- [ ] Fixed bottom bars (session finish, builder save) pair a `pb-28` magic spacer with
      no `env(safe-area-inset-bottom)` — iOS PWA home-bar overlap (P7 item)
- [ ] Unknown exercise slug renders raw as the history page title (`/history/bb_bench` →
      "bb_bench", "0 sessions") — cosmetic, only reachable by hand-typed URLs
- [ ] Dark scheme: tokens flip via `prefers-color-scheme` but were not re-walked — review
      both schemes **[device]**
- [ ] Wake lock, PWA standalone chrome, decimal/numeric keyboards per field **[device]**

## Active session (keystone — most of the P7 budget)

- [ ] Slot cards show no sets-done vs target progress; prescription `3 × 5–8 @ 2 RIR` is
      static text; current slot doesn't read as *current*, completed slots don't recede
- [ ] Logged-set rows appear/disappear instantly (no entry/exit animation); a failed
      optimistic write reverts silently
- [ ] `swap` is still a caption-sized text link and wraps awkwardly under long names
      ("Shoulder Press (Life Fitness)") — promote to a real affordance (P7, differentiator)
- [ ] Target line says "Start:" even after sets are logged this session (recommendation
      source persists within the session) — reads odd next to a logged-set list; P7
      target-line treatment should account for it
- [ ] Stepper value is a borderless input — editable by tap, but the affordance is
      invisible; judge on device whether it needs a hint **[device]**
- [ ] Hold-to-repeat verified with mouse pointer events; confirm feel (delay/rate) on
      touch **[device]**
- [ ] Machine slot with no pattern history shows the generic "No history yet" line — the
      calibrate "feel it out" instruction only appears once pattern strength exists;
      verify the calibrate badge against real data **[device]**

## Exercise picker (bottom sheet)

- [ ] Pattern filter is a text link, not a visible chip (P7 item)
- [ ] Recent exercises sort first but aren't visually grouped (P7 item)
- [ ] `autoFocus` opens the keyboard over the sheet — verify it doesn't shove the sheet
      offscreen on iOS **[device]**
- [ ] Swipe-down dismiss works from the grab handle only (list scroll doesn't drag the
      sheet — intentional); confirm it feels natural **[device]**

## Program builder

- [ ] Day/slot reorder is an instant jump — P7 wants a physical move animation
- [ ] ↑/↓/✕ hit areas are 36–40px (not mid-set controls, so acceptable) — recheck
      comfort on device **[device]**
- [ ] NumField 4-across grid is tight; fine at 390px, check ≤360px devices **[device]**

## Home

- [ ] Block status is a plain text line — P7 wants progress (week x of y) readable at a
      glance, CTA already carries the most visual weight
- [ ] Start → session navigation has no pending skeleton (covered by global loading item)

## History

- [ ] Chart hidden below 2 sessions with no explanation — needs the P7 empty state
- [ ] Chart still default Recharts styling — restyle to the monochrome system (P7)

## Login / Settings

- [ ] Login sent-state is a quiet gray card — confirm it doesn't scan as an error on a
      phone **[device]**
- [ ] Settings is functional and lowest priority

## Verified working in this walk (no action)

- Geist renders everywhere (Arial override fixed); type scale/tokens apply
- Button pressed/pending states (spinner via useFormStatus/`pending`), double-tap-safe
  start button
- Stepper: taps, hold-to-repeat (60→95 over a 1s hold), tick animation, select-all focus
- Sheet: slide-up entry, scrim, Escape + scrim-tap + pick all dismiss with exit animation,
  focus trapped (native dialog)
- Swap: pattern-filtered picker, instant target re-derive, sets log to swapped exercise
- Optimistic insert, finish summary (top e1RM + "first" delta), history grouping
- Focus rings visible on keyboard nav; aria-labels on steppers, reorder/remove, swap
