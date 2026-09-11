-- Session-local choices are persisted independently of performance history.
alter table public.workout_session
  add column exercise_swaps jsonb not null default '{}'::jsonb
  check (jsonb_typeof(exercise_swaps) = 'object');

-- Both scopes save the session choice. Program scope also updates exactly one slot,
-- atomically, under the caller's RLS policies. Never rewrite set_log.
create function public.swap_session_exercise(
  p_session_id uuid, p_slot_id uuid, p_exercise_id text, p_pattern text, p_scope text
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_session public.workout_session%rowtype;
  v_slot public.program_slot%rowtype;
  v_style text;
begin
  if v_user is null then raise exception 'Sign in to swap exercises'; end if;
  if p_scope is null or p_scope not in ('workout', 'program') then
    raise exception 'Invalid swap scope';
  end if;
  if p_exercise_id is null or length(trim(p_exercise_id)) = 0 or p_pattern is null then
    raise exception 'Invalid exercise';
  end if;
  select * into v_session from public.workout_session
    where id = p_session_id and user_id = v_user for update;
  if not found or v_session.finished_at is not null then
    raise exception 'Workout not found or already finished';
  end if;
  select * into v_slot from public.program_slot
    where id = p_slot_id and user_id = v_user
      and program_day_id = v_session.program_day_id for update;
  if not found then raise exception 'Exercise slot does not belong to this workout'; end if;
  select p.style into v_style from public.program p
    join public.program_day d on d.program_id = p.id
    where d.id = v_slot.program_day_id and d.user_id = v_user
      and p.id = v_session.program_id and p.user_id = v_user;
  if not found then raise exception 'Program not found'; end if;

  update public.workout_session
    set exercise_swaps = jsonb_set(exercise_swaps, array[p_slot_id::text], to_jsonb(p_exercise_id))
    where id = p_session_id and user_id = v_user;
  if p_scope = 'program' then
    update public.program_slot set exercise_id = p_exercise_id, pattern = p_pattern
      where id = p_slot_id and user_id = v_user;
    if v_style = 'fluid' then
      insert into public.movement_adaptation
        (user_id, program_slot_id, exercise_id, action, new_exercise_id, ladder_step)
      values (v_user, p_slot_id, v_slot.exercise_id, 'manual_swap', p_exercise_id, 0);
    end if;
  end if;
end;
$$;
revoke all on function public.swap_session_exercise(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.swap_session_exercise(uuid, uuid, text, text, text) to authenticated;
