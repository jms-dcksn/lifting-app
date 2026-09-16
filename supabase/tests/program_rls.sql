-- Direct table-level cross-user denial for program, program_day, program_slot.
-- Complements program_mutations.sql, which covers save_program/set_active_program
-- atomicity and RPC-level cross-user rejection.
begin;

select plan(12);

insert into auth.users (id, email)
values
  ('70000000-0000-0000-0000-000000000001', 'prog-rls-owner@example.test'),
  ('80000000-0000-0000-0000-000000000002', 'prog-rls-other@example.test');

insert into public.program (id, user_id, name)
values
  ('70000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000001', 'Owner Program'),
  ('80000000-0000-0000-0000-000000000022', '80000000-0000-0000-0000-000000000002', 'Other Program');

insert into public.program_day (id, user_id, program_id, position, name)
values
  ('70000000-0000-0000-0000-000000000111', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000011', 1, 'Owner Day'),
  ('80000000-0000-0000-0000-000000000222', '80000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000022', 1, 'Other Day');

insert into public.program_slot (id, user_id, program_day_id, position, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir)
values
  ('70000000-0000-0000-0000-000000001111', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000111', 1, 'bb-squat', 'squat', 3, 5, 8, 2),
  ('80000000-0000-0000-0000-000000002222', '80000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000222', 1, 'bb-bench', 'horizontal_press', 3, 5, 8, 2);

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.program),
  1,
  'a user can read only their own programs'
);

select is(
  (select count(*)::int from public.program_day),
  1,
  'a user can read only their own program days'
);

select is(
  (select count(*)::int from public.program_slot),
  1,
  'a user can read only their own program slots'
);

select throws_ok(
  $$insert into public.program (user_id, name) values ('80000000-0000-0000-0000-000000000002', 'Cross-user program')$$,
  '42501',
  null,
  'a user cannot insert a program for another user'
);

select throws_ok(
  $$insert into public.program_day (user_id, program_id, position, name) values ('80000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000022', 2, 'Cross-user day')$$,
  '42501',
  null,
  'a user cannot insert a program day for another user'
);

select throws_ok(
  $$insert into public.program_slot (user_id, program_day_id, position, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir) values ('80000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000222', 2, 'bb-deadlift', 'hinge', 3, 5, 8, 2)$$,
  '42501',
  null,
  'a user cannot insert a program slot for another user'
);

-- RLS hides the other user's rows, so these must match zero rows. The assertions below
-- run without RLS to confirm the target rows were genuinely left untouched.
update public.program set name = 'Hijacked' where id = '80000000-0000-0000-0000-000000000022';
delete from public.program where id = '80000000-0000-0000-0000-000000000022';

update public.program_day set name = 'Hijacked' where id = '80000000-0000-0000-0000-000000000222';
delete from public.program_day where id = '80000000-0000-0000-0000-000000000222';

update public.program_slot set target_sets = 99 where id = '80000000-0000-0000-0000-000000002222';
delete from public.program_slot where id = '80000000-0000-0000-0000-000000002222';

reset role;

select is(
  (select count(*)::int from public.program where id = '80000000-0000-0000-0000-000000000022'),
  1,
  'a user cannot delete another user program'
);

select is(
  (select name from public.program where id = '80000000-0000-0000-0000-000000000022'),
  'Other Program',
  'a user cannot update another user program'
);

select is(
  (select count(*)::int from public.program_day where id = '80000000-0000-0000-0000-000000000222'),
  1,
  'a user cannot delete another user program day'
);

select is(
  (select name from public.program_day where id = '80000000-0000-0000-0000-000000000222'),
  'Other Day',
  'a user cannot update another user program day'
);

select is(
  (select count(*)::int from public.program_slot where id = '80000000-0000-0000-0000-000000002222'),
  1,
  'a user cannot delete another user program slot'
);

select is(
  (select target_sets from public.program_slot where id = '80000000-0000-0000-0000-000000002222'),
  3,
  'a user cannot update another user program slot'
);

select * from finish();
rollback;
