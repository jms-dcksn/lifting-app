begin;

select plan(6);

insert into auth.users (id, email)
values
  ('30000000-0000-0000-0000-000000000001', 'weight-owner@example.test'),
  ('40000000-0000-0000-0000-000000000002', 'weight-other@example.test');

insert into public.bodyweight_log (id, user_id, logged_on, weight)
values
  ('30000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000001', current_date - 1, 185.5),
  ('40000000-0000-0000-0000-000000000022', '40000000-0000-0000-0000-000000000002', current_date - 1, 200);

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.bodyweight_log),
  1,
  'a user can read only their own weigh-ins'
);

update public.bodyweight_log
set weight = 184.8
where id = '30000000-0000-0000-0000-000000000011';

select is(
  (select weight from public.bodyweight_log where id = '30000000-0000-0000-0000-000000000011'),
  184.8::numeric,
  'a user can update their own weigh-in'
);

select throws_ok(
  $$insert into public.bodyweight_log (user_id, logged_on, weight) values ('40000000-0000-0000-0000-000000000002', current_date, 199)$$,
  '42501',
  null,
  'a user cannot insert a weigh-in for another user'
);

select throws_ok(
  $$insert into public.bodyweight_log (user_id, logged_on, weight) values ('30000000-0000-0000-0000-000000000001', current_date - 1, 183)$$,
  '23505',
  null,
  'duplicate dates are rejected by the database'
);

select throws_ok(
  $$insert into public.bodyweight_log (user_id, logged_on, weight) values ('30000000-0000-0000-0000-000000000001', current_date, 0)$$,
  '23514',
  null,
  'invalid bodyweights are rejected'
);

select throws_ok(
  $$insert into public.bodyweight_log (user_id, logged_on, weight) values ('30000000-0000-0000-0000-000000000001', current_date + 1, 184)$$,
  '23514',
  null,
  'future weigh-ins are rejected'
);

select * from finish();
rollback;
