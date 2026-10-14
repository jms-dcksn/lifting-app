# Coach episodes: storage, replay and confirmed actions

Status: proposed, pending owner approval. Design version `episodes-v1`, 2026-10-13.
Delivers [#212](https://github.com/jms-dcksn/lifting-app/issues/212); implementation belongs
to #195 and #141. This document adds no runtime behavior, tables or migrations.
Direction: [exception plan](AI-COACH-EXCEPTIONS-PLAN.md). Current behavior: [AI Coach](AI-COACH.md).

## Decision Card

**Recommendation:** extend the existing Supabase database with six owner-scoped Coach
tables, reuse `agent_thread`/`agent_message`, and commit deterministic reconciliation and
confirmed Fluid actions through narrowly scoped transactional RPCs. Keep calculations in
the existing TypeScript engines. Authenticate every foreground request with `getClaims()`
and use the signed-in Supabase client.

**Reason:** stable episode keys, immutable notification evidence, a database source revision
and action receipts address reloads, edits and competing tabs without a worker, new service,
or another transcript store. Notification state cannot act as training authorization.

**Risk:** source invalidation triggers touch the training write path; the proposed signed
server command boundary adds one per-environment HMAC key and restricted database functions.
Those functions need explicit owner checks even with RLS. Missing invalidation coverage could
permit stale confirmation. These are implementation gates, not claims of verified safety.

**Decision needed:** approve this storage/RPC boundary and the defaults below before #195
migrations or #141 action implementation. Approval includes the signing-key provisioning and
rotation contract, 90-day bootstrap evidence window, 21-day latest-performance freshness,
pain lifecycle, foreground-only delivery, and retention rules. Merging this design PR alone
does not authorize schema application or mean those choices are approved.

## Source findings

Baseline: merged #215, main `a26c3cc8a8334942d150970ed0f21162bb808394`.

| Source | Current behavior and design consequence |
| --- | --- |
| `src/lib/coach-exceptions.ts` | Pure policy `1.0`; returns recommended candidates, grouped by slot or session-level pain. Empty output is not a lifecycle event. |
| `src/lib/stall-report.ts` | `StallContext` includes program/day, exact exercise/equipment, phase, adaptation start, reps/RIR/sets. It excludes raw week number. Preserve this comparison boundary. |
| `src/lib/effective-workout-target.ts` | Calculates current suggestions from logged evidence. A target is not an applied adaptation; no target value is written into a program by reconciliation. |
| `src/lib/agent/thread.ts` | Ordinary chats create a thread on the first message. Episode opening needs its own atomic create/link/seed path; leave ordinary drafts unchanged. |
| `20260927170000_agent_multi_thread.sql` | Messages have a composite thread/owner FK. Episode links need the same ownership guarantee. |
| `src/app/(app)/session/actions.ts`, `acceptAdaptation` | Inserts an adaptation, then separately swaps the session exercise. Takes session ID and client-supplied ladder/band fields. Do not wrap this action and call it atomic or pre-session safe. |
| `swap_session_exercise` / `swap_program_slot_exercise` migrations | Existing invoker transactions implement manual swaps and their scope. Fluid interventions have different fold semantics; share validation/write primitives, not a second manual-swap event. |
| `src/lib/strength/plateau.ts`, `src/lib/fluid.ts` | One rep-change rung then swap; dismissal snoozes for two eligible exposures. Preserve those rules and ranked, loggable candidate pool. |

## Identity and evidence

Use three different identifiers:

- **Episode:** a continuing situation, unique by `(user_id, family, context_key)`.
- **Evidence revision:** increasing `revision` on that episode, plus a canonical evidence
  fingerprint. Source corrections can change it without producing another alert.
- **Notice:** `(episode_id, occurrence, attention_key)`, unique delivery identity. Read,
  acknowledge and arrival state belong here, independently of episode health.

For lift performance, `family = lift_performance`; `context_key` is a versioned canonical
serialization of slot ID and all `StallContext` fields. Merge effort, rep-floor, plateau and
decline signals in that episode. Do not put reason lists, set IDs, target numbers, weekly
proposal hashes or policy version in its stable identity. Raw week advances do not split an
unchanged prescription; phase, rep/RIR/set, exercise, equipment or adaptation changes do.
Store the canonical context alongside its digest and reject a digest collision with different
context. Policy versions describe evidence, not a new situation.

For pain, `family = session_pain`, `context_key = session_pain:v1`: one owner-level review
episode, with its actual painful session IDs in evidence. No lift association is invented.
New significant-pain feedback joins that continuing review; it does not change episode ID.

`occurrence` starts at 1. A genuinely new qualifying exposure after terminal resolution can
reopen the same identity with occurrence +1. Store the terminal source frontier (session IDs
and completion order) so replay, report rollover and corrections of the same exposure cannot
create recurrence. A corrected old episode can reopen quietly within the same occurrence;
only a new completed exposure creates a new arrival. Changed context uses its own identity.

Evidence stores sorted typed signals, source IDs and observed values needed to explain them,
exact context, policy/default versions, evaluation time, source revision and target
availability/status. Keep initial notice snapshots immutable; display current evidence next
to the original reason when it has changed. Do not copy notes, period observations or the
whole training log. Source IDs are authorized internal references, never public exports.
Explicit owner/source deletion permits redacting snapshot values; mark that redaction and
retain only delivery identity/frontier needed to prevent replay. It is an intentional privacy
exception to immutability, not an evidence rewrite that can create another attention event.

## Lifecycle and delivery

Episode state is `open`, `resolved` or `superseded`. A separate evidence validity is
`current`, `stale`, `invalidated` or `blocked_by_pain`. Notice read/acknowledged timestamps and
episode snooze fields represent the requested open/read/acknowledged/snoozed experience
without conflating those operations with resolution.

| Event | Episode / notice behavior |
| --- | --- |
| First qualifying current candidate | Open episode; insert one notice, subject to bootstrap and category rules. |
| Same candidate on reload/retry | Return existing revision/notice; no new unread state or target subtraction. |
| New exposure, same continuing reason/action | Update evidence revision only; preserve read and acknowledgement. |
| New higher-priority cause or changed meaningful intervention | At most one new notice for that attention key per occurrence. New pain session is one additional attention event. |
| Read / dismiss / acknowledge | Set notice timestamps monotonically. Dismiss means acknowledge; never resolve, adapt or erase pain. |
| Keep going on Fluid plateau | Confirmed `dismiss` adaptation and exposure snooze in one transaction; does not resolve the episode. |
| Snooze reaches two new comparable eligible exposures | Revalidate, then remove snooze. No reminder notice for the unchanged situation; changed intervention may notify. |
| Fresh comparable evidence no longer supports any signal | Resolve a performance episode with typed recovery reason and source references. |
| Evidence corrected/deleted/reopened | Recompute. Mark invalidated or superseded if its factual basis no longer exists; do not claim recovery. |
| Program/slot/phase/identity changes | Supersede old performance context; validate a new context independently. Program deletion does not resolve pain. |
| Missing/incomplete reads or old latest exposure | Keep episode with stale validity; hide actionable buttons. Empty classifier output alone never resolves. |
| Confirmed rep-change / swap | Supersede the old performance context, record applied receipt, revalidate new context. |

The proposed performance recovery adapter uses a **new** eligible exposure beyond the stored
source frontier, a complete unchanged context, and the same canonical classifier with no
remaining signal. Two effort/floor misses therefore need new evidence that breaks that pair;
plateau recovery uses the engine's rep/e1RM improvement rule; decline uses its four-exposure
rule. Absence because of pain precedence, deload, snooze, cutoff, read failure or missing
history is not recovery. A complete correction can invalidate the evidence, with that reason.

Pain remains open across week rollover, time passage, acknowledgement and category changes.
Persist the IDs that have supported it and explicitly refetch their feedback outside the
bootstrap window. Reopened painful sessions become invalidated/pending completion, not
resolved; refinish reuses their evidence identity. Deleted/corrected significant feedback can
supersede an unsupported episode. For user-reported resolution, offer a separate confirmed
**This pain situation has ended** operation; label `user_reported_ended`, not medically cleared.
Record the covered source frontier. A later significant-pain session reopens it; unchanged
old feedback does not immediately undo that report. Pain acknowledgement offers no such claim.

An open pain episode blocks performance arrival prompts and structural action offers, even
if the latest classifier no longer sees it in its time window. Existing performance episodes
remain visible as blocked, without changing automatic targets or local warnings. Once pain
ends or its evidence is superseded, recompute performance before restoring actions/arrival.

`attention_key` uses typed cause/action, not generated severity: first occurrence, newly
added reason ranked above the last delivered cause, changed `rep_change` band / `swap`
intervention, or a new significant-pain source session. Sorted reason/action keys are retained
for the occurrence: toggling a correction off/on cannot replay an already-delivered event.
Numeric target differences alone are evidence revisions. No periodic reminder or PR notices.

## Proposed defaults (`episodes-v1`)

These are product defaults to approve, not changes to strength formulas.

| Setting | Proposed V1 contract |
| --- | --- |
| Bootstrap | On first successful refresh, evaluate supporting evidence from the previous 90 × 24 hours. Latest performance exposure and bootstrap pain source must be within 21 × 24 hours. |
| Normal refresh | Use the same 90-day supporting window and 21-day latest-performance freshness; separately refetch persisted pain sources regardless of age. No historical legacy-review backfill. |
| Bootstrap arrivals | Insert eligible current notices in inbox; mark arrival suppressed as `bootstrap`. No initial toast flood. Bootstrap completion and notices commit together. |
| Categories | Pain, repeated reduction, plateau and decline enabled; setting version stored. Disabling delivery leaves calculations, existing inbox evidence and outstanding pain intact. |
| Disabled category | Reconcile episode; do not create notice for that category. Re-enabling does not replay previously suppressed attention events; allow genuinely new attention events. |
| Quiet hours | Off by default. User can choose local start/end minutes and an IANA timezone; equal start/end invalid, overnight spans supported. Database UTC timestamps remain authoritative. |
| Quiet hours effect | Inbox/badge accessible immediately; arrival deferred to the next authenticated foreground refresh outside quiet hours after revalidation. No clock wakeup or closed-app delivery. |
| Active workout | Defer compact arrival indication while app chrome is hidden; do not interrupt set entry. On leaving, revalidate before claiming arrival. |
| Snooze | Fluid Keep going = existing two eligible exposures in the same context, counted by distinct session IDs after the dismiss timestamp. No invented day-based snooze. |
| Retention | No automatic deletion of unresolved episodes. Retain terminal identity/frontier, action receipts and notice generation evidence until owner deletion/account deletion; no scheduler in V1. |
| Clear Coach history | Explicit destructive confirmation; delete notices, episode links, episodes and receipts, retain training/adaptations and normal conversations. Keep bootstrap suppression state; next refresh may repopulate current situations quietly. |

Use server UTC evaluation time; label program weeks separately from calendar reporting.
If an old plateau's required evidence falls outside 90 days, show stale evidence and request
new comparable logs instead of relaxing the cutoff. On rollout, compare fixtures for slow
training cadence before approving these defaults. Timestamp edits do not count as new sessions.

## Proposed schema and constraints

Names/types below are a migration map, not executable DDL. Six new public tables, each with
`user_id → auth.users ON DELETE CASCADE`, enabled RLS and an indexed owner prefix.

| Table | Essential columns / constraints |
| --- | --- |
| `coach_refresh_state` | `user_id PK`, `source_revision bigint`, `reconciled_revision bigint`, `bootstrap_at`, `history_cleared_at`, `defaults_version`. Source revision increases on authoritative mutations; never directly writable by clients. |
| `coach_episode` | `id uuid PK`, `user_id`, `family`, `context_key`, `context jsonb`, `occurrence`, `revision`, `evidence_fingerprint`, `current_evidence jsonb`, `attention_history jsonb`, `state`, `validity`, `terminal_reason`, `terminal_frontier jsonb`, `snooze_after`, `snooze_source_ids jsonb`, timestamps. UNIQUE `(user_id,family,context_key)` and `(id,user_id)`; enum/check constraints and positive counters. |
| `coach_notice` | `id uuid PK`, `user_id`, `episode_id`, `occurrence`, `attention_key`, `generation_revision`, immutable `generation_evidence jsonb` / deterministic copy and versions, `read_at`, `acknowledged_at`, `arrival_state`, `arrival_at`, timestamps. UNIQUE `(episode_id,occurrence,attention_key)`; composite episode/owner FK, cascade on explicit history deletion. |
| `coach_preferences` | `user_id PK`, four category booleans, quiet-hours enabled/start/end/timezone, `version`, timestamps. Validate timezone and minute ranges; preferences CAS update increments version. |
| `coach_episode_thread` | `episode_id PK`, `user_id`, `thread_id`, `seed_message_id`, `seed_revision`, timestamps. Composite FKs to episode/owner and thread/owner, both cascade. One thread per stable episode, reused across evidence/occurrences. |
| `coach_action_receipt` | `id uuid PK`, `user_id`, `request_id uuid`, `episode_id`, occurrence/revision, action/context/scope, input fingerprint, immutable confirmed evidence, `adaptation_id nullable`, result JSON, timestamp. UNIQUE `(user_id,request_id)` and `(episode_id,occurrence,revision,action)` for successful structural actions. |

Add UNIQUE `(id,user_id)` to `movement_adaptation`; composite receipt/adaptation FK restricts
deletion while a receipt retains its application evidence. Episode/owner FK on receipts
cascades for explicit Coach history deletion; this never deletes adaptations. Episode thread
seed uses a composite `(seed_message_id,thread_id,user_id)` FK to a corresponding unique
message key. Deleting the seed/message/thread removes the link, not the episode. After a
thread is deleted, the old deep link shows unavailable; an explicit new episode open can
create a replacement. Direct link owner/thread/seed reassignment is prohibited.

Context stores historical IDs as values, not cascading FKs: deleting a program must not
silently delete review history or pain. Confirmation still checks live ownership of every
referenced row. Never resolve an episode by trusting context JSON or a client-passed owner.

Indexes: episode `(user_id,state,updated_at DESC,id)`; notice
`(user_id,created_at DESC,id)` and unread partial `(user_id,created_at DESC,id)`;
thread link `(thread_id,user_id)`; receipt `(user_id,created_at DESC)` plus unique keys.
Use keyset pagination (50 notices/page); no unbounded inbox load. Initial notice evidence
includes only the classifier's necessary contiguous series/source values, not unrelated logs.

## Grants, RLS and server command boundary

RLS permits authenticated SELECT with `USING ((select auth.uid()) = user_id)` on all six
tables. For preferences, grant INSERT/UPDATE only on user-controlled columns: INSERT
`WITH CHECK` matches `auth.uid()`; UPDATE has both ownership `USING` and `WITH CHECK`.
Use a trigger for `version`/timestamp; reject owner changes. No public/anon grants.
Derived episode/notice/state/link/receipt tables have no authenticated direct write grants
or write policies. Read/ack/clear/open mutations go through their narrow RPCs. Future
implementation must explicitly grant SELECT; merely creating an exposed table is insufficient.

A user-scoped RPC is reachable outside the app. Owner RLS alone cannot prove that the client
used the TypeScript classifier or selected the currently valid Fluid band. Do not accept
arbitrary candidates, recovery assertions or ladder fields as trusted database input.

Propose a server-only HMAC-SHA256 attestation for reconciliation and action commit commands:

1. Server verifies claims, loads authorized canonical data with the user's client, validates
   request intent and runs existing engines. Read `source_revision` before and after all
   paginated reads; if different, discard and retry before signing.
2. Sign the exact UTF-8 payload text, with owner, operation, request ID, policy/default
   versions, source revision, preferences version, episode occurrence/revision when relevant,
   selected action/scope, proposed deterministic transitions, issue/expiry timestamps and
   key ID inside it. Do not parse/re-serialize the text before MAC verification in Postgres.
3. A public SECURITY INVOKER dispatcher calls only its named private executor. Private
   executors use SECURITY DEFINER, empty search_path, schema-qualified objects, fixed
   operation schemas, no dynamic SQL and explicit `auth.uid()` ownership checks throughout.
   Their dedicated NOLOGIN owner has only the required table/column privileges, no BYPASSRLS;
   add operation-specific RLS policies for that role using the caller's `auth.uid()`.
4. Revoke default function EXECUTE from PUBLIC/anon. Grant authenticated EXECUTE only for
   named dispatchers/executors and schema USAGE needed to call them; do not expose the
   private schema through PostgREST or grant its tables. Direct executor calls must perform
   identical checks. The private key table has no authenticated SELECT/EXECUTE access.
5. Executor verifies MAC, payload owner = `auth.uid()`, versions and expiry, then locks and
   compares database revisions/relationships before writing. Signature proves server
   preparation; it does not replace the user's session, source freshness or confirmation.

Store the per-environment key outside migration source: server ignored env/deployment secret
`COACH_COMMAND_SIGNING_KEY` and restricted `private.coach_command_key` (key ID, key, validity).
This secret cannot access Supabase data and is not `SUPABASE_SECRET_KEY`. No signatures,
keys or evidence payloads in logs/traces; commands stay server-to-RPC, not in links/buttons.
Proposed expiry: 60 seconds, maximum clock skew 5 seconds. Rotate by installing a new DB key,
then deploying the matching server key; accept the prior key for at most 65 seconds after
cutover, then revoke. Local/Preview/Production keys must be distinct. Missing/mismatched key
fails closed with retryable inbox refresh, while saved workouts remain saved.

Before migrations, prove exact byte/HMAC parity using Node and the installed database
`pgcrypto` version, inspect grants/function ownership, and exercise forged/direct RPC calls.
No privileged client or database connection is introduced in the app. If this boundary is
rejected, return for a revised Decision Card; do not quietly grant direct derived writes or
duplicate the strength engine in SQL.

## Source revision and transactional replay

`source_revision` is a per-owner monotonic database counter, not a timestamp or cached stat.
Lightweight triggers bump it in the same transaction as authoritative INSERT/UPDATE/DELETE
on `set_log`, `workout_session` (including feedback/finish/reopen/time/choices), `program`,
`program_day`, `program_slot`, `program_phase`, `movement_adaptation`, owner equipment and
exercise variants, bodyweight logs/profile inputs used by targets, and `user_exercise_stat`.
Shared exercise/catalog changes bump all affected owners; policy/code versions are checked
separately. Triggers cover cascades and any existing RPC/direct writes, not just app callbacks.

Every such statement acquires the owner state lock **before** source-row mutation, ordered
by owner UUID for multi-owner/catalog maintenance. All Coach transactions lock state first,
then episode, session, slot and receipt rows in a fixed order. Existing RPCs that currently
lock sessions/slots must join this ordering before their first lock; include `save_program`,
activation and both swap RPCs in the lock audit. An AFTER-row bump alone is insufficient:
it can deadlock against a confirmation that already holds the state lock. Transaction rollback
rolls back the counter. Trigger failures abort the source write; integration tests must show
these tiny counter writes cannot be mistaken for best-effort notification processing.

Proposed reconciliation transaction:

1. Authenticate/verify signed complete evaluation; lock the owner's state row (upsert for
   first use). Reject source/prefs/version mismatch; do not advance reconciliation watermark.
2. Upsert episodes by stable unique key; compare evidence fingerprint before incrementing
   revision. Apply typed resolution/supersession only with explicit validated reason.
3. Insert notices with unique attention keys and immutable generation evidence; preserve
   read/ack/arrival state. Record suppressed attention keys in episode evidence/lifecycle
   metadata so enabling preferences cannot replay them.
4. Set bootstrap/watermark and perform any due owner-scoped retention/history-clear work;
   commit all or nothing. Return current IDs/status, not an assumed new notification.

Preference writes also lock owner state first, then their row, so an arrival/action cannot
race past a newly disabled category or preference version. Preference changes do not bump
training source revision. Suppression records which category/attention keys were considered,
including grouped candidates with some categories disabled; enabled causes can still notify.

Source mismatch gets one immediate reload/recompute attempt; repeated contention returns
`refresh_required`. Mutation IDs and unique keys recover lost responses. Same-source empty
evaluation may update freshness/suppression, but cannot resolve unrelated or unreadable contexts.
Wall-clock expiry/quiet hours are evaluated even when source revision is unchanged.

| Replay case | Required result |
| --- | --- |
| Two tabs load revision N; one source edit commits N+1 | Both old commands reject; neither can overwrite N+1 evidence. |
| Two tabs submit identical current evaluation | One episode and notice; second returns existing IDs. |
| Notification commit succeeds; HTTP response lost | Retry upserts same identity, preserves read/ack and suppresses duplicate arrival. |
| Finished session reopens, is deleted, or set/bodyweight corrected | Source revision advances; invalidate/recompute affected basis without claiming applied/recovered. |
| Program switch, phase edit, variant/equipment change | Old context actions reject; supersede old performance evidence. Pain stays session-level. |
| Engine/schema version changes | Reject unsupported command versions; fresh server evaluation updates evidence quietly, never backfills old alerts. |

## Foreground API and refresh hooks

Proposed Server Actions use existing `requireUser`/`createClient` conventions and no-store
responses. GET inbox is read-only; reconciliation is an authenticated POST/action.

| App operation | RPC / result contract |
| --- | --- |
| `refreshCoachInbox()` | `reconcile_coach_episodes(payload, mac)`; deterministic evaluation → IDs, source revision, retryable refresh status. |
| `loadCoachInbox(cursor)` | Owner RLS SELECT with current validity and immutable generation summary. Stale watermark disables confirmation until refresh. |
| `markCoachNotice(id, read/acknowledged)` | `mark_coach_notice`; monotonic notice timestamps only, validated owner; idempotent without signature. |
| `saveCoachPreferences(input, version)` | Owner-scoped CAS preference update; conflicts refetch. Does not touch training. |
| `openCoachEpisode(episodeId)` | `open_coach_episode`; refresh/revalidate, then atomically create/reuse owned thread + deterministic seed + link. No model invocation. |
| `confirmCoachEpisodeAction(input)` | Server recompute/sign → `commit_coach_episode_action`; receipt or `stale_action`/`refresh_required`. |
| `confirmCoachPainEnded(input)` | Separate explicit user intent → signed `end_coach_pain_episode`; record covered source frontier and `user_reported_ended`, with no training write. |
| `clearCoachHistory()` | `clear_coach_history`; explicit user confirmation; one owner-scoped transaction, preserves bootstrap suppression. |

Refresh after successful finish/feedback edit, set/history edit/delete, session reopening or
deletion, adaptation/manual swap, program save/activation, and target-relevant identity/bodyweight
changes. Also refresh on signed-in app entry, foreground return and upcoming-workout review.
Coalesce concurrent UI refresh requests, but correctness comes from DB guards. On failed
refresh, return successful training result plus retryable Coach status; recover on next
foreground hook. Never compensate/roll back a saved workout because later inbox processing
failed. No model call in these hooks or set logging; no cron/privileged worker/capability URL.

Arrival is at-most-once per notice: claim its arrival transition transactionally, rechecking
preferences, pain, validity and source revision. A lost response may lose a toast, but never
the persistent unread inbox item. Revalidation retires an obsolete deferred arrival instead
of showing stale copy. The web app provides no delivery while closed.

## Conversation ownership and stale destinations

Episode thread opening locks owner state/episode, reuses its link, or atomically inserts an
ordinary owned thread, bounded deterministic user seed message and link. Seed text says the
user opened a review and includes the reason/evidence revision; it is not an invented model
reply. Current evidence comes from an authorized episode loader each turn, outside mutable
message text. One committed seed/link survives two opens or a lost response.

Opening shows deterministic copy/details first. A separate user-invoked **Discuss with Coach**
request uses the normal chat POST and current model/tool budget; opening/reloading alone
never schedules generation or retries a paid turn automatically. Existing chat model limits
remain. This deliberately requires an explicit chat interaction rather than a paid page load.

Routes carry only episode/thread IDs, never evidence or confirmation credentials. Other-user
or missing IDs return the same unavailable result. A superseded/stale episode opens its
read-only explanation with no stale buttons. Deleted threads leave the episode intact; old
thread URLs do not create new threads. An explicit episode open can link a replacement.
Transcript edits cannot authorize actions. Deleted source evidence is redacted from derived
current/notice snapshots on next refresh; plain-language chat history remains user-managed
and states that its earlier evidence is no longer current. Clear Coach history explains that
normal chat transcripts are retained and can be deleted separately.

## Confirmed Fluid action contract

The browser submits only `episodeId`, expected occurrence/revision, stable `requestId`,
selected `rep_change`/`swap`/`keep_going` intent, selected replacement ID (swap), and explicit
scope/session ID where applicable. It never supplies trusted owner, load, band or ladder step.

Server revalidates: current owner/program/day/slot, exact live context, episode/source revision,
no unresolved pain block, eligible unsnoozed current plateau, Fluid mode, current ladder rung,
canonical rep band or currently offered loggable swap candidate. Classic plateau is review-only.
Existing candidate pool excludes unresolved station templates; expanding it needs separate scope.

| Confirmed choice | Persistent effect |
| --- | --- |
| Rep range, before session | One `rep_change` adaptation for that slot, canonical band/step; affects future suggestions. No session creation. |
| Rep range, open session | Same program-slot event with explicit remainder-of-program confirmation. Re-render suggestions for unentered sets only; saved/typed values stay. |
| Plateau replacement, before session | One `swap` adaptation, resets home band/ladder under existing fold semantics. Clears conflicting planner choice for this slot after success; no cookie-only training receipt. |
| Plateau replacement, open session | One `swap` adaptation plus matching `exercise_swaps` key update, atomically. Remainder of program; preserve every other choice and all logged sets. |
| This workout only replacement | Existing manual workout swap flow; not accepted plateau intervention, no ladder advance or applied episode receipt. |
| Keep going | One `dismiss` event plus snooze source frontier; no band/exercise/target change. |

If a session opened after a pre-session confirmation was displayed, return `scope_changed`
and present its actual session scope for fresh confirmation. Finished sessions reject actions.
Existing logged values and client drafts stay under the #211 contract; a newly chosen identity
can reset only untouched suggestion fields. Never rewrite historical sets or insert fake logs.

Commit transaction: verify signature/session; lock state → episode → open session if any →
slot; lookup receipt; compare source/prefs/episode revisions and row relationships; insert one
canonical adaptation, optional session choice, applied receipt, and episode supersession/snooze;
commit together. Source triggers bump revision within this transaction; receipt stores both
validated basis and resulting revision. Cookie cleanup/cache revalidation happen afterward
and are retryable from the receipt; a failed cookie cleanup cannot undo the DB commit.

Same owner/request ID and identical input returns the original receipt, even after context
changes or command expiry (after authentication and MAC integrity check); different input with
that ID conflicts. A new request against the already-consumed revision returns `stale_action`,
not a second adaptation. Receipt lookup is before freshness rejection but after authorization.
On an HTTP retry the server first loads the owned receipt by request ID and checks the stable
user-intent fingerprint. It can return that saved result without recomputing a now-consumed
candidate or presenting an expired/rotated command. Signed payload timestamps and source
revisions are not part of that stable intent fingerprint.
`applied` language requires a committed receipt; legacy accepted review rows stay reviewed.
Replace the old active-session acceptance entry with this common action path in #141 so it
cannot bypass the new contract. Retain ordinary manual swap behavior and existing logs.

## Migration, compatibility and rollback

After approval, #195 adds tables/RLS/constraints, source guards and restricted RPC boundary
in an additive migration. #141 adds conversation seed/link and action RPC implementation when
its UI is ready; the above schema map is the shared contract, not a mandate to ship unused APIs.
Use the Supabase CLI to create migration files. Deploy with delivery disabled until local
pgTAP, source-lock integration tests, key provisioning and exact version compatibility pass.

Backfill no notifications/legacy decisions. State rows initialize lazily; perform a complete
first evaluation with revision-before/after guards. Old clients continue training writes;
DB triggers invalidate their effects. Keep report/tools/routes, adaptations and transcript
schema compatible. New code checks supported RPC versions and disables action buttons if the
DB/key is not ready. Hosted application requires explicit `supabase db push` and the existing
production migration ledger gate; local tests do not prove hosted installation.

Rollback first disables arrival/confirmed action entry and deploys compatible old UI; keep
additive storage and signed-command protections. Never drop receipts to roll back an applied
adaptation. If a trigger regression blocks training, a reviewed forward repair can remove
the guard only while Coach commits are disabled; then invalidate/rebootstrap all state before
re-enabling. Destructive table removal needs separate approval/export and does not undo
training writes. Signing keys never appear in the migration ledger or seed files.

## Required verification in implementation PRs

Proposed `supabase/tests/coach_episodes_rls.sql` uses the existing transaction-scoped two-user
fixtures and runs through `npm run test:db`. These tests are not implemented or run here.

| Boundary | Required assertions |
| --- | --- |
| Grants / RLS | anon and other user cannot read/write any six tables or invoke owner operations; derived direct INSERT/UPDATE/DELETE denied; private key unreadable. |
| Ownership changes | Preferences cannot move owners; attempt derived owner/context/thread reassignment; composite message/link/adaptation FK rejects other-user IDs even in bypass-role fixtures. |
| Every operation | Both users exercise refresh, mark read/ack, preferences, open/reopen thread, clear history, pain-end, keep-going and each structural action; denial has no partial rows or leaked evidence. |
| Forgery | Tampered/unsigned/wrong-owner/expired/wrong-version/wrong-operation commands fail; direct private/public RPC calls cannot pick bands or fabricate recovery; MAC byte parity and rotation proven. |
| Atomic actions | Inject failure after adaptation and after session swap; no partial receipt/adaptation/choice/state. Exact receipt replay succeeds; different input conflicts. |
| Deletion | Account cascade; thread/seed deletion removes link only; history clear preserves adaptations/transcripts and bootstrap suppression; source deletion redacts derived details. |
| Source guards | Each authoritative table/RPC/direct mutation/cascade advances revision; source rollback rolls it back; cross-owner bump prevented. |

Use real competing database transactions (two connections) for stale evaluations, simultaneous
open/create, action-vs-set-write, action-vs-program-save, and action retry/lost-response cases.
pgTAP single-transaction fixtures alone cannot prove concurrency or deadlock freedom.

App tests under `src/lib/` cover policy→episode transitions, fresh-vs-missing evidence, 90/21-day
boundaries, pain surviving week rollover/reopen, user-reported end/recurrence, overlapping causes,
correction toggles, disabled/re-enabled categories, overnight quiet hours and DST, two-exposure
snooze, no compounding, bootstrap flood prevention, source-read races and retry status.
Action tests exercise actual canonical candidate recomputation, Classic rejection, pre-session
scope races, open/finished workouts, saved/typed values, distinct days, equipment/bodyweight and
stale cookies. Chat tests cover idempotent seed/open and zero model calls before explicit discuss.

Run tests, lint, typecheck and build for application PRs; authenticated phone/browser journey
proves persistent inbox, no happy-path alerts, honest current/recommended/applied language and
confirmed choices across reload/two tabs. Record local vs hosted checks separately. Update
`docs/ai-coach.html` with landed snippets as implementation progresses.

## Documentation verification and external references

This design was checked against the source paths above and #212's acceptance criteria;
it has not been executed as SQL, tested against a database, provisioned or deployed.
Implementation remains blocked on owner approval and the verification gates above.

Current primary guidance consulted: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[function security and grants](https://supabase.com/docs/guides/database/functions),
[PostgreSQL HMAC](https://www.postgresql.org/docs/current/pgcrypto.html#PGCRYPTO-GENERAL-HASHING-FUNCS),
[explicit locks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS).
The [Data API grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
reinforces explicit grants. The [Postgres minor-upgrade notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
requires checking installed extension compatibility before relying on cryptography; this
proposal uses HMAC, not legacy-cipher encryption. No hosted version was inspected in this slice.
