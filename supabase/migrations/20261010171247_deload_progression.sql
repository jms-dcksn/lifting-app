-- Deload classification is a historical fact, independent of later program edits.
alter table public.program_phase add column is_deload boolean not null default false;
alter table public.workout_session add column is_deload boolean not null default false;
alter table public.set_log add column is_deload boolean not null default false;

-- Only unambiguous legacy phases. Other reduced-volume/custom phases need review.
update public.program_phase set is_deload = true
where lower(trim(name)) = 'deload'
   or (lower(trim(name)) in ('recovery', 'recover & review')
       and set_multiplier = 0.5 and target_rir_min = 4 and target_rir_max = 4);

update public.workout_session s set is_deload = coalesce((
  select ph.is_deload from public.program_phase ph
  join public.program p on p.id = ph.program_id and p.user_id = ph.user_id
  where ph.program_id = s.program_id and ph.user_id = s.user_id and p.style = 'classic'
    and s.week_index between ph.week_start and ph.week_end
  order by ph.position limit 1
), false);
update public.set_log l set is_deload = s.is_deload
from public.workout_session s where l.session_id = s.id and l.user_id = s.user_id;

-- Rebuild affected demonstrated strength from saved estimates, preserving historical BW.
-- Invalidate calibration for affected exercises so the next eligible write can re-anchor it.
with affected as (
  select distinct user_id, exercise_id from public.set_log where is_deload
), rebuilt as (
  select a.user_id, a.exercise_id, max(l.e1rm) filter (where l.e1rm > 0) as e1rm,
    count(distinct l.session_id) filter (where l.e1rm > 0)::int as confidence
  from affected a left join public.set_log l
    on l.user_id = a.user_id and l.exercise_id = a.exercise_id
    and not l.is_warmup and not l.is_deload
  group by a.user_id, a.exercise_id
)
update public.user_exercise_stat st
set current_e1rm = r.e1rm, coeff_confidence_n = r.confidence,
    personal_coefficient = null, last_updated = now()
from rebuilt r where st.user_id = r.user_id and st.exercise_id = r.exercise_id;

create function public.snapshot_session_deload()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    new.is_deload := old.is_deload;
    return new;
  end if;
  new.is_deload := coalesce((
    select ph.is_deload from public.program_phase ph
    join public.program p on p.id = ph.program_id and p.user_id = ph.user_id
    where ph.program_id = new.program_id and ph.user_id = new.user_id and p.style = 'classic'
      and new.week_index between ph.week_start and ph.week_end
    order by ph.position limit 1
  ), false);
  return new;
end;
$$;
revoke all on function public.snapshot_session_deload() from public, anon, authenticated;
create trigger snapshot_session_deload before insert or update on public.workout_session
for each row execute function public.snapshot_session_deload();

create function public.inherit_set_deload()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  select s.is_deload into new.is_deload from public.workout_session s
  where s.id = new.session_id and s.user_id = new.user_id;
  if not found then
    raise exception 'Session not found' using errcode = '42501';
  end if;
  if new.is_deload then new.is_calibration := false; end if;
  return new;
end;
$$;
revoke all on function public.inherit_set_deload() from public, anon, authenticated;
create trigger inherit_set_deload before insert or update on public.set_log
for each row execute function public.inherit_set_deload();

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
    coalesce(array(select jsonb_array_elements_text(coalesce(p_tree->'tags', '[]'::jsonb))), '{}'::text[]),
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
        week_start, week_end, target_rir_min, target_rir_max, set_multiplier, is_deload
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
        (v_phase->>'setMultiplier')::numeric,
        coalesce((v_phase->>'isDeload')::boolean, false)
      )
      on conflict (id) do update set
        position = excluded.position,
        name = excluded.name,
        description = excluded.description,
        week_start = excluded.week_start,
        week_end = excluded.week_end,
        target_rir_min = excluded.target_rir_min,
        target_rir_max = excluded.target_rir_max,
        set_multiplier = excluded.set_multiplier,
        is_deload = excluded.is_deload;
      
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
  'Atomically save a complete program tree (insert/upsert/clone/template). '
  'Preserves program_slot_id continuity across edits. Input JSONB must include id, days array '
  'with nested slots, and optional phases array. Returns program UUID.';

