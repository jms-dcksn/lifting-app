begin;

select plan(7);

insert into auth.users (id, email)
values
  ('30000000-0000-0000-0000-000000000001', 'tape-owner@example.test'),
  ('40000000-0000-0000-0000-000000000002', 'tape-other@example.test');

insert into public.body_measurement_log (id, user_id, logged_on, site, inches)
values
  ('30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000001', current_date - 1, 'waist', 28.5),
  ('40000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000002', current_date - 1, 'waist', 32.0);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.body_measurement_log),
  1,
  'a user can read only their own measurements'
);

update public.body_measurement_log
set inches = 28.0
where id = '30000000-0000-0000-0000-000000000011';

select is(
  (select inches from public.body_measurement_log where id = '30000000-0000-0000-0000-000000000011'),
  28.0::numeric,
  'a user can update their own measurement'
);

select throws_ok(
  $$insert into public.body_measurement_log (user_id, logged_on, site, inches) values ('40000000-0000-0000-0000-000000000002', current_date, 'waist', 31)$$,
  '42501',
  null,
  'a user cannot insert a measurement for another user'
);

insert into public.body_measurement_log (user_id, logged_on, site, inches)
values
  ('30000000-0000-0000-0000-000000000001', current_date, 'waist', 28.5),
  ('30000000-0000-0000-0000-000000000001', current_date, 'neck', 13.0);

select is(
  (select count(*)::int from public.body_measurement_log where logged_on = current_date),
  2,
  'the same date can store two sites'
);

select throws_ok(
  $$insert into public.body_measurement_log (user_id, logged_on, site, inches) values ('30000000-0000-0000-0000-000000000001', current_date - 1, 'waist', 27)$$,
  '23505',
  null,
  'duplicate site and date are rejected by the database'
);

select throws_ok(
  $$insert into public.body_measurement_log (user_id, logged_on, site, inches) values ('30000000-0000-0000-0000-000000000001', current_date, 'arm', 0)$$,
  '23514',
  null,
  'invalid inches are rejected'
);

select throws_ok(
  $$insert into public.body_measurement_log (user_id, logged_on, site, inches) values ('30000000-0000-0000-0000-000000000001', current_date + 1, 'chest', 36)$$,
  '23514',
  null,
  'future measurements are rejected'
);

select * from finish();
rollback;
