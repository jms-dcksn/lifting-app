-- Atomic program mutations: unified save RPC for insert/upsert/clone/template operations.
-- All multi-statement program writes now execute in a single transaction to prevent partial
-- state and maintain the single-active-program invariant.

-- Save a complete program tree atomically. Handles insert, upsert, clone, and template application.
-- Input is a JSONB payload with program metadata, phases array, and days array (with nested slots).
-- Activates/deactivates atomically, upserts all phases/days/slots, deletes missing. Preserves
-- program_slot_id continuity across edits (critical for set_log FKs). Returns program UUID.
create or replace function public.save_program(p_tree jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_program_id uuid;
  v_is_active boolean;
  v_phase jsonb;
  v_day jsonb;
  v_slot jsonb;
  v_phase_ids uuid[];
  v_day_ids uuid[];
  v_slot_ids uuid[];
  v_position int;
begin
  if v_user is null then
    raise exception 'Sign in to save a program.' using errcode = '42501';
  end if;
  if p_tree is null or jsonb_typeof(p_tree) != 'object' then
    raise exception 'Invalid program structure.' using errcode = '22023';
  end if;
  if not (p_tree ? 'id' and p_tree ? 'days') then
    raise exception 'Program must have id and days.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_tree->'days') = 0 then
    raise exception 'A program needs at least one day.' using errcode = '22000';
  end if;

  v_program_id := (p_tree->>'id')::uuid;
  v_is_active := coalesce((p_tree->>'isActive')::boolean, false);

  -- Atomic activation: set is_active = (id = v_program_id) for all user programs.
  -- This prevents any intermediate state where zero or two programs are active.
  if v_is_active then
    update public.program set is_active = (id = v_program_id)
      where user_id = v_user;
  end if;

  -- Upsert program metadata.
  insert into public.program (
    id, user_id, name, description, tags, weeks, style, is_active
  ) values (
    v_program_id,
    v_user,
    coalesce(trim(p_tree->>'name'), 'My Program'),
    nullif(trim(p_tree->>'description'), ''),
    coalesce((p_tree->'tags')::text[], '{}'),
    least(12, greatest(4, (p_tree->>'weeks')::int)),
    coalesce(p_tree->>'style', 'classic'),
    v_is_active
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    tags = excluded.tags,
    weeks = excluded.weeks,
    style = excluded.style,
    is_active = excluded.is_active;

  -- Upsert phases (classic programs only).
  v_phase_ids := array[]::uuid[];
  if p_tree ? 'phases' and jsonb_typeof(p_tree->'phases') = 'array' then
    v_position := 0;
    for v_phase in select jsonb_array_elements(p_tree->'phases')
    loop
      insert into public.program_phase (
        id, user_id, program_id, position, name, description,
        week_start, week_end, target_rir_min, target_rir_max, set_multiplier
      ) values (
        (v_phase->>'id')::uuid,
        v_user,
        v_program_id,
        v_position,
        coalesce(nullif(trim(v_phase->>'name'), ''), 'Phase ' || (v_position + 1)),
        nullif(trim(v_phase->>'description'), ''),
        (v_phase->>'weekStart')::int,
        (v_phase->>'weekEnd')::int,
        (v_phase->>'targetRirMin')::numeric,
        (v_phase->>'targetRirMax')::numeric,
        (v_phase->>'setMultiplier')::numeric
      )
      on conflict (id) do update set
        position = excluded.position,
        name = excluded.name,
        description = excluded.description,
        week_start = excluded.week_start,
        week_end = excluded.week_end,
        target_rir_min = excluded.target_rir_min,
        target_rir_max = excluded.target_rir_max,
        set_multiplier = excluded.set_multiplier;
      
      v_phase_ids := array_append(v_phase_ids, (v_phase->>'id')::uuid);
      v_position := v_position + 1;
    end loop;
  end if;

  -- Delete phases not in the input (upsert-then-delete-missing pattern).
  delete from public.program_phase
    where program_id = v_program_id and user_id = v_user
      and (cardinality(v_phase_ids) = 0 or id != all(v_phase_ids));

  -- Upsert days.
  v_day_ids := array[]::uuid[];
  v_position := 0;
  for v_day in select jsonb_array_elements(p_tree->'days')
  loop
    insert into public.program_day (
      id, user_id, program_id, position, name
    ) values (
      (v_day->>'id')::uuid,
      v_user,
      v_program_id,
      v_position,
      coalesce(nullif(trim(v_day->>'name'), ''), 'Day ' || (v_position + 1))
    )
    on conflict (id) do update set
      position = excluded.position,
      name = excluded.name;
    
    v_day_ids := array_append(v_day_ids, (v_day->>'id')::uuid);
    v_position := v_position + 1;
  end loop;

  -- Delete days not in the input (cascades to slots).
  delete from public.program_day
    where program_id = v_program_id and user_id = v_user
      and id != all(v_day_ids);

  -- Upsert slots within each day.
  for v_day in select jsonb_array_elements(p_tree->'days')
  loop
    v_slot_ids := array[]::uuid[];
    v_position := 0;
    if v_day ? 'slots' and jsonb_typeof(v_day->'slots') = 'array' then
      for v_slot in select jsonb_array_elements(v_day->'slots')
      loop
        insert into public.program_slot (
          id, user_id, program_day_id, position, exercise_id, pattern,
          target_sets, rep_min, rep_max, target_rir, rest_seconds, plateau_patience
        ) values (
          (v_slot->>'id')::uuid,
          v_user,
          (v_day->>'id')::uuid,
          v_position,
          v_slot->>'exerciseId',
          v_slot->>'pattern',
          (v_slot->>'targetSets')::int,
          (v_slot->>'repMin')::int,
          (v_slot->>'repMax')::int,
          (v_slot->>'targetRir')::numeric,
          (v_slot->>'restSeconds')::int,
          (v_slot->>'plateauPatience')::int
        )
        on conflict (id) do update set
          program_day_id = excluded.program_day_id,
          position = excluded.position,
          exercise_id = excluded.exercise_id,
          pattern = excluded.pattern,
          target_sets = excluded.target_sets,
          rep_min = excluded.rep_min,
          rep_max = excluded.rep_max,
          target_rir = excluded.target_rir,
          rest_seconds = excluded.rest_seconds,
          plateau_patience = excluded.plateau_patience;
        
        v_slot_ids := array_append(v_slot_ids, (v_slot->>'id')::uuid);
        v_position := v_position + 1;
      end loop;
    end if;

    -- Delete slots not in the input within this day.
    delete from public.program_slot
      where program_day_id = (v_day->>'id')::uuid and user_id = v_user
        and (cardinality(v_slot_ids) = 0 or id != all(v_slot_ids));
  end loop;

  return v_program_id;
end;
$$;

revoke all on function public.save_program(jsonb) from public, anon;
grant execute on function public.save_program(jsonb) to authenticated;

comment on function public.save_program(jsonb) is
  'Atomically save a complete program tree (insert/upsert/clone/template). ' ||
  'Preserves program_slot_id continuity across edits. Input JSONB must include id, days array ' ||
  'with nested slots, and optional phases array. Returns program UUID.';

-- Atomically set the active program for the current user. Single statement ensures no
-- intermediate state where zero or two programs are active.
create or replace function public.set_active_program(p_program_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to set active program.' using errcode = '42501';
  end if;
  if p_program_id is null then
    raise exception 'Program ID is required.' using errcode = '22023';
  end if;

  -- Verify ownership before attempting activation.
  perform 1 from public.program where id = p_program_id and user_id = v_user;
  if not found then
    raise exception 'Program not found.' using errcode = 'P0002';
  end if;

  -- Atomic activation: single UPDATE statement, no race condition.
  update public.program set is_active = (id = p_program_id)
    where user_id = v_user;
end;
$$;

revoke all on function public.set_active_program(uuid) from public, anon;
grant execute on function public.set_active_program(uuid) to authenticated;

comment on function public.set_active_program(uuid) is
  'Atomically activate one program and deactivate all others for the current user. ' ||
  'Ensures single-active-program invariant with no intermediate state.';
