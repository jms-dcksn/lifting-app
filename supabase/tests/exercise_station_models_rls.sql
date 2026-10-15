begin;
select plan(12);

insert into auth.users (id, email) values
  ('71000000-0000-0000-0000-000000000001', 'station-owner@example.test'),
  ('71000000-0000-0000-0000-000000000002', 'station-other@example.test');

insert into public.exercise (id, user_id, name, pattern, equipment, brand, machine_type, base_exercise_id, station_model) values
  ('station-legacy', '71000000-0000-0000-0000-000000000001', 'Legacy press', 'horizontal_press', 'machine', 'Life Fitness', 'selectorized', 'machine-chest-press', null),
  ('station-standard', '71000000-0000-0000-0000-000000000001', 'Standard press', 'horizontal_press', 'machine', 'Life Fitness', 'selectorized', 'machine-chest-press', 'lf-insignia-chest'),
  ('station-dual', '71000000-0000-0000-0000-000000000001', 'Dual axis press', 'horizontal_press', 'machine', 'Life Fitness', 'selectorized', 'machine-chest-press', 'lf-insignia-dual-chest'),
  ('station-other-owner', '71000000-0000-0000-0000-000000000002', 'Other press', 'horizontal_press', 'machine', 'Life Fitness', 'selectorized', 'machine-chest-press', 'lf-insignia-chest');

select is((select count(*)::int from public.exercise where id like 'station-%'), 4,
  'legacy, two models, and the same model for another owner coexist');
select is((select station_model from public.exercise where id = 'station-legacy'), null::text,
  'legacy station keeps its original ID and unknown model');

select throws_ok($$insert into public.exercise (id, user_id, name, pattern, equipment, brand, machine_type, base_exercise_id, station_model)
  values ('station-duplicate', '71000000-0000-0000-0000-000000000001', 'Duplicate', 'horizontal_press', 'machine', 'Life Fitness', 'selectorized', 'machine-chest-press', 'lf-insignia-chest')$$,
  '23505', null, 'the same owner cannot duplicate the same model');
select throws_ok($$insert into public.exercise (id, user_id, name, pattern, equipment, brand, machine_type, base_exercise_id)
  values ('station-duplicate-legacy', '71000000-0000-0000-0000-000000000001', 'Duplicate', 'horizontal_press', 'machine', 'Life Fitness', 'selectorized', 'machine-chest-press')$$,
  '23505', null, 'unknown-model legacy stations still deduplicate');
select throws_ok($$update public.exercise set station_model = '  Not Normalized  ' where id = 'station-standard'$$,
  '23514', null, 'model normalization is enforced at the database boundary');
select throws_ok($$update public.exercise set station_model = '' where id = 'station-standard'$$,
  '23514', null, 'empty model is rejected; unknown uses null');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::int from public.exercise where id like 'station-%'), 3,
  'owner can read their legacy station and both models');
select is((select count(*)::int from public.exercise where id = 'station-other-owner'), 0,
  'models do not widen reads across owners');
select throws_ok($$insert into public.exercise (id, user_id, name, pattern, equipment, station_model)
  values ('station-forged', '71000000-0000-0000-0000-000000000002', 'Forged', 'horizontal_press', 'machine', 'custom')$$,
  '42501', null, 'owner cannot create a model for another owner');

update public.exercise set station_model = 'custom model' where id = 'station-dual';
select is((select station_model from public.exercise where id = 'station-dual'), 'custom model',
  'owner can update their own model');
with changed as (update public.exercise set station_model = 'forged' where id = 'station-other-owner' returning id)
select is((select count(*)::int from changed), 0, 'owner cannot change another owner model');
with removed as (delete from public.exercise where id = 'station-other-owner' returning id)
select is((select count(*)::int from removed), 0, 'owner cannot delete another owner model');

select * from finish();
rollback;
