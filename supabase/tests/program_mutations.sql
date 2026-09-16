-- Run as postgres. All fixtures and writes roll back; no existing user data is touched.
begin;
insert into auth.users (id, email) values
  ('a3000000-0000-0000-0000-000000000001', 'program-mutations-owner@example.test'),
  ('a3000000-0000-0000-0000-000000000002', 'program-mutations-other@example.test');

-- Inject a failure trigger to test transaction rollback.
create function pg_temp.fail_program_test() returns trigger language plpgsql as $$
begin raise exception 'injected failure'; end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  u uuid := auth.uid();
  p1 uuid := 'a3000000-0000-0000-0000-000000000011';
  p2 uuid := 'a3000000-0000-0000-0000-000000000012';
  d1 uuid := 'a3000000-0000-0000-0000-000000000021';
  d2 uuid := 'a3000000-0000-0000-0000-000000000022';
  s1 uuid := 'a3000000-0000-0000-0000-000000000031';
  s2 uuid := 'a3000000-0000-0000-0000-000000000032';
  ph1 uuid := 'a3000000-0000-0000-0000-000000000041';
  tree jsonb;
  result uuid;
  rejected boolean;
begin
  assert not has_function_privilege('anon', 'public.save_program(jsonb)', 'EXECUTE'), 'anonymous save_program denied';
  assert not has_function_privilege('anon', 'public.set_active_program(uuid)', 'EXECUTE'), 'anonymous set_active_program denied';

  -- Save a complete program tree.
  tree := jsonb_build_object(
    'id', p1,
    'name', 'Test Program',
    'description', 'Test description',
    'tags', jsonb_build_array('test'),
    'weeks', 8,
    'style', 'classic',
    'isActive', true,
    'phases', jsonb_build_array(
      jsonb_build_object(
        'id', ph1,
        'name', 'Phase 1',
        'description', 'Test phase',
        'weekStart', 1,
        'weekEnd', 4,
        'targetRirMin', 2,
        'targetRirMax', 3,
        'setMultiplier', null
      )
    ),
    'days', jsonb_build_array(
      jsonb_build_object(
        'id', d1,
        'name', 'Day 1',
        'slots', jsonb_build_array(
          jsonb_build_object(
            'id', s1,
            'exerciseId', 'bb-bench',
            'pattern', 'horizontal_press',
            'targetSets', 3,
            'repMin', 8,
            'repMax', 12,
            'targetRir', 2,
            'restSeconds', 120,
            'plateauPatience', null
          ),
          jsonb_build_object(
            'id', s2,
            'exerciseId', 'bb-squat',
            'pattern', 'squat',
            'targetSets', 3,
            'repMin', 6,
            'repMax', 10,
            'targetRir', 2,
            'restSeconds', 180,
            'plateauPatience', null
          )
        )
      ),
      jsonb_build_object(
        'id', d2,
        'name', 'Day 2',
        'slots', jsonb_build_array()
      )
    )
  );
  result := public.save_program(tree);
  assert result = p1, 'save_program returns program UUID';
  assert (select count(*) from public.program where id = p1 and user_id = u and is_active = true) = 1, 'program created and active';
  assert (select count(*) from public.program_phase where program_id = p1) = 1, 'phase created';
  assert (select count(*) from public.program_day where program_id = p1) = 2, 'days created';
  assert (select count(*) from public.program_slot where program_day_id = d1) = 2, 'slots created in day 1';
  assert (select count(*) from public.program_slot where program_day_id = d2) = 0, 'empty day has no slots';

  -- Update: remove one slot, add a new day.
  tree := jsonb_build_object(
    'id', p1,
    'name', 'Test Program Updated',
    'description', null,
    'tags', jsonb_build_array('test', 'updated'),
    'weeks', 10,
    'style', 'classic',
    'isActive', true,
    'phases', jsonb_build_array(),
    'days', jsonb_build_array(
      jsonb_build_object(
        'id', d1,
        'name', 'Day 1 Updated',
        'slots', jsonb_build_array(
          jsonb_build_object(
            'id', s1,
            'exerciseId', 'db-bench',
            'pattern', 'horizontal_press',
            'targetSets', 4,
            'repMin', 6,
            'repMax', 8,
            'targetRir', 1,
            'restSeconds', 90,
            'plateauPatience', 3
          )
        )
      ),
      jsonb_build_object(
        'id', 'a3000000-0000-0000-0000-000000000023',
        'name', 'Day 3',
        'slots', jsonb_build_array()
      )
    )
  );
  result := public.save_program(tree);
  assert (select name from public.program where id = p1) = 'Test Program Updated', 'program updated';
  assert (select weeks from public.program where id = p1) = 10, 'weeks updated';
  assert (select count(*) from public.program_phase where program_id = p1) = 0, 'phases deleted';
  assert (select count(*) from public.program_day where program_id = p1) = 2, 'day count updated';
  assert not exists (select 1 from public.program_day where id = d2), 'removed day deleted';
  assert (select count(*) from public.program_slot where program_day_id = d1) = 1, 'slot removed from day 1';
  assert (select exercise_id from public.program_slot where id = s1) = 'db-bench', 'remaining slot updated';
  assert not exists (select 1 from public.program_slot where id = s2), 'removed slot deleted';

  -- Atomicity: inject failure after program upsert, verify rollback.
  create trigger program_test_failure before update on public.program_slot
  for each row when (new.exercise_id = 'rollback-test')
  execute function pg_temp.fail_program_test();
  
  tree := jsonb_build_object(
    'id', p1,
    'name', 'Should not save',
    'description', null,
    'tags', jsonb_build_array(),
    'weeks', 12,
    'style', 'classic',
    'isActive', true,
    'phases', jsonb_build_array(),
    'days', jsonb_build_array(
      jsonb_build_object(
        'id', d1,
        'name', 'Day 1',
        'slots', jsonb_build_array(
          jsonb_build_object(
            'id', s1,
            'exerciseId', 'rollback-test',
            'pattern', 'horizontal_press',
            'targetSets', 3,
            'repMin', 8,
            'repMax', 12,
            'targetRir', 2,
            'restSeconds', 120,
            'plateauPatience', null
          )
        )
      )
    )
  );
  rejected := false;
  begin
    result := public.save_program(tree);
    raise exception 'injected failure did not run';
  exception when raise_exception then
    if sqlerrm <> 'injected failure' then raise; end if;
    rejected := true;
  end;
  assert rejected, 'failed save raised exception';
  assert (select name from public.program where id = p1) = 'Test Program Updated', 'failed save did not update program';
  assert (select exercise_id from public.program_slot where id = s1) = 'db-bench', 'failed save did not update slot';
  
  drop trigger program_test_failure on public.program_slot;

  -- Single-active-program invariant: creating second program deactivates first.
  tree := jsonb_build_object(
    'id', p2,
    'name', 'Second Program',
    'description', null,
    'tags', jsonb_build_array(),
    'weeks', 6,
    'style', 'fluid',
    'isActive', true,
    'phases', jsonb_build_array(),
    'days', jsonb_build_array(
      jsonb_build_object(
        'id', 'a3000000-0000-0000-0000-000000000024',
        'name', 'Day 1',
        'slots', jsonb_build_array()
      )
    )
  );
  result := public.save_program(tree);
  assert (select count(*) from public.program where user_id = u and is_active = true) = 1, 'only one active program';
  assert (select is_active from public.program where id = p1) = false, 'first program deactivated';
  assert (select is_active from public.program where id = p2) = true, 'second program active';

  -- set_active_program atomicity.
  perform public.set_active_program(p1);
  assert (select count(*) from public.program where user_id = u and is_active = true) = 1, 'single active after set_active_program';
  assert (select is_active from public.program where id = p1) = true, 'first program reactivated';
  assert (select is_active from public.program where id = p2) = false, 'second program deactivated';

  -- Cross-user rejection.
  rejected := false;
  begin
    perform public.set_active_program('a3000000-0000-0000-0000-000000000099');
    raise exception 'cross-user activation accepted';
  exception when no_data_found then rejected := true; end;
  assert rejected, 'cross-user set_active_program rejected';

  perform set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000002', true);
  rejected := false;
  begin
    result := public.save_program(tree);
    raise exception 'cross-user save accepted';
  exception when others then rejected := true; end;
  assert rejected, 'cross-user save_program rejected';

  -- Empty days validation.
  perform set_config('request.jwt.claim.sub', 'a3000000-0000-0000-0000-000000000001', true);
  tree := jsonb_build_object(
    'id', 'a3000000-0000-0000-0000-000000000013',
    'name', 'Empty Program',
    'description', null,
    'tags', jsonb_build_array(),
    'weeks', 8,
    'style', 'classic',
    'isActive', false,
    'phases', jsonb_build_array(),
    'days', jsonb_build_array()
  );
  rejected := false;
  begin
    result := public.save_program(tree);
    raise exception 'empty days accepted';
  exception when others then rejected := true; end;
  assert rejected, 'empty days rejected';

  -- Slot continuity: program_slot_id remains stable across edits.
  assert (select id from public.program_slot where program_day_id = d1) = s1, 'slot id preserved across updates';
end;
$$;

reset role;
select 'PASS: program atomicity, single-active invariant, slot continuity, cross-user rejection, rollback' as result;
rollback;
