begin;
select plan(7);
insert into auth.users(id,email) values
 ('a2390000-0000-0000-0000-000000000001','start-owner@example.test'),
 ('a2390000-0000-0000-0000-000000000002','start-other@example.test');
insert into public.program(id,user_id,name,weeks,is_active) values
 ('b2390000-0000-0000-0000-000000000001','a2390000-0000-0000-0000-000000000001','Editor fixture',5,true);
insert into public.program_day(id,user_id,program_id,name,position) values
 ('c2390000-0000-0000-0000-000000000001','a2390000-0000-0000-0000-000000000001','b2390000-0000-0000-0000-000000000001','Upper',0),
 ('c2390000-0000-0000-0000-000000000002','a2390000-0000-0000-0000-000000000001','b2390000-0000-0000-0000-000000000001','Other',1);
insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values
 ('d2390000-0000-0000-0000-000000000001','a2390000-0000-0000-0000-000000000001','c2390000-0000-0000-0000-000000000001',0,'bb-bench','horizontal_press',3,5,8,2),
 ('d2390000-0000-0000-0000-000000000002','a2390000-0000-0000-0000-000000000001','c2390000-0000-0000-0000-000000000002',0,'bb-bench','horizontal_press',3,5,8,2);
create temp table editor_fixture(plan jsonb,request uuid,session_id uuid);
grant select,update on editor_fixture to authenticated;
insert into editor_fixture(plan,request) select jsonb_build_object('version',1,'slots',jsonb_build_array(jsonb_build_object(
 'id','d2390000-0000-0000-0000-000000000001','programSlotId','d2390000-0000-0000-0000-000000000001',
 'exerciseId','bb-bench','pattern','horizontal_press','restSeconds',90,'supersetGroup',null,'sets',jsonb_build_array(
 jsonb_build_object('id','e2390000-0000-0000-0000-000000000001','repMin',5,'repMax',8,'rirMin',1,'rirMax',1,'repsEdited',true,'rirEdited',true,'weight',100,'suggestedWeight',95,'targetReps',5,'seedAt',null),
 jsonb_build_object('id','e2390000-0000-0000-0000-000000000002','repMin',10,'repMax',12,'rirMin',2,'rirMax',2,'repsEdited',true,'rirEdited',true,'weight',60,'suggestedWeight',55,'targetReps',10,'seedAt',null)
 )))),gen_random_uuid();
insert into public.exercise(id,user_id,name,pattern,equipment,base_exercise_id,brand,machine_type,coefficient,is_reference,needs_calibration,increment) values('start-bench','a2390000-0000-0000-0000-000000000001','Bench fixture','horizontal_press','barbell','bb-bench','Life Fitness','bench',1,false,false,5);
set local role authenticated;
select set_config('request.jwt.claim.sub','a2390000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select ok(not has_function_privilege('authenticated','private.validate_workout_editor(jsonb,uuid,boolean)','EXECUTE') and not has_function_privilege('anon','private.validate_workout_editor(jsonb,uuid,boolean)','EXECUTE') and not has_schema_privilege('workout_editor_executor','private','CREATE'),'start-only validation stays private and executor cannot create schema objects');
do $$ declare src bigint;p jsonb;begin
 select plan into p from editor_fixture;
 select source_revision into src from public.coach_refresh_state where user_id=auth.uid();
 begin
  perform public.save_workout_plan('b2390000-0000-0000-0000-000000000001','c2390000-0000-0000-0000-000000000001',0,src,0,'workout',p,gen_random_uuid());
  raise exception 'Unresolved save accepted';
 exception when raise_exception then assert SQLERRM='Choose a specific station'; end;
 begin
  perform public.start_workout_plan('b2390000-0000-0000-0000-000000000001','c2390000-0000-0000-0000-000000000001',0,src,0,jsonb_set(p,'{slots,0,exerciseId}','"unknown-exercise"'));
  raise exception 'Unknown exercise accepted';
 exception when raise_exception then assert SQLERRM='Exercise unavailable'; end;
 assert not exists(select 1 from public.workout_session where user_id=auth.uid());
end $$;
select pass('saves still require equipment and start still rejects unknown exercises without creating a session');
do $$ declare src bigint;p jsonb;sess uuid;begin
 select plan into p from editor_fixture;
 select source_revision into src from public.coach_refresh_state where user_id=auth.uid();
 sess:=public.start_workout_plan('b2390000-0000-0000-0000-000000000001','c2390000-0000-0000-0000-000000000001',0,src,0,p);
 update editor_fixture set session_id=sess;
 assert (select plan_snapshot from public.workout_session where id=sess)=jsonb_set(p,'{slots,0,resolvedTempo}','[2,0,1,0]');
 assert (select exercise_swaps->>'d2390000-0000-0000-0000-000000000001' from public.workout_session where id=sess)='bb-bench';
 assert public.start_workout_plan('b2390000-0000-0000-0000-000000000001','c2390000-0000-0000-0000-000000000001',0,src,0,p)=sess;
 assert (select count(*) from public.workout_session where user_id=auth.uid())=1;
end $$;
select pass('untouched equipment templates start and resume one captured workout');
select throws_ok($$insert into public.set_log(user_id,session_id,program_slot_id,exercise_id,set_index,weight,reps,rir,planned_slot_id,planned_set_id) select auth.uid(),session_id,'d2390000-0000-0000-0000-000000000001','bb-bench',0,100,5,1,'d2390000-0000-0000-0000-000000000001','e2390000-0000-0000-0000-000000000001' from editor_fixture$$,'P0001','Choose equipment for this exercise before logging a set','direct logging of the pending template is rejected');
select is((select count(*)::integer from public.set_log where user_id=auth.uid()),0,'rejected log creates no performance evidence');
select public.swap_session_exercise((select session_id from editor_fixture),'d2390000-0000-0000-0000-000000000001','start-bench','horizontal_press','workout');
insert into public.set_log(user_id,session_id,program_slot_id,exercise_id,set_index,weight,reps,rir,planned_slot_id,planned_set_id)
 select auth.uid(),session_id,'d2390000-0000-0000-0000-000000000001','start-bench',0,100,5,1,'d2390000-0000-0000-0000-000000000001','e2390000-0000-0000-0000-000000000001' from editor_fixture;
select is((select exercise_id from public.set_log where user_id=auth.uid()),'start-bench','selected concrete equipment logs against the captured set');
select is((select plan_snapshot->'slots'->0->>'exerciseId' from public.workout_session where id=(select session_id from editor_fixture)),'bb-bench','equipment resolution does not rewrite the captured prescription');
select * from finish();
rollback;
