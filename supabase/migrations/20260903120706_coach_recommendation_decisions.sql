-- Review state for deterministic Coach recommendations. The recommendation itself remains
-- derived from workout history; this table stores only the user's response to one evidence
-- snapshot and never mutates program or training data.
create table coach_recommendation_decision (
  user_id             uuid not null references auth.users(id) on delete cascade,
  recommendation_key  text not null,
  status              text not null,
  deferred_until      timestamptz,
  updated_at          timestamptz not null default now(),
  primary key (user_id, recommendation_key),
  constraint coach_recommendation_key_length check (
    char_length(recommendation_key) between 5 and 80
  ),
  constraint coach_recommendation_status check (
    status in ('accepted', 'dismissed', 'deferred')
  ),
  constraint coach_recommendation_defer_state check (
    (status = 'deferred' and deferred_until is not null)
    or (status <> 'deferred' and deferred_until is null)
  )
);

alter table coach_recommendation_decision enable row level security;

create policy "read own coach recommendation decisions"
  on coach_recommendation_decision for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "insert own coach recommendation decisions"
  on coach_recommendation_decision for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "update own coach recommendation decisions"
  on coach_recommendation_decision for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "delete own coach recommendation decisions"
  on coach_recommendation_decision for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, update, delete on coach_recommendation_decision to authenticated;
revoke all on coach_recommendation_decision from anon;

comment on table coach_recommendation_decision is
  'User review state for derived Coach recommendations; never changes program prescriptions.';
