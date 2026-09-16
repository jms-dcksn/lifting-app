-- Cross-user denial for period tracking: observations plus the profile consent fields
-- that gate them. period_tracking.sql covers uniqueness and future-date constraints.
begin;

select plan(10);

insert into auth.users (id, email)
values
  ('90000000-0000-0000-0000-000000000001', 'period-rls-owner@example.test'),
  ('a0000000-0000-0000-0000-000000000002', 'period-rls-other@example.test');

update public.profile
set sex = 'female', period_tracking_enabled = true, period_consent_version = 'v1'
where id in ('90000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');

insert into public.period_observation (id, user_id, observed_on)
values
  ('90000000-0000-0000-0000-000000000011', '90000000-0000-0000-0000-000000000001', date '2024-03-01'),
  ('a0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000002', date '2024-03-01');

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.period_observation),
  1,
  'a user can read only their own period observations'
);

select is(
  (select count(*)::int from public.profile),
  1,
  'a user can read only their own profile'
);

insert into public.period_observation (user_id, observed_on)
values ('90000000-0000-0000-0000-000000000001', date '2024-03-02');

select is(
  (select count(*)::int from public.period_observation),
  2,
  'a user can insert their own period observation'
);

delete from public.period_observation where observed_on = date '2024-03-02';

select is(
  (select count(*)::int from public.period_observation),
  1,
  'a user can delete their own period observation'
);

select throws_ok(
  $$insert into public.period_observation (user_id, observed_on) values ('a0000000-0000-0000-0000-000000000002', date '2024-03-03')$$,
  '42501',
  null,
  'a user cannot insert a period observation for another user'
);

-- RLS hides the other user's rows, so these must match zero rows. The assertions below
-- run without RLS to confirm the target rows were genuinely left untouched.
update public.period_observation set observed_on = date '2024-01-01' where id = 'a0000000-0000-0000-0000-000000000022';
delete from public.period_observation where id = 'a0000000-0000-0000-0000-000000000022';

update public.profile
set sex = 'male', period_tracking_enabled = false, period_consent_version = 'hijacked'
where id = 'a0000000-0000-0000-0000-000000000002';

reset role;

select is(
  (select count(*)::int from public.period_observation where id = 'a0000000-0000-0000-0000-000000000022'),
  1,
  'a user cannot delete another user period observation'
);

select is(
  (select observed_on from public.period_observation where id = 'a0000000-0000-0000-0000-000000000022'),
  date '2024-03-01',
  'a user cannot update another user period observation'
);

select is(
  (select sex from public.profile where id = 'a0000000-0000-0000-0000-000000000002'),
  'female',
  'a user cannot change another user recorded sex'
);

select is(
  (select period_tracking_enabled from public.profile where id = 'a0000000-0000-0000-0000-000000000002'),
  true,
  'a user cannot change another user period tracking consent'
);

select is(
  (select period_consent_version from public.profile where id = 'a0000000-0000-0000-0000-000000000002'),
  'v1',
  'a user cannot change another user consent version'
);

select * from finish();
rollback;
