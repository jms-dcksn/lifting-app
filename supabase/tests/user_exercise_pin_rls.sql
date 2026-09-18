begin;

select plan(4);

insert into auth.users (id, email)
values
  ('50000000-0000-0000-0000-000000000001', 'pin-owner@example.test'),
  ('60000000-0000-0000-0000-000000000002', 'pin-other@example.test');

insert into public.user_exercise_pin (user_id, exercise_id, position)
values
  ('50000000-0000-0000-0000-000000000001', 'bb-hip-thrust', 1),
  ('60000000-0000-0000-0000-000000000002', 'bb-bench', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.user_exercise_pin),
  1,
  'a user can read only their own pins'
);

update public.user_exercise_pin
set position = 2
where user_id = '50000000-0000-0000-0000-000000000001'
  and exercise_id = 'bb-hip-thrust';

select is(
  (select position from public.user_exercise_pin
    where user_id = '50000000-0000-0000-0000-000000000001'
      and exercise_id = 'bb-hip-thrust'),
  2,
  'a user can update their own pin'
);

select throws_ok(
  $$insert into public.user_exercise_pin (user_id, exercise_id, position)
    values ('60000000-0000-0000-0000-000000000002', 'bb-hip-thrust', 1)$$,
  '42501',
  null,
  'a user cannot insert a pin for another user'
);

delete from public.user_exercise_pin
where user_id = '50000000-0000-0000-0000-000000000001'
  and exercise_id = 'bb-hip-thrust';

select is(
  (select count(*)::int from public.user_exercise_pin
    where user_id = '50000000-0000-0000-0000-000000000001'),
  0,
  'a user can delete their own pin'
);

select * from finish();
rollback;
