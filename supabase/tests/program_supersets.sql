-- Run as postgres; synthetic fixtures and all writes roll back.
begin;
insert into auth.users (id, email) values
  ('a3400000-0000-0000-0000-000000000001', 'superset-owner@example.test'),
  ('a3400000-0000-0000-0000-000000000002', 'superset-other@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3400000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  fixture_program_id uuid := gen_random_uuid();
  day_id uuid := gen_random_uuid();
  first_slot uuid := gen_random_uuid();
  second_slot uuid := gen_random_uuid();
  tree jsonb;
  invalid_tree jsonb;
begin
  assert not has_function_privilege('anon', 'public.save_program(jsonb)', 'EXECUTE');
  tree := jsonb_build_object(
    'id', fixture_program_id, 'name', 'Superset fixture', 'weeks', 6, 'style', 'classic',
    'isActive', false, 'phases', jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'name', 'Deload', 'weekStart', 6, 'weekEnd', 6,
      'targetRirMin', 4, 'targetRirMax', 4, 'setMultiplier', 0.5, 'isDeload', true
    )),
    'days', jsonb_build_array(jsonb_build_object(
      'id', day_id, 'name', 'Lower', 'slots', jsonb_build_array(
        jsonb_build_object('id', first_slot, 'exerciseId', 'straight-leg-machine-adductor',
          'pattern', 'hip_adduction', 'targetSets', 2, 'repMin', 6, 'repMax', 12,
          'targetRir', 1, 'supersetGroup', 'C'),
        jsonb_build_object('id', second_slot, 'exerciseId', 'good-boy-external-rotation',
          'pattern', 'hip_thrust', 'targetSets', 2, 'repMin', 8, 'repMax', 15,
          'targetRir', 1, 'supersetGroup', 'C')
      )
    ))
  );
  perform public.save_program(tree);
  assert (select count(*) from public.program_slot where program_day_id = day_id and superset_group = 'C') = 2;
  assert (select is_deload from public.program_phase where program_id = fixture_program_id) = true;

  -- An orphan must roll the entire save back, including metadata changes.
  invalid_tree := jsonb_set(tree, '{name}', '"Should not persist"');
  invalid_tree := jsonb_set(invalid_tree, '{days,0,slots,1,supersetGroup}', 'null');
  begin
    perform public.save_program(invalid_tree);
    raise exception 'Orphan superset accepted';
  exception when invalid_parameter_value then null;
  end;
  assert (select name from public.program where id = fixture_program_id) = 'Superset fixture';
  assert (select count(*) from public.program_slot where program_day_id = day_id and superset_group = 'C') = 2;

  -- The same label cannot span an unrelated exercise, and labels are bounded tokens.
  invalid_tree := jsonb_insert(tree, '{days,0,slots,1}', jsonb_build_object(
    'id', gen_random_uuid(), 'exerciseId', 'hack-squat', 'pattern', 'squat',
    'targetSets', 2, 'repMin', 5, 'repMax', 8, 'targetRir', 1
  ));
  begin
    perform public.save_program(invalid_tree);
    raise exception 'Separated superset accepted';
  exception when invalid_parameter_value then null;
  end;
  invalid_tree := jsonb_set(tree, '{days,0,slots,0,supersetGroup}', '"bad name"');
  invalid_tree := jsonb_set(invalid_tree, '{days,0,slots,1,supersetGroup}', '"bad name"');
  begin
    perform public.save_program(invalid_tree);
    raise exception 'Invalid superset label accepted';
  exception when check_violation then null;
  end;

  -- Existing clients and cleared groups keep the same slot ids and straight-set defaults.
  tree := jsonb_set(tree, '{days,0,slots,0,supersetGroup}', 'null');
  tree := jsonb_set(tree, '{days,0,slots,1,supersetGroup}', 'null');
  perform public.save_program(tree);
  assert (select superset_group from public.program_slot where id = first_slot) is null;
  assert (select count(*) from public.program_slot where id in (first_slot, second_slot)) = 2;
end;
$$;

-- Another owner cannot read or alter the first owner's group metadata.
select set_config('request.jwt.claim.sub', 'a3400000-0000-0000-0000-000000000002', true);
do $$
declare changed int;
begin
  assert (select count(*) from public.program_slot where user_id = 'a3400000-0000-0000-0000-000000000001') = 0;
  update public.program_slot set superset_group = 'Z' where user_id = 'a3400000-0000-0000-0000-000000000001';
  get diagnostics changed = row_count;
  assert changed = 0;
end;
$$;
rollback;
