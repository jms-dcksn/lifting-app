# Critical Product/Engineering Review

**Reviewer:** Cloud Agent (claude-sonnet-4.5)  
**Date:** 2026-09-15  
**Commit:** 4b412f1  
**Stack:** Next.js 16, React 19, TypeScript, Supabase, Vercel

---

## Executive Summary

**TL;DR:** Solid core strength engine and data model. Ship-blocking issues: **zero retry infrastructure for network failures** (P0), **no transaction boundaries** risking partial writes (P0), **period tracking claimed as shipped but not implemented** (P0 docs bug). High-value fixes: add retry helper to hot paths (set log, finish workout, weight save), wrap multi-step mutations in transactions, implement error boundaries. UX is focused but Home/Progress could be more motivating with trend indicators and compact PR highlights.

**Top 10 bets by leverage (P0–P2, ranked):**

1. **Add retry infrastructure** — Implement shared retry helper with exponential backoff for transient network failures; wire to set logging, workout finish, weight/period saves. 5xx/timeout blips currently lose user data silently.
2. **Wrap multi-step ops in transactions** — `saveProgram` and similar actions perform multiple upserts/deletes without atomicity; partial failure leaves corrupt state.
3. **Implement period tracking or remove from docs** — DECISIONS.md claims #32-33 shipped period tracking; only design spec exists. Either build it or remove stale references.
4. **Add route-level error boundaries** — Individual component error handling is fragile; uncaught errors crash the app with no recovery path.
5. **Deduplicate rapid Server Action calls** — No request deduplication or rate limiting; double-tapping stepper controls can create duplicate logs.
6. **Cache catalog reads** — `getCatalogMap()` runs on every Server Action; 100+ catalog entries + user exercises refetch each time.
7. **Optimize historical queries** — Some history loaders fetch unbounded rows; add pagination/limits to prevent runaway queries.
8. **Add transaction tests** — Test suite has strong unit coverage but zero tests for concurrent writes, partial failure, or race conditions.
9. **Surface PR context on Home** — Last session card is weak motivation; show mini trend pill (+5 lb e1RM this week) to keep PRs front-and-center.
10. **Simplify Progress hub** — Too many cards/sections; collapse rarely-used feeds, prioritize weekly balance + top gains + searchable lift list.

**Strengths:**
- Pure TypeScript strength engine with clean separation (coefficients, e1RM, recommend, progression, records)
- RLS policies correctly scope all user data
- Bayesian shrinkage for machine calibration is smart
- Workout records pipeline is rigorous (historical bodyweight recovery, precision thresholds, replay stability)
- Test coverage is thorough for pure logic (35 test files, strong unit coverage)
- Native `<dialog>` + View Transitions API show good platform-first judgment

**Critical gaps:**
- Zero retry/backoff for any Server Action
- No database transactions for multi-step mutations
- No request deduplication or concurrency control
- Optimistic updates can diverge from server truth
- Period tracking documentation is stale (design only, not implemented)
- Error handling is scattered, no global error boundary
- No performance budgets or monitoring
- Some N+1 query patterns (catalog, bodyweight lookups)

---

## Part A: Code Review (be harsh, specific)

### A1. Architecture & Data Model (P0–P1)

**Finding: Period tracking NOT implemented despite docs claiming shipped**  
**Severity:** P0 (documentation integrity bug)  
**Evidence:**
- `docs/DECISIONS.md:574-591` and `docs/FEATURES.md:286` claim period tracking is shipped (#32-33)
- `docs/PERIOD-TRACKING.md:4` says "Status: Proposed design for review. Implementation follows in #33"
- Zero `period_observation` table in schema; no period code in `src/`; Grep finds no period tracking actions/components
- Git history shows period tracking design spec merged (4b412f1) but no implementation PR

**Why it hurts:** Misleads future developers and stakeholders; creates expectation of privacy-critical feature that doesn't exist; wastes review time validating non-existent code.

**Fix:** Either (a) implement period tracking per spec, or (b) move PERIOD-TRACKING.md to `docs/proposals/` and remove shipped claims from DECISIONS.md/FEATURES.md.

---

**Finding: No database transaction boundaries for multi-step mutations**  
**Severity:** P0 (data integrity risk)  
**Evidence:**
- `src/app/(app)/program/actions.ts:62-165` `saveProgram()` performs 6+ separate upserts/deletes (program, phases, days, slots) without transaction wrapper
- `src/app/(app)/session/actions.ts:460-491` `acceptAdaptation()` inserts adaptation + conditionally calls swap action without rollback on second failure
- Supabase client doesn't wrap these in `.rpc('begin')` / `.rpc('commit')` or single RPC call

**Why it hurts advanced lifters:** A network blip during program save can leave days/slots half-saved; slot IDs referenced by `set_log.program_slot_id` may point to deleted rows, breaking progression history. Restarting doesn't fix it — user must manually detect and rebuild.

**Fix:** Wrap multi-step mutations in Postgres transactions via Supabase RPC or single stored procedure call. Migrate critical paths: `saveProgram`, `cloneProgram`, `acceptAdaptation`, `swapSessionExercise`.

---

**Finding: `exercise_id` is text slug with no FK, seeded catalog can drift from reality**  
**Severity:** P2 (architectural debt, acceptable tradeoff per docs)  
**Evidence:**
- `supabase/migrations/0001_init.sql:57` `set_log.exercise_id` is `text not null` with no FK constraint
- `src/lib/strength/coefficients.ts` defines seeded exercises in app code; renames/deletes break old logs silently
- `docs/ARCHITECTURE.md:17` acknowledges this: "intentionally not a foreign key"

**Why it's acceptable but risky:** Allows flexible catalog in app code without migrations. But renaming `barbell-bench-press` to `bench-press` orphans historical sets — they still log but lose name/pattern. Custom exercise IDs (`custom-...`) have same issue.

**Fix (if prioritized):** Add `exercise_definition` table for both seeded and custom exercises; FK `set_log.exercise_id`. Migrate seeds on deploy. Or accept risk and document recovery procedure.

---

**Finding: RLS policies are correct but no tests verify cross-user isolation**  
**Severity:** P1 (security hygiene)  
**Evidence:**
- `supabase/migrations/0001_init.sql:96-111` defines "own rows" policies correctly (`user_id = auth.uid()`)
- `supabase/tests/*.sql` exist but focus on feature logic, not adversarial cross-user attacks
- No test creates two users and attempts to read/write each other's data

**Why it matters:** RLS is only defense against accidental cross-user leaks. Without tests, a future migration or RLS change could silently break isolation.

**Fix:** Add `supabase/tests/rls_isolation.sql` with two-user fixtures; attempt reads/writes across boundary; assert rejection.

---

### A2. Server Actions & Error Handling (P0–P1)

**Finding: Zero retry logic for transient network failures**  
**Severity:** P0 (reliability for gym connectivity)  
**Evidence:**
- All Server Actions in `src/app/(app)/*/actions.ts` throw errors directly on Supabase failure
- No retry, no exponential backoff, no distinction between retryable (5xx, timeout) vs fatal (401, 403)
- `src/app/(app)/session/actions.ts:224` `logSet()` throws `"Could not log set"` on any error; user loses set data

**Why it's critical for advanced lifters:** Gym WiFi is flaky. A 5-second network blip mid-workout loses the entire set. User doesn't know if it saved. Refreshing page doesn't help — optimistic update is gone. Progressive overload tracking breaks.

**Fix (Part C below):** Implement shared `retryAction()` helper with exponential backoff (4s, 8s, 16s, 32s max). Wire to: `logSet`, `editSet`, `deleteSet`, `finishSession`, `saveSessionReadiness`, `updateSessionFeedback`, `saveBodyweightEntry`, `savePeriodObservation` (when implemented). Idempotency: `logSet` is NOT safe to retry (could double-log); needs unique constraint or client-generated ID. `editSet`/`deleteSet`/upserts ARE safe.

---

**Finding: `recomputeAndUpsertStat()` silently fails, never throws**  
**Severity:** P1 (silent data corruption)  
**Evidence:**
- `src/app/(app)/session/actions.ts:54-113` returns early if `catalog[exerciseId]` missing (line 62) or Supabase query fails
- Caller doesn't check return value; assumes success
- `user_exercise_stat` cache diverges from `set_log` truth

**Why it hurts:** Machine calibration depends on accurate `personal_coefficient` and `coeff_confidence_n`. Silent failure leaves stale stat, so next session's recommendation is wrong. User sees "calibrate" forever or gets wildly wrong weight.

**Fix:** Throw error if critical queries fail; catch in caller and surface to user. OR return `{success: boolean, error?: string}` and handle explicitly.

---

**Finding: No request deduplication or rate limiting**  
**Severity:** P1 (duplicate writes, wasted resources)  
**Evidence:**
- `src/app/(app)/session/[id]/active-session.tsx:366` `handleLog()` starts transition immediately; no check if prior call in flight
- Stepper `onIncrement` has auto-repeat (line 470); rapid taps can queue multiple `logSet()` calls
- No unique constraint or idempotency token prevents double-insert

**Why it hurts:** Double-tapping stepper logs two identical sets. User sees optimistic update once, but server has dupes. Deleting one doesn't fix it — e1RM/progression now use the max of two dupes.

**Fix:** Add `isPending` check before starting new action. OR use SWR/React Query with automatic deduplication. OR add client-generated `set_log.idempotency_key` unique constraint.

---

**Finding: Error states are per-component, no global error boundary**  
**Severity:** P1 (poor error UX)  
**Evidence:**
- `src/app/(app)/session/[id]/active-session.tsx:284` has per-card `error` state
- `src/app/(app)/session/[id]/active-session.tsx:105` `summaryError` for finish failures
- No route-level `error.tsx` boundary except `src/app/(app)/history/[exerciseId]/error.tsx` (one-off)
- Uncaught error in `finishSession()` crashes the entire session page with no recovery

**Why it hurts:** Mid-workout error (e.g., Coach API fetch fails) kills the whole page. User loses context, has to reload, doesn't know what saved. Anxiety > motivation.

**Fix:** Add `src/app/(app)/session/[id]/error.tsx` boundary; preserve session state; offer "Try again" or "Continue without summary."

---

**Finding: Optimistic updates can diverge from server truth**  
**Severity:** P2 (UI consistency)  
**Evidence:**
- `src/app/(app)/session/[id]/active-session.tsx:273-279` applies optimistic add/delete immediately
- On error, shows per-card message but optimistic state already applied
- Revalidation *eventually* syncs, but user sees stale count until then

**Why it's problematic:** After failed write, user sees "3 sets logged" optimistically but server has 2. Progression target is wrong. Deleting the phantom set does nothing (it never existed).

**Fix:** Rollback optimistic state on error, OR disable optimistic updates for set logging (acceptable UX tradeoff for correctness).

---

### A3. Strength Engine & E1RM Pipeline (P2–P3)

**Finding: `PRIOR_WEIGHT = 4` and `HARD_RIR = 2` lack justification**  
**Severity:** P3 (documentation)  
**Evidence:**
- `src/lib/strength/recommend.ts:22` defines `PRIOR_WEIGHT = 4` with comment "trust placed in population prior"
- `src/lib/analytics.ts:70` defines `HARD_RIR = 2` with no comment
- No research citation or rationale in comments or docs

**Why it matters:** These are load-bearing hyperparameters. Changing them affects all recommendations. Future maintainer doesn't know if 4 is empirical, guessed, or cargo-culted.

**Fix:** Add comment citing source (research paper, training heuristic) or note "empirically chosen, revisit with user data."

---

**Finding: `effectiveLoad()` returns null for unknown bodyweight; downstream checks are inconsistent**  
**Severity:** P2 (edge case handling)  
**Evidence:**
- `src/lib/strength/recompute.ts:20-27` returns `null` if bodyweight unknown for BW exercise
- `src/app/(app)/session/actions.ts:204` checks `load != null && load > 0` before computing e1RM
- `src/lib/analytics.ts:100` filters out null loads and counts as `excludedSetCount`
- But `src/lib/strength/progression.ts:136-140` uses non-null assertion after checking `bodyweight == null` (inconsistent guard)

**Why it's a code smell:** Mixing null checks and non-null assertions suggests fragile invariants. Refactor needed if bodyweight becomes optional in more places.

**Fix:** Standardize on Result type or explicit null-propagation pattern; audit all `effectiveLoad()` call sites.

---

**Finding: Workout records precision thresholds are well-designed**  
**Severity:** N/A (praise)  
**Evidence:**
- `src/lib/strength/records.ts:49-51` normalizes load to 0.001 lb, e1RM to 0.1 lb
- Line 52: "Rounded ties do not earn records, and improvements cannot display as +0"
- `historicalBodyweight()` (line 60-64) recovers BW from e1RM without touching profile

**Why it's excellent:** Handles floating-point noise, prevents fake PRs, preserves historical comparability. This is production-grade rigor.

---

### A4. Test Coverage & Quality (P1–P2)

**Finding: Strong unit coverage, zero integration tests for concurrent/failure scenarios**  
**Severity:** P1 (gap in test strategy)  
**Evidence:**
- 35 `.test.ts` files in `src/lib/`; comprehensive pure-function coverage
- `src/lib/record-actions.test.ts`, `src/lib/workout-planning-actions.test.ts` mock Supabase but don't test real transactions
- No tests for: concurrent writes to same session, partial saveProgram failure, retry behavior, race on machine calibration

**Why it matters:** Unit tests catch 80% of bugs. Integration tests catch the other 20% (deadlocks, race conditions, partial failure). Advanced lifters will hit these — shared gym phone, flaky network, multiple tabs open.

**Fix:** Add `src/lib/__integration__/*.test.ts` with real Supabase test instance; test concurrent set logs, program save partial failure, retry idempotency.

---

**Finding: `supabase/tests/*.sql` exist but lack execution instructions**  
**Severity:** P2 (operability)  
**Evidence:**
- `supabase/tests/exercise_swap_scope.sql:39` says "Execute as postgres; assertions run as authenticated"
- No CI workflow runs these tests; no `npm run test:db` script in `package.json`
- `docs/EXERCISE-SWAPS.md:35` mentions tests but not how to run them

**Why it's a gap:** SQL tests are write-once, never-run. Migrations could break them and nobody knows.

**Fix:** Add `npm run test:db` script wrapping `supabase test db`; add to CI. Document in DEPLOY.md.

---

### A5. Performance & Scalability (P1–P2)

**Finding: `getCatalogMap()` refetches full catalog + user exercises on every Server Action**  
**Severity:** P1 (N+1 anti-pattern)  
**Evidence:**
- `src/lib/catalog.ts:15-34` fetches seeded `EXERCISE_BY_ID` (100+ entries) + `exercise` table rows (unbounded)
- Called in: `logSet` (line 166), `editSet` (line 251), `deleteSet` (line 289), `finishSession` (line 371), `recomputeAndUpsertStat` (line 59)
- `EXERCISE_BY_ID` is static, should be singleton; user exercises could be cached per request

**Why it's slow:** Every set log does 2 queries (catalog + session verification) when 1 would suffice. 10-set workout = 20 catalog queries (seeded catalog + user exercises × 10).

**Fix:** Memoize `EXERCISE_BY_ID` once. Cache user exercises in Next.js request cache (React `cache()` function). OR pass catalog as param from page loader to actions (requires refactor).

---

**Finding: `getCurrentBodyweight()` called multiple times per action**  
**Severity:** P2 (minor inefficiency)  
**Evidence:**
- `src/app/(app)/session/actions.ts:184-193` calls `getCurrentBodyweight()` in `logSet()`
- Line 253 calls it again in `editSet()` for same user
- `src/lib/current-bodyweight.ts:16-30` queries `bodyweight_log` with `order` + `limit 1` each time

**Why it's wasteful:** Same user's bodyweight doesn't change mid-action. 10 sets = 10 identical queries.

**Fix:** Call once at start of action, pass to helpers. OR use React `cache()` to dedupe within request.

---

**Finding: Some historical queries fetch unbounded rows**  
**Severity:** P2 (future scalability)  
**Evidence:**
- `src/lib/workout-records.ts:41-79` `loadWorkoutRecords()` correctly paginates historical sets
- But `src/lib/analytics.ts:74-107` `sessionTonnage()` expects all rows in memory
- `src/lib/stall-data.ts` loaders fetch complete history without pagination (acceptable for single-user, but...)

**Why it's a time bomb:** Works fine for 1 year of data (few thousand rows). Fails after 5 years (100k+ rows). Advanced lifters accumulate data forever.

**Fix:** Add pagination to analytics loaders; accept `limit` param and compute incrementally. OR document max supported history (e.g., "2 years of data") and archive older rows.

---

**Finding: No performance budgets or monitoring**  
**Severity:** P2 (observability gap)  
**Evidence:**
- No Lighthouse CI, no bundle size checks in CI
- Recharts is heavy (~50kb gzipped); no lazy loading for charts
- No Real User Monitoring (RUM) or error tracking (Sentry, etc.)

**Why it matters:** Home page loads all chart code even if user never visits Progress. Gym WiFi is slow — every KB counts.

**Fix:** Lazy-load charts (`const Chart = dynamic(() => import('./chart'))`). Add Lighthouse CI with budget: FCP < 1.5s, LCP < 2.5s, bundle < 200kb.

---

### A6. Privacy & Security (P0–P1)

**Finding: Coach API token validation is correct, but capability URL is logged in errors**  
**Severity:** P1 (potential secret leak)  
**Evidence:**
- `src/lib/coach-api.ts:42-43` validates token with `constantTimeTokenEqual()` (timing-safe)
- Line 80: `new URL(request.url).searchParams.get("token")` extracts token from query
- No evidence token is logged, but standard Next.js error logging DOES log full URL with query params

**Why it's risky:** If Coach API returns 500 and Next.js logs the error, full URL (including `?token=...`) appears in Vercel logs. Anyone with dashboard access sees the secret.

**Fix:** Strip `token` query param before passing URL to any logger. OR deprecate query-based auth; require `Authorization` header only.

---

**Finding: No rate limiting on auth actions or Coach API**  
**Severity:** P2 (abuse risk)  
**Evidence:**
- `src/app/api/coach/v1/weekly/route.ts` has no rate limiter; unlimited requests with valid token
- `src/app/(app)/actions.ts:7` `signOut()` has no rate limit

**Why it's low-priority but real:** Attacker with Coach API token can spam requests, run up Supabase costs. No user DoS risk (one user, no multi-tenancy), but operational cost risk.

**Fix:** Add Vercel Edge Config or Upstash rate limiter to Coach API (10 req/min per token). Add similar limit to auth endpoints.

---

**Finding: Period tracking privacy design is excellent (but not implemented)**  
**Severity:** N/A (future feature, already well-designed)  
**Evidence:**
- `docs/PERIOD-TRACKING.md` mandates explicit consent, no inference, application-level `period_tracking_enabled` gate
- Delete-vs-keep choice on disable, no silent deletion
- No Coach API inclusion in V1

**Why it's praise:** Privacy-first design with clear consent boundaries. Once implemented, this will be a model for sensitive health data.

---

## Part B: UX Review (be harsh, specific)

### B1. Home & Motivation (P2–P3)

**Finding: Last session card is weak; no trend or PR context**  
**Severity:** P2 (motivation gap)  
**Evidence:**
- `src/app/(app)/page.tsx:126-145` shows "Last session: {day} · {sets} sets · Top: {lift} {e1RM} lb"
- No delta, no "+5 lb from last time," no mini trend indicator
- PRs are buried in Progress; not surfaced on Home

**Why it's unmotivating:** User finishes workout, returns next day, sees flat stat. No dopamine hit. Doesn't know if they progressed unless they manually dig into Progress > lift history.

**Fix:** Add compact trend pill: "Top: Squat 315 lb e1RM (+10 from last Lower A)" or "🟢 +3% this week." Steal design from GitHub commit graph: small sparkline or +/- indicator.

---

**Finding: Block progress bar is good, but fluid programs have weaker identity**  
**Severity:** P3 (aesthetic)  
**Evidence:**
- `src/app/(app)/page.tsx:73-76` shows "Session 47 · adaptive" for fluid
- Classic programs show "Week 3 of 6" with visual progress bar
- Fluid has no progress visualization; just session count

**Why it's less engaging:** Fluid is the advanced feature, but looks less polished. Session count alone doesn't convey momentum.

**Fix (optional):** Add "movements adapted" count or mini timeline: "Session 47 · 3 swaps this block · progressing."

---

### B2. Active Workout Flow (P1–P2)

**Finding: Stepper auto-repeat is aggressive; easy to overshoot**  
**Severity:** P2 (mobile gym usability)  
**Evidence:**
- `src/components/ui/stepper.tsx` has press-and-hold auto-repeat
- No visual feedback showing repeat is active; no "slow down" near target

**Why it's annoying:** Wearing gym gloves, trying to set 225 lb, overshoot to 235. Have to tap down 2×. Happens every set.

**Fix:** Add haptic feedback on repeat start. OR add "coarse/fine" mode toggle: first hold = +5 lb/rep, second hold = +1.

---

**Finding: Swap confirmation is clunky for common case (machine brand/type)**  
**Severity:** P2 (friction for machine-heavy lifters)  
**Evidence:**
- `src/app/(app)/session/[id]/active-session.tsx:288-309` swap flow: pick exercise → confirmation sheet (workout vs program scope)
- Picking brand/type for machine template adds extra step
- Common case: "machine taken, use different brand" requires 3 taps + confirmation

**Why it's slow:** Advanced lifters swap often (crowded gym). 3-tap flow breaks momentum.

**Fix:** Add "Quick swap to last used alternative" button if user has history with this slot's pattern. E.g., "Leg Press (Hammer Strength) taken? Tap here for Leg Press (Life Fitness)."

---

**Finding: Rest timer is excellent, but no visual countdown**  
**Severity:** P3 (nice-to-have)  
**Evidence:**
- `src/app/(app)/session/[id]/rest-timer.tsx` shows time remaining as text: "1:45"
- No circular progress ring, no color change at <30s

**Why it's minor but nice:** Visual countdown (like iOS timer) lets user glance without reading numbers. Helpful when superset-ing.

**Fix (optional):** Add circular progress SVG or linear bar. Or keep minimal — current design is already good.

---

### B3. Progress Hub & Analytics (P1–P2)

**Finding: Progress page is cluttered; too many cards**  
**Severity:** P1 (cognitive overload)  
**Evidence:**
- `src/app/(app)/analytics/page.tsx` shows: weight card, Coach check-in, volume chart, training balance, e1RM gainers, pattern strength, records feed, all exercises list
- 8 distinct sections; user has to scroll 3+ screens to see all lifts
- Coach check-in is prominent but only useful if user has coach

**Why it hurts focus:** User wants "did I PR this week?" and has to hunt. Records feed (legacy) and pattern strength (advanced) are niche; shouldn't dominate.

**Fix:** Simplify to 4 sections: (1) Weekly summary card (adherence + top gainer), (2) Training balance (hard sets by pattern), (3) Monthly review link, (4) Search/browse lifts. Collapse Coach, records feed, pattern strength into "More insights" accordion.

---

**Finding: Monthly review is excellent, but navigation is non-obvious**  
**Severity:** P2 (discoverability)  
**Evidence:**
- `src/app/(app)/analytics/page.tsx` has "View monthly review" link at bottom
- Month selector is inside the monthly page; can't jump to specific month from Progress hub

**Why it's buried:** User hears "check your September PRs" and has to: Progress → scroll to bottom → click monthly → click month selector → pick September. 4 taps.

**Fix:** Add month picker on Progress hub: "Monthly review: [September ▼]" dropdown. OR add quick-access chips: "This month | Last month | 3 months ago."

---

### B4. Settings & Weight Calendar (P2–P3)

**Finding: Weight calendar is solid; replacement confirmation is good**  
**Severity:** N/A (praise)  
**Evidence:**
- `docs/WEIGHT-CALENDAR.md` shows atomic replacement with confirmation
- `src/lib/weight-calendar.ts` has `requiresReplacement()` logic

**Why it's good:** Prevents accidental overwrites; common case (new date) is 1 tap, collision case gets confirmation.

---

**Finding: No bulk weight entry for historical backfill**  
**Severity:** P3 (nice-to-have)  
**Evidence:**
- Weight calendar requires tapping each date individually
- No CSV import, no "enter 7 days at once" flow

**Why it's a paper cut:** New user wants to backfill 30 days of weigh-ins; has to tap 30 times.

**Fix (low priority):** Add "Add multiple days" sheet: table with 7 date/weight rows, save all at once. OR accept single-entry UX (keeps it simple).

---

## Part C: Retries for Transient Network Failures

### C1. Audit of Current Retry Behavior

**Summary:** Zero retry infrastructure exists. All Server Actions throw on first failure.

**Safe to retry (idempotent):**
- `editSet` (update by ID, upsert semantics)
- `deleteSet` (idempotent delete)
- `finishSession` (line 403: `is('finished_at', null)` ensures write-once)
- `saveSessionReadiness` (line 328: rejects if any sets logged; write-once before first set)
- `updateSessionFeedback` (update by session ID)
- `saveBodyweightEntry` (upsert on unique date key, or atomic RPC in later PR)
- `savePeriodObservation` (when implemented; unique date constraint makes retry safe)
- `saveProgram` (upsert semantics, though needs transaction wrapper first)
- All reads (`getExerciseHistory`, `loadWorkoutRecords`, etc.)

**NOT safe to blind-retry (non-idempotent):**
- `logSet` (line 208-223 inserts new row; retry doubles the set)
  - **Fix:** Add client-generated `idempotency_key` UUID; unique constraint on `(session_id, idempotency_key)`. Retry becomes safe.
- `startNextSession` / `startPlannedSession` (line 136-146 inserts session; retry creates dupe session)
  - **Fix:** Check for open session before insert (line 132 already does this for resume case). Retry becomes safe.
- `acceptAdaptation` (line 474 inserts adaptation row; retry could create dupe)
  - **Fix:** Add unique constraint on `(user_id, program_slot_id, exercise_id, action, created_at day)` to prevent same-day dupes. OR make RPC idempotent.

### C2. Proposed Retry Policy

**Tier 1 (hot paths — highest user pain if lost):**
- `logSet`, `editSet`, `deleteSet` → retry 5xx, timeout, network error
- `finishSession` → retry 5xx, timeout (losing finish is high-pain)
- `saveSessionReadiness`, `updateSessionFeedback` → retry 5xx, timeout

**Tier 2 (important but less hot):**
- `saveBodyweightEntry` → retry 5xx, timeout
- `savePeriodObservation` (when implemented) → retry 5xx, timeout
- `saveProgram` → retry 5xx, timeout (but fix transaction wrapper first)

**Tier 3 (reads — retry everywhere):**
- All data-fetching Server Actions → retry 5xx, timeout, network error

**Never retry:**
- 401 (auth failure), 403 (permission denied), 400 (bad request) → fail immediately, surface to user

**Backoff:** Exponential with jitter: 4s, 8s, 16s, 32s max. Total 4 retries = ~60s max before giving up.

**User-visible pending/retry UI:**
- Show spinner during first attempt
- After first retry, show "Network slow, retrying..." with attempt count
- After 3rd retry, show "Saving... (slow connection, tap to cancel)"
- On final failure, show error + "Retry" button

### C3. Implementation Sketch

**Minimal shared helper (safe to ship now):**

```typescript
// src/lib/retry.ts
export interface RetryOptions {
  maxAttempts?: number; // default 4
  baseDelay?: number; // default 4000ms
  maxDelay?: number; // default 32000ms
  retryableStatuses?: number[]; // default [500, 502, 503, 504, 408, 429]
}

export async function retryAction<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 4, baseDelay = 4000, maxDelay = 32000, retryableStatuses = [500, 502, 503, 504, 408, 429] } = options;
  
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if error is retryable
      const isRetryable = error instanceof Error 
        && (error.message.includes('fetch failed') 
            || error.message.includes('network') 
            || error.message.includes('timeout')
            || (error as any).status && retryableStatuses.includes((error as any).status));
      
      if (!isRetryable || attempt === maxAttempts - 1) {
        throw error;
      }
      
      // Exponential backoff with jitter
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  throw lastError;
}
```

**Wiring example (editSet):**

```typescript
// src/app/(app)/session/actions.ts
export async function editSet(input: EditSetInput) {
  return retryAction(async () => {
    const { supabase, userId } = await requireUser();
    // ... existing editSet logic unchanged ...
  });
}
```

**Client-side usage (active-session.tsx):**

```typescript
// src/app/(app)/session/[id]/active-session.tsx
async function handleEdit(setId: string, updates: EditSetInput) {
  setError(null);
  setRetrying(false);
  startTransition(async () => {
    try {
      await editSet({ setId, ...updates });
    } catch (err) {
      if (err instanceof Error && err.message.includes('retry')) {
        setRetrying(true); // show "Retrying..." UI
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save. Tap to retry.');
      }
    }
  });
}
```

### C4. Idempotency Requirements

**Before wiring retry to `logSet`:**

1. Add migration:
```sql
ALTER TABLE set_log ADD COLUMN idempotency_key uuid;
CREATE UNIQUE INDEX set_log_idempotency_key ON set_log (session_id, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;
```

2. Update `LogSetInput`:
```typescript
export interface LogSetInput {
  idempotencyKey: string; // client-generated UUID
  sessionId: string;
  // ... rest unchanged
}
```

3. Client generates once per set:
```typescript
const idempotencyKey = useRef(crypto.randomUUID()).current; // generate once per set entry
await logSet({ ...input, idempotencyKey });
```

4. Server insert:
```typescript
await supabase.from("set_log").insert({ 
  idempotency_key: input.idempotencyKey, 
  // ... rest 
});
```

Retry now safe: duplicate insert fails unique constraint, returns existing row.

---

## Recommendations

### Ship now (small PR, high impact):
1. Implement shared `retryAction()` helper (50 lines)
2. Wire to `editSet`, `deleteSet`, `finishSession`, `updateSessionFeedback` (safe, no schema change)
3. Add route-level error boundaries to session/program/analytics
4. Fix period tracking docs (move to proposals/ or note unimplemented)

### Ship next (requires schema migration):
5. Add `set_log.idempotency_key` + wire retry to `logSet`
6. Wrap `saveProgram` in transaction (requires RPC or multi-step transaction helper)
7. Add RLS isolation tests
8. Add request deduplication for stepper controls

### Ship later (larger effort):
9. Implement period tracking (per existing spec)
10. Add integration tests for concurrent writes
11. Optimize catalog/bodyweight caching
12. Simplify Progress hub (UX refactor)
13. Add performance monitoring + budgets

---

## Verification Checklist

**For retry helper PR:**
- [ ] `npm test` passes (add retry helper unit tests)
- [ ] `npm run lint` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` succeeds
- [ ] Manual test: kill network mid-`editSet`, verify retry + success
- [ ] Manual test: simulate 5xx from Supabase (proxy?), verify retry + eventual success
- [ ] Manual test: simulate 403, verify immediate failure (no retry)

**For idempotency PR:**
- [ ] Migration adds `idempotency_key` + unique index
- [ ] `logSet` generates UUID client-side
- [ ] Duplicate `logSet` retry returns existing row, no duplicate insert
- [ ] UI doesn't show double-set on retry

---

**End of review. Evidence-based, specific, harsh as requested.**
