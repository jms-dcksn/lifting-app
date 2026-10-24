begin;
select plan(14);
insert into auth.users(id,email) values
 ('a2380000-0000-0000-0000-000000000001','editor-owner@example.test'),
 ('a2380000-0000-0000-0000-000000000002','editor-other@example.test');
insert into public.program(id,user_id,name,weeks,is_active) values
 ('b2380000-0000-0000-0000-000000000001','a2380000-0000-0000-0000-000000000001','Editor fixture',5,true);
insert into public.program_day(id,user_id,program_id,name,position) values
 ('c2380000-0000-0000-0000-000000000001','a2380000-0000-0000-0000-000000000001','b2380000-0000-0000-0000-000000000001','Upper',0),
 ('c2380000-0000-0000-0000-000000000002','a2380000-0000-0000-0000-000000000001','b2380000-0000-0000-0000-000000000001','Other',1);
insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values
 ('d2380000-0000-0000-0000-000000000001','a2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',0,'db-bench','horizontal_press',3,5,8,2),
 ('d2380000-0000-0000-0000-000000000002','a2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000002',0,'db-bench','horizontal_press',3,5,8,2);
create temp table editor_fixture(plan jsonb,request uuid,session_id uuid);
grant select,update on editor_fixture to authenticated;
insert into editor_fixture(plan,request) select jsonb_build_object('version',1,'slots',jsonb_build_array(jsonb_build_object(
 'id','d2380000-0000-0000-0000-000000000001','programSlotId','d2380000-0000-0000-0000-000000000001',
 'exerciseId','db-bench','pattern','horizontal_press','restSeconds',90,'supersetGroup',null,'sets',jsonb_build_array(
 jsonb_build_object('id','e2380000-0000-0000-0000-000000000001','repMin',5,'repMax',8,'rirMin',1,'rirMax',1,'repsEdited',true,'rirEdited',true,'weight',100,'suggestedWeight',95,'targetReps',5,'seedAt',null),
 jsonb_build_object('id','e2380000-0000-0000-0000-000000000002','repMin',10,'repMax',12,'rirMin',2,'rirMax',2,'repsEdited',true,'rirEdited',true,'weight',60,'suggestedWeight',55,'targetReps',10,'seedAt',null)
 )))),gen_random_uuid();
set local role authenticated;
select set_config('request.jwt.claim.sub','a2380000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select ok(not has_table_privilege('authenticated','public.workout_plan','INSERT') and not has_table_privilege('anon','public.workout_plan','SELECT'),'plans deny direct and anonymous writes/reads');
select ok(not has_function_privilege('anon','public.save_workout_plan(uuid,uuid,integer,bigint,bigint,text,jsonb,uuid)','EXECUTE'),'anonymous save denied');
do $$ declare p jsonb;req uuid;src bigint;r jsonb;begin
 select plan,request into p,req from editor_fixture;
 select source_revision into src from public.coach_refresh_state where user_id=auth.uid();
 r:=public.save_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',0,src,0,'workout',p,req);
 assert (select source_revision from public.coach_refresh_state where user_id=auth.uid())>src,'plan save must invalidate old Coach confirmations';
 assert r=public.save_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',0,src,0,'workout',p,req),'lost-response retry must return original receipt';
 assert (select target_sets from public.program_slot where id='d2380000-0000-0000-0000-000000000001')=3;
 assert not exists(select 1 from public.workout_session where user_id=auth.uid());
 assert (select plan->'slots'->0->'sets'->1->>'weight' from public.workout_plan where user_id=auth.uid())='60';
end $$;
select pass('workout-only saves full distinct rows, creates no sessions and is idempotent');
do $$ declare src bigint;p jsonb;begin
 select plan into p from editor_fixture;
 select source_revision into src from public.coach_refresh_state where user_id=auth.uid();
 begin
  perform public.save_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',0,src,0,'program',p,gen_random_uuid());
  raise exception 'Stale plan accepted';
 exception when serialization_failure then null;end;
 begin
  perform public.save_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',0,src-1,1,'workout',p,gen_random_uuid());
  raise exception 'Stale source accepted';
 exception when serialization_failure then null;end;
end $$;
select pass('stale plan and source revisions reject rather than overwrite');
select set_config('request.jwt.claim.sub','a2380000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from public.workout_plan),0,'other owner cannot read saved plans');
select throws_ok($$select public.save_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',0,coalesce((select source_revision from public.coach_refresh_state where user_id=auth.uid()),0),0,'workout','{"version":1,"slots":[]}',gen_random_uuid())$$,'P0001','Active program changed','other owner cannot write another program');
select set_config('request.jwt.claim.sub','a2380000-0000-0000-0000-000000000001',true);
do $$ declare src bigint;p jsonb;begin
 select plan into p from editor_fixture;
 select source_revision into src from public.coach_refresh_state where user_id=auth.uid();
 p:=jsonb_set(p,'{slots,0,exerciseId}','"hack-squat"');
 begin
  perform public.save_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',0,src,1,'program',p,gen_random_uuid());
  raise exception 'Unresolved station accepted';
 exception when raise_exception then assert SQLERRM='Choose a specific station';end;
 assert (select exercise_id from public.program_slot where id='d2380000-0000-0000-0000-000000000001')='db-bench';
end $$;
select pass('invalid station rejects atomically and retains saved draft');
-- A failed session insert must not consume a valid saved plan.
reset role;
create function pg_temp.fail_editor_start() returns trigger language plpgsql as $$begin raise exception 'injected start failure';end$$;
create trigger test_fail_start before insert on public.workout_session for each row execute function pg_temp.fail_editor_start();
set local role authenticated;
do $$ declare src bigint;p jsonb;begin
 select plan into p from editor_fixture;
 select source_revision into src from public.coach_refresh_state where user_id=auth.uid();
 begin
  perform public.start_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',0,src,1,p);
  raise exception 'Failure injection missed';
 exception when raise_exception then assert SQLERRM='injected start failure';end;
 assert exists(select 1 from public.workout_plan where user_id=auth.uid() and revision=1);
 assert not exists(select 1 from public.workout_session where user_id=auth.uid());
end $$;
select pass('failed start retains the complete saved plan without a partial session');
reset role;
drop trigger test_fail_start on public.workout_session;
set local role authenticated;
-- Inject a final-write error after program-slot mutation to prove transaction rollback.
reset role;
create function pg_temp.fail_editor_save() returns trigger language plpgsql as $$begin raise exception 'injected save failure';end$$;
create trigger test_fail_editor before insert on public.workout_plan for each row execute function pg_temp.fail_editor_save();
set local role authenticated;
do $$ declare src bigint;p jsonb;begin
 select plan into p from editor_fixture;
 select source_revision into src from public.coach_refresh_state where user_id=auth.uid();
 begin
  perform public.save_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',0,src,1,'program',p,gen_random_uuid());
  raise exception 'Failure injection missed';
 exception when raise_exception then assert SQLERRM='injected save failure';end;
 assert (select target_sets from public.program_slot where id='d2380000-0000-0000-0000-000000000001')=3;
 assert (select revision from public.workout_plan where user_id=auth.uid())=1;
end $$;
select pass('mid-save failure rolls program and occurrence back together');
reset role;
drop trigger test_fail_editor on public.workout_plan;
set local role authenticated;
do $$ declare src bigint;p jsonb;sess uuid;begin
 select plan into p from editor_fixture;
 select source_revision into src from public.coach_refresh_state where user_id=auth.uid();
 perform public.save_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',0,src,1,'program',p,gen_random_uuid());
 assert (select target_sets from public.program_slot where id='d2380000-0000-0000-0000-000000000001')=2;
 assert (select target_sets from public.program_slot where id='d2380000-0000-0000-0000-000000000002')=3;
 select source_revision into src from public.coach_refresh_state where user_id=auth.uid();
 sess:=public.start_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',0,src,2,p);
 assert (select plan_snapshot->'slots'->0->'sets'->0->>'weight' from public.workout_session where id=sess)='100';
 assert not exists(select 1 from public.workout_plan where user_id=auth.uid());
 assert public.start_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',0,src,2,p)=sess;
 update editor_fixture set session_id=sess;
end $$;
select pass('program scope preserves other days; start consumes exact snapshot once and resumes unchanged');
do $$ declare sess uuid;before jsonb;begin
 select session_id into sess from editor_fixture;
 select plan_snapshot into before from public.workout_session where id=sess;
 update public.program_slot set target_sets=4 where id='d2380000-0000-0000-0000-000000000001';
 assert (select plan_snapshot from public.workout_session where id=sess)=before;
 begin
  update public.workout_session set plan_snapshot='{}' where id=sess;
  raise exception 'Snapshot overwrite accepted';
 exception when insufficient_privilege then null;end;
 begin
  update public.program_slot set set_prescriptions='[]' where id='d2380000-0000-0000-0000-000000000001';
  raise exception 'Direct prescriptions accepted';
 exception when insufficient_privilege then null;end;
end $$;
select pass('existing snapshot survives later program edits and denies direct overwrite');
-- After completing the synthetic cycle, a full-day replacement retires the old slot.
reset role;
insert into public.movement_adaptation(user_id,program_slot_id,exercise_id,action,ladder_step)
 values('a2380000-0000-0000-0000-000000000001','d2380000-0000-0000-0000-000000000001','db-bench','dismiss',0);
insert into public.set_log(user_id,session_id,program_slot_id,exercise_id,set_index,weight,reps,rir,planned_slot_id,planned_set_id)
 select 'a2380000-0000-0000-0000-000000000001',session_id,'d2380000-0000-0000-0000-000000000001','db-bench',0,100,5,1,'d2380000-0000-0000-0000-000000000001','e2380000-0000-0000-0000-000000000001' from editor_fixture;
update public.workout_session set finished_at=now() where user_id='a2380000-0000-0000-0000-000000000001';
insert into public.workout_session(user_id,program_id,program_day_id,week_index,finished_at)
 values('a2380000-0000-0000-0000-000000000001','b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000002',1,now());
set local role authenticated;
do $$ declare src bigint;p jsonb;capture jsonb;begin
 select plan into p from editor_fixture;
 select plan_snapshot into capture from public.workout_session where id=(select session_id from editor_fixture);
 p:=jsonb_set(jsonb_set(p,'{slots,0,id}','"d2380000-0000-0000-0000-000000000003"'),'{slots,0,programSlotId}','null');
 select source_revision into src from public.coach_refresh_state where user_id=auth.uid();
 perform public.save_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',2,src,0,'program',p,gen_random_uuid());
 assert (select retired_at is not null from public.program_slot where id='d2380000-0000-0000-0000-000000000001');
 assert (select count(*) from public.set_log where program_slot_id='d2380000-0000-0000-0000-000000000001')=1;
 assert (select count(*) from public.movement_adaptation where program_slot_id='d2380000-0000-0000-0000-000000000001')=1;
 assert (select plan_snapshot from public.workout_session where id=(select session_id from editor_fixture))=capture;
end $$;
select pass('removal retires slot without nulling historical set FKs or deleting adaptations');
select ok(exists(select 1 from public.program_slot where id='d2380000-0000-0000-0000-000000000003' and retired_at is null)
 and (select plan->'slots'->0->>'programSlotId' from public.workout_plan where user_id=auth.uid())='d2380000-0000-0000-0000-000000000003',
 'program additions receive a stable real slot ID in the saved occurrence');
do $$ declare src bigint;p jsonb;begin
 select plan into p from editor_fixture;
 p:=jsonb_set(jsonb_set(p,'{slots,0,id}','"d2380000-0000-0000-0000-000000000003"'),'{slots,0,programSlotId}','"d2380000-0000-0000-0000-000000000003"');
 p:=jsonb_set(jsonb_set(p,'{slots,0,exerciseId}','"station-editor-fixture"'),'{slots,0,pattern}','"vertical_pull"');
 p:=p||jsonb_build_object('variants',jsonb_build_array(jsonb_build_object('id','station-editor-fixture','baseExerciseId','lat-pulldown','brand','Life Fitness','machineType','selectorized','stationModel',null)));
 select source_revision into src from public.coach_refresh_state where user_id=auth.uid();
 perform public.save_workout_plan('b2380000-0000-0000-0000-000000000001','c2380000-0000-0000-0000-000000000001',2,src,1,'workout',p,gen_random_uuid());
 assert exists(select 1 from public.exercise where user_id=auth.uid() and id='station-editor-fixture' and base_exercise_id='lat-pulldown' and machine_type='selectorized' and brand='Life Fitness');
 assert (select plan->'slots'->0->>'exerciseId' from public.workout_plan where user_id=auth.uid())='station-editor-fixture';
 assert (select exercise_id from public.program_slot where id='d2380000-0000-0000-0000-000000000003')='db-bench';
end $$;
select pass('deferred station identity is created atomically with its workout-only plan and leaves the program unchanged');
select * from finish();
rollback;
