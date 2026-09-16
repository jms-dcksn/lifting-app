-- Cross-user denial for set_log, the authoritative record of logged sets.
begin;

select plan(8);

insert into auth.users (id, email)
values
  ('50000000-0000-0000-0000-000000000001', 'sets-owner@example.test'),
  ('60000000-0000-0000-0000-000000000002', 'sets-other@example.test');

insert into public.workout_session (id, user_id)
values
  ('50000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000022', '60000000-0000-0000-0000-000000000002');

insert into public.set_log (id, user_id, session_id, exercise_id, set_index, weight, reps, rir, e1rm)
values
  ('50000000-0000-0000-0000-000000000111', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000011', 'bb-squat', 1, 225, 5, 2, 245),
  ('60000000-0000-0000-0000-000000000222', '60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000022', 'bb-squat', 1, 315, 5, 2, 343);

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.set_log),
  1,
  'a user can read only their own sets'
);

update public.set_log
set weight = 230, e1rm = 250
where id = '50000000-0000-0000-0000-000000000111';

select is(
  (select weight from public.set_log where id = '50000000-0000-0000-0000-000000000111'),
  230::numeric,
  'a user can update their own set'
);

insert into public.set_log (user_id, session_id, exercise_id, set_index, weight, reps)
values ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000011', 'bb-deadlift', 1, 315, 5);

select is(
  (select count(*)::int from public.set_log where exercise_id = 'bb-deadlift'),
  1,
  'a user can insert their own set'
);

delete from public.set_log where exercise_id = 'bb-deadlift';

select is(
  (select count(*)::int from public.set_log where exercise_id = 'bb-deadlift'),
  0,
  'a user can delete their own set'
);

select throws_ok(
  $$insert into public.set_log (user_id, session_id, exercise_id, set_index, weight, reps) values ('60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000022', 'bb-bench', 1, 185, 8)$$,
  '42501',
  null,
  'a user cannot insert a set for another user'
);

-- RLS hides the other user's rows, so these must match zero rows. The assertions below
-- run without RLS to confirm the target row was genuinely left untouched.
update public.set_log set weight = 999 where id = '60000000-0000-0000-0000-000000000222';
delete from public.set_log where id = '60000000-0000-0000-0000-000000000222';

reset role;

select is(
  (select count(*)::int from public.set_log where id = '60000000-0000-0000-0000-000000000222'),
  1,
  'a user cannot delete another user set'
);

select is(
  (select weight from public.set_log where id = '60000000-0000-0000-0000-000000000222'),
  315::numeric,
  'a user cannot update another user set'
);

select is(
  (select count(*)::int from public.set_log where user_id = '60000000-0000-0000-0000-000000000002'),
  1,
  'the other user keeps exactly their own sets'
);

select * from finish();
rollback;
