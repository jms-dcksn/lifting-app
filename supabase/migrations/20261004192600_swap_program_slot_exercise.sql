-- Program-scope exercise swap without an open session (planner path).
-- Mirrors the program branch of swap_session_exercise; never touches workout_session or set_log.
create function public.swap_program_slot_exercise(
  p_slot_id uuid, p_exercise_id text, p_pattern text
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_slot public.program_slot%rowtype;
  v_style text;
begin
  if v_user is null then raise exception 'Sign in to swap exercises'; end if;
  if p_exercise_id is null or length(trim(p_exercise_id)) = 0 or p_pattern is null then
    raise exception 'Invalid exercise';
  end if;
  select * into v_slot from public.program_slot
    where id = p_slot_id and user_id = v_user for update;
  if not found then raise exception 'Exercise slot not found'; end if;
  select p.style into v_style from public.program p
    join public.program_day d on d.program_id = p.id
    where d.id = v_slot.program_day_id and d.user_id = v_user and p.user_id = v_user;
  if not found then raise exception 'Program not found'; end if;

  update public.program_slot set exercise_id = p_exercise_id, pattern = p_pattern
    where id = p_slot_id and user_id = v_user;
  if v_style = 'fluid' then
    insert into public.movement_adaptation
      (user_id, program_slot_id, exercise_id, action, new_exercise_id, ladder_step)
    values (v_user, p_slot_id, v_slot.exercise_id, 'manual_swap', p_exercise_id, 0);
  end if;
end;
$$;
revoke all on function public.swap_program_slot_exercise(uuid, text, text) from public, anon;
grant execute on function public.swap_program_slot_exercise(uuid, text, text) to authenticated;
