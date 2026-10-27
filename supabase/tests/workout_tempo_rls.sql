begin;
select plan(10);
insert into auth.users(id,email) values
 ('a2360000-0000-0000-0000-000000000001','tempo-owner@example.test'),
 ('a2360000-0000-0000-0000-000000000002','tempo-other@example.test');
insert into public.workout_session(id,user_id) values
 ('b2360000-0000-0000-0000-000000000001','a2360000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','a2360000-0000-0000-0000-000000000001',true);
select ok(public.is_valid_exercise_tempo('[3,0,1,0]'),'four seconds accepted');
select ok(not public.is_valid_exercise_tempo('[3,0,1]'),'missing phase rejected');
select ok(not public.is_valid_exercise_tempo('[3,0,-1,0]'),'negative seconds rejected');
select ok(not public.is_valid_exercise_tempo('[3,0,1.5,0]'),'fractional seconds rejected');
select ok(not public.is_valid_exercise_tempo('["3",0,1,0]'),'numeric strings rejected');
insert into public.set_log(id,user_id,session_id,exercise_id,set_index,weight,reps,rir) values
 ('c2360000-0000-0000-0000-000000000001',auth.uid(),'b2360000-0000-0000-0000-000000000001','db-bench',0,50,8,2);
select is((select tempo from public.set_log where id='c2360000-0000-0000-0000-000000000001'),null::jsonb,'legacy set remains unspecified');
update public.set_log set tempo='[2,1,1,0]' where id='c2360000-0000-0000-0000-000000000001';
update public.set_log set reps=7 where id='c2360000-0000-0000-0000-000000000001';
select is((select tempo from public.set_log where id='c2360000-0000-0000-0000-000000000001'),'[2,1,1,0]'::jsonb,'numeric edit preserves saved tempo');
select throws_ok($$update public.set_log set tempo='[2,1,1]' where id='c2360000-0000-0000-0000-000000000001'$$,'23514',null,'invalid database writes rejected');
select set_config('request.jwt.claim.sub','a2360000-0000-0000-0000-000000000002',true);
select is((select count(*)::int from public.set_log where id='c2360000-0000-0000-0000-000000000001'),0,'other owner cannot read tempo');
update public.set_log set tempo='[9,9,9,9]' where id='c2360000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','a2360000-0000-0000-0000-000000000001',true);
select is((select tempo from public.set_log where id='c2360000-0000-0000-0000-000000000001'),'[2,1,1,0]'::jsonb,'other owner cannot overwrite tempo');
select * from finish();
rollback;
