begin;

select plan(5);

insert into auth.users (id, email)
values
  ('50000000-0000-0000-0000-000000000001', 'coach-owner@example.test'),
  ('60000000-0000-0000-0000-000000000002', 'coach-other@example.test');

insert into public.coach_recommendation_decision
  (user_id, recommendation_key, status)
values
  ('50000000-0000-0000-0000-000000000001', 'rec_owner_12345', 'accepted'),
  ('60000000-0000-0000-0000-000000000002', 'rec_other_12345', 'dismissed');

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.coach_recommendation_decision),
  1,
  'a user reads only their own recommendation decisions'
);

update public.coach_recommendation_decision
set status = 'deferred', deferred_until = now() + interval '7 days'
where recommendation_key = 'rec_owner_12345';

select is(
  (select status from public.coach_recommendation_decision where recommendation_key = 'rec_owner_12345'),
  'deferred',
  'a user can update their own decision'
);

select throws_ok(
  $$insert into public.coach_recommendation_decision (user_id, recommendation_key, status) values ('60000000-0000-0000-0000-000000000002', 'rec_injected_12345', 'accepted')$$,
  '42501',
  null,
  'a user cannot insert a decision for another user'
);

select throws_ok(
  $$insert into public.coach_recommendation_decision (user_id, recommendation_key, status) values ('50000000-0000-0000-0000-000000000001', 'rec_invalid_12345', 'deferred')$$,
  '23514',
  null,
  'deferred decisions require an expiry'
);

select throws_ok(
  $$insert into public.coach_recommendation_decision (user_id, recommendation_key, status) values ('50000000-0000-0000-0000-000000000001', 'rec_invalid_status', 'ignored')$$,
  '23514',
  null,
  'unknown statuses are rejected'
);

select * from finish();
rollback;
