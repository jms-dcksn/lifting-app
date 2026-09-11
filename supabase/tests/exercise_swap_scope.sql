-- Run as postgres. All fixtures and writes roll back; no existing user data is touched.
begin;
insert into auth.users (id, email) values
  ('f1111111-1111-4111-8111-111111111111', 'swap-regression@example.invalid'),
  ('f2222222-2222-4222-8222-222222222222', 'swap-other@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1111111-1111-4111-8111-111111111111', true);
do $$
declare
  u uuid := auth.uid();
  p uuid; d uuid; other_day uuid; s uuid; other_slot uuid; w uuid; future_w uuid;
  rejected boolean;
begin
  insert into public.program (user_id, name, weeks, style) values (u, 'Swap regression', 12, 'classic') returning id into p;
  insert into public.program_day (user_id, program_id, name, position) values (u,p,'Upper',0) returning id into d;
  insert into public.program_day (user_id, program_id, name, position) values (u,p,'Other day',1) returning id into other_day;
  insert into public.program_slot (user_id, program_day_id, position, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir)
    values (u,d,0,'bb-bench','horizontal_press',2,6,8,1) returning id into s;
  insert into public.program_slot (user_id, program_day_id, position, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir)
    values (u,other_day,0,'bb-bench','horizontal_press',2,6,8,1) returning id into other_slot;
  insert into public.workout_session (user_id, program_id, program_day_id, week_index) values (u,p,d,1) returning id into w;
  perform public.swap_session_exercise(w,s,'db-bench','horizontal_press','workout');
  assert (select exercise_swaps->>s::text = 'db-bench' from public.workout_session where id=w), 'Workout choice must persist before any sets';
  assert (select exercise_id='bb-bench' from public.program_slot where id=s), 'Workout-only must not change program';
  insert into public.set_log (user_id,session_id,program_slot_id,exercise_id,set_index,weight,reps,rir)
    values (u,w,s,'bb-bench',0,100,8,1);
  perform public.swap_session_exercise(w,s,'db-incline','incline_press','program');
  assert (select exercise_id='db-incline' and pattern='incline_press' and rep_min=6 and rep_max=8 and target_sets=2 from public.program_slot where id=s), 'Program choice updates slot, not prescription';
  assert (select exercise_swaps->>s::text = 'db-incline' from public.workout_session where id=w), 'Program choice applies now too';
  assert (select exercise_id='bb-bench' from public.program_slot where id=other_slot), 'Other days must not change';
  assert (select exercise_id='bb-bench' and weight=100 and reps=8 from public.set_log where session_id=w), 'Prior logs must not change';
  insert into public.workout_session (user_id, program_id, program_day_id, week_index) values (u,p,d,2) returning id into future_w;
  assert (select exercise_swaps='{}'::jsonb from public.workout_session where id=future_w), 'New workouts inherit program, not temporary overrides';
  perform public.swap_session_exercise(w,s,'db-bench','horizontal_press','workout');
  assert (select exercise_id='db-incline' from public.program_slot where id=s), 'Later temporary swap must preserve permanent choice';
  -- A different slot write must preserve the first JSON key.
  insert into public.program_slot (user_id, program_day_id, position, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir)
    values (u,d,1,'bb-bench','horizontal_press',2,6,8,1) returning id into other_slot;
  perform public.swap_session_exercise(w,other_slot,'db-bench','horizontal_press','workout');
  assert (select exercise_swaps ? s::text and exercise_swaps ? other_slot::text from public.workout_session where id=w), 'Independent slot choices must coexist';
  update public.program set style='fluid' where id=p;
  perform public.swap_session_exercise(w,s,'bb-bench','horizontal_press','program');
  assert (select count(*)=1 from public.movement_adaptation where program_slot_id=s and action='manual_swap' and new_exercise_id='bb-bench'), 'Fluid overrides must supersede old adaptations';
  rejected := false;
  begin perform public.swap_session_exercise(w,s,'db-bench','horizontal_press','invalid'); exception when others then rejected:=true; end;
  assert rejected, 'Invalid scope must fail';
  rejected := false;
  begin perform public.swap_session_exercise(future_w,gen_random_uuid(),'db-bench','horizontal_press','program'); exception when others then rejected:=true; end;
  assert rejected, 'Unrelated slot must fail';
  update public.workout_session set finished_at=now() where id=w;
  rejected := false;
  begin perform public.swap_session_exercise(w,s,'db-bench','horizontal_press','program'); exception when others then rejected:=true; end;
  assert rejected, 'Finished workouts must reject swaps';
  perform set_config('request.jwt.claim.sub','f2222222-2222-4222-8222-222222222222',true);
  rejected := false;
  begin perform public.swap_session_exercise(future_w,s,'db-bench','horizontal_press','program'); exception when others then rejected:=true; end;
  assert rejected, 'Another user must not access this workout';
end $$;
rollback;
