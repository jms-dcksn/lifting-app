# Persistent Coach inbox (#195)

The exception policy remains the eligibility authority. `coach-episode-evidence.ts` adapts a
complete owner-scoped snapshot to observations; `coach-episodes.ts` plans pure lifecycle
transitions; `coach-inbox-data.ts` signs and reconciles those transitions with the user's
Supabase client. No model is called by refresh, read, acknowledge, preferences or pain-end.

## User experience

`/coach/inbox` contains immutable original notices and current episode evidence. The shell
shows unread count and at-most-once compact arrivals outside immersive workout/planner/builder
chrome. Opening a notice marks it read; Acknowledge records review only. A distinct confirmed
**This pain situation has ended** records `user_reported_ended`, never medical clearance.
Pain remains session-scoped and offers no invented pain-specific target. Structural training
choices appear directly on the notice review. A scoped **Accept change** (or named replacement)
click is the explicit confirmation and uses the shared #141 action boundary; no chat or second
confirmation screen is needed. Failed acceptance retries keep the same request UUID.
**Discuss with Coach** creates/reuses the episode thread and starts its first response with
current authorized evidence. Reopening an answered conversation and reloading stay passive;
failed discussion requires an explicit Retry. Details and choices remain available from chat.
The default coaching entry-point change and routine acceptance retirement remain #206.

Preferences persist pain/reduction/plateau/decline categories and optional timezone-aware quiet
hours. Quiet hours defer arrivals, not inbox visibility. Disabled categories consume their
attention events, so enabling them cannot replay old alerts. No automatic reminders, PR alerts,
background scheduler, browser/native push, email or closed-app delivery are added.

## Identity, lifecycle and evidence

An owner + canonical context key identifies a continuing episode. Lift keys include slot and
all `StallContext` fields; changing numerical targets, set IDs, reason lists or raw week alone
does not split identity. All performance causes share one context. Session pain uses the
owner-level `session_pain:v1` key with actual source sessions in evidence.

Evidence changes increment revision; delivery is separately unique by episode + occurrence +
attention key. Read/ack state survives evidence changes and retries. A higher-priority cause,
changed meaningful plateau intervention or new significant-pain session can warrant new attention.
Correcting the same exposure cannot create a new occurrence or replay consumed attention.

Bootstrap evaluates 90 days of support with 21-day latest-performance/pain freshness, inserts
current notices quietly, and commits its watermark with them. Persisted unresolved pain sources
are refetched regardless of age, including reopened workouts. Fresh comparable recovery needs a
new session beyond the stored frontier and enough supporting evidence for the original cause.
Missing/old/incomplete evidence stays stale; correction/deletion invalidates; changed context
supersedes. No classifier empty array means recovery. Fluid dismissal preserves the canonical
two-exposure snooze; expiration alone is not a new notification.

Original snapshots are preserved separately from current evidence. Invalidated source snapshots
are redacted while delivery identities survive. No notes or period observations enter episode
evidence. Terminal/frontier and unresolved history remain until account deletion or explicit
Clear Coach history. Clear removes episodes/notices, preserves training/adaptations/transcripts
and preferences, and reinitializes quietly rather than replaying an arrival flood.

## Database and authorization

`20261015012412_coach_exception_inbox.sql` adds four owner-scoped, RLS-protected tables:
`coach_refresh_state`, `coach_episode`, `coach_notice`, `coach_preferences`. The #141 migration adds owner-scoped `coach_episode_thread` and `coach_action_receipt`,
with atomic opening and confirmed-action RPCs.
Clients have owner SELECT only; all writes use named invoker dispatchers/private executors.
The NOLOGIN `coach_executor` role has no superuser/RLS-bypass privilege and explicit owner
policies. Schema CREATE is granted only during function ownership transfer, then revoked;
the installing database administrator receives role membership with inheritance disabled.
The private schema must remain outside PostgREST's exposed schemas.

Supabase's migration administrator can use `auth` and `extensions`, but cannot grant
their schema access to a custom role. Three private, read-only adapters remain owned by
the installer: JWT owner lookup, Auth user IDs (optionally filtered), and SHA-256 HMAC.
Only `coach_executor` may call them; each fixes an empty search path. They expose no
credentials or training writes. The executor itself needs neither schema access nor
direct Auth-table grants, and all derived writes still enforce its owner RLS policies.

The server HMAC-signs the exact UTF-8 payload with owner, operation, policy/default versions,
source/state/preferences revisions, key ID and 60-second lifetime. The restricted DB key table
is not client-readable. Executors verify MAC (including null rejection), owner, operation,
version and clock bounds before locking/rechecking and writing. Direct executor calls enforce
the same guards. No privileged application client or service-role key is used.

Before-statement guards acquire the owner state lock before training row locks. Before-row
triggers advance source revision on the twelve authoritative tables, including cascades and
writes from old clients. Save, activation and both swap RPCs acquire that lock before their
existing explicit row locks. Administrative statements lock owners in UUID order; account
cascades skip revision writes for the deleted owner. The training-write counter is transactional;
notification processing is a separate best-effort request and never rolls back saved training.

Reconciliation compares source, state and preferences versions and atomically commits episodes,
unique notices and watermark. Source contention reloads/recomputes once, then returns
`refresh_required`. Arrival claims recheck category, quiet hours, pain precedence, current
validity and read state. Lost arrival responses can lose a toast, never the persistent notice.

## Refresh and rollout

Successful finish/feedback, history edits/deletes, program writes, adaptations/swaps, weight
writes and baseline profile writes request best-effort refresh. Source guards cover every
other authoritative mutation. Shell route entry (including upcoming-workout review), foreground
return and focus recover failures without visiting Coach. Requests coalesce in the shell;
database guards provide correctness across tabs. Retry is exposed in the inbox and failure
status on the shell entry. Active-session chrome never displays inbox controls or arrivals.

Set `COACH_INBOX_ENABLED=true` only after applying the migration, provisioning matching keys,
and validating the target environment. Without the flag, refresh performs no database work.
An enabled but missing/mismatched key fails closed with retryable refresh; workouts stay saved.
See [deployment instructions](../DEPLOY.md#coach-inbox-rollout-195).

## Verification

- `npm test`: pure lifecycle, canonical evidence adapter, signed-command/data boundary and
  jsdom chrome/inbox tests, alongside existing training/target tests.
- `npm run test:db`: all `*_rls.sql`; `coach_episodes_rls.sql` tests owner isolation,
  direct-write denial, private key/function access, null/forged/expired/wrong-owner commands,
  bootstrap/replay, preferences CAS, pain-end, clearing and account cascades.
- `COACH_TEST_DATABASE_URL=postgresql://...@127.0.0.1:54322/postgres npm run test:db:concurrency`:
  disposable loopback database only. Real connections prove competing refreshes, lost-response
  replay, source-edit contention, source rollback, RPC lock order and preference races. CI runs it.
- Browser review: empty inbox, qualifying exception/current target, read/ack + reload,
  significant-pain precedence and explicit pain-end, preference persistence, no active-session
  interruption, stale/deleted evidence, no happy-path alerts and no model requests.

Local SQL/browser verification does not prove hosted migration/key installation. Thread/action ownership, structural atomicity and receipts have their own #141 regression checks.

### Implementation verification — 2026-10-14

The implementation passed 1,062 unit/integration tests (one gated live test skipped), lint
with the existing `board.ts` unused-variable warning, standalone typecheck and production
build. The complete pgTAP suite passed 131 assertions on disposable PostgreSQL 17; actual
competing connections passed the concurrency script. All migrations also installed under
a database owner without superuser privileges to check the dedicated-role ownership grants.

Chromium exercised the production app and real local PostgREST/PostgreSQL using a synthetic
signed-cookie/auth-response fixture. Verified evidence/95 lb effort target, acknowledgement
across reload, pain acknowledgement versus explicit end, category/overnight preferences,
320/390/768px layouts without overflow, and immersive workout entry. A real local set log
and finish produced e1RM/top-weight records plus significant-pain feedback: the recap remained,
only a pain notice was created, and no model call or active-workout inbox overlay occurred.
The HTML teaching section and its inline diagrams rendered; the new snippet matches source.

No hosted migration, key provisioning, production Auth/email flow, live model or deployment
was performed. Keep the flag disabled until the target rollout checks above pass.

### CI permissions correction — 2026-10-15

The first PR CI run failed during Auth fixture creation: source guards ran as
`coach_executor`, which had not actually received `auth` schema access. The original local
installer fixture incorrectly included grant authority. The migration now uses the narrow
adapters above. Regression tests remove executor access to `auth`, `extensions` and
`auth.users` before signup, training, signed-refresh and owner-isolation assertions, and
check that browser roles cannot invoke the adapters.

All migrations installed under a non-superuser database owner with no grant option on
either schema. All 12 pgTAP suites passed (136 assertions), as did competing transactions,
with the executor lacking both schema privileges. This corrects the local permission
fixture; the PR's Supabase CI run remains the check against the complete stack.

The next Supabase run passed the permission boundary and exposed a timing error in the
SQL signing fixture: two `clock_timestamp()` calls could exceed the strict 60-second
lifetime by microseconds. The fixture now uses one statement timestamp for both fields,
matching the application's single captured instant. Production expiry validation is unchanged.

## Validated reads and generated regression coverage (#224/#226)

Stored preferences, episode/evidence JSON and reconcile results pass runtime schemas at
read boundaries. Existing unversioned JSON uses the state row's `episodes-v1` format;
unknown defaults/policy versions and malformed data are explicit unavailable/unsupported
errors, never fabricated defaults. Original evidence is parsed on the server and remains
null when redacted. No storage format, signing bytes, RLS or lifecycle policy changes.
Inbox/stall loaders share advancing-ID pagination mechanics without sharing query policy.
Generated lifecycle sequences complement existing examples and competing-transaction SQL.
[Verification](VERIFICATION.md) describes commands, fixtures, browser checks and limits.
