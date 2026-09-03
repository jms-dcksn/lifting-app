begin;

select plan(4);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'feedback-owner@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'feedback-other@example.test');

insert into public.workout_session (id, user_id, readiness, joint_pain, notes)
values
  ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 4, 'mild', 'Left elbow felt tight.'),
  ('20000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000002', 5, 'none', null);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.workout_session),
  1,
  'a user can read only their own session feedback'
);

update public.workout_session
set joint_pain = 'none', notes = 'Updated note.'
where id = '10000000-0000-0000-0000-000000000011';

select is(
  (select notes from public.workout_session where id = '10000000-0000-0000-0000-000000000011'),
  'Updated note.',
  'a user can update their own session feedback'
);

update public.workout_session
set notes = 'Should not update.'
where id = '20000000-0000-0000-0000-000000000022';

select is(
  (select count(*)::int from public.workout_session where notes = 'Should not update.'),
  0,
  'a user cannot update another user session'
);

select throws_ok(
  $$update public.workout_session set readiness = 6 where id = '10000000-0000-0000-0000-000000000011'$$,
  '23514',
  null,
  'database constraints reject invalid readiness'
);

select * from finish();
rollback;
