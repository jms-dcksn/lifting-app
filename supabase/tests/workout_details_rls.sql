begin;
select plan(22);
insert into auth.users(id,email) values
 ('a2400000-0000-0000-0000-000000000001','details-owner@example.test'),
 ('a2400000-0000-0000-0000-000000000002','details-other@example.test');
insert into public.exercise(id,user_id,name,pattern,equipment,base_exercise_id,coefficient,increment,brand,machine_type) values
 ('details-machine-a','a2400000-0000-0000-0000-000000000001','Machine A','horizontal_press','machine','machine-chest-press',1,5,'Test','selectorized'),
 ('details-machine-b','a2400000-0000-0000-0000-000000000001','Machine B','horizontal_press','machine','machine-chest-press',1,5,'Test','plate_loaded'),
 ('details-cable','a2400000-0000-0000-0000-000000000001','Cable A','vertical_pull','cable','lat-pulldown',1,5,'Test','selectorized');
insert into public.program(id,user_id,name,weeks,is_active) values('b2400000-0000-0000-0000-000000000001','a2400000-0000-0000-0000-000000000001','Details',5,true);
insert into public.program_day(id,user_id,program_id,name,position) values('c2400000-0000-0000-0000-000000000001','a2400000-0000-0000-0000-000000000001','b2400000-0000-0000-0000-000000000001','Upper',0);
insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir) values
 ('d2400000-0000-0000-0000-000000000001','a2400000-0000-0000-0000-000000000001','c2400000-0000-0000-0000-000000000001',0,'details-machine-a','horizontal_press',3,8,12,2),
 ('d2400000-0000-0000-0000-000000000002','a2400000-0000-0000-0000-000000000001','c2400000-0000-0000-0000-000000000001',1,'details-machine-a','horizontal_press',3,8,12,2),
 ('d2400000-0000-0000-0000-000000000003','a2400000-0000-0000-0000-000000000001','c2400000-0000-0000-0000-000000000001',2,'db-bench','horizontal_press',3,8,12,2),
 ('d2400000-0000-0000-0000-000000000004','a2400000-0000-0000-0000-000000000001','c2400000-0000-0000-0000-000000000001',3,'details-cable','vertical_pull',3,8,12,2);
insert into public.workout_session(id,user_id,program_id,program_day_id) values('e2400000-0000-0000-0000-000000000001','a2400000-0000-0000-0000-000000000001','b2400000-0000-0000-0000-000000000001','c2400000-0000-0000-0000-000000000001');
insert into public.equipment_instance(id,user_id,exercise_id,label) values
 ('12400000-0000-0000-0000-000000000001','a2400000-0000-0000-0000-000000000001','details-machine-a','Station one'),
 ('12400000-0000-0000-0000-000000000002','a2400000-0000-0000-0000-000000000001','details-machine-a','Station two');
insert into public.workout_session(id,user_id,program_id,program_day_id,plan_snapshot) values(
 'e2400000-0000-0000-0000-000000000002','a2400000-0000-0000-0000-000000000001','b2400000-0000-0000-0000-000000000001','c2400000-0000-0000-0000-000000000001',
 '{"version":1,"slots":[{"id":"d2400000-0000-0000-0000-000000000001","programSlotId":"d2400000-0000-0000-0000-000000000001","exerciseId":"details-machine-a","equipmentInstanceId":"12400000-0000-0000-0000-000000000001","pattern":"horizontal_press","restSeconds":90,"supersetGroup":null,"sets":[{"id":"22400000-0000-4000-8000-000000000001","repMin":8,"repMax":12,"rirMin":2,"rirMax":2,"repsEdited":false,"rirEdited":false,"weight":50,"suggestedWeight":50,"targetReps":8,"seedAt":null}]}]}'
);
create function pg_temp.save_detail(slot_number integer,exercise text,kind text,value text,expected text default null,remember boolean default false,reference_expected text default null) returns jsonb language sql security invoker as $$
 select public.save_workout_exercise_detail('e2400000-0000-0000-0000-000000000001',('d2400000-0000-0000-0000-'||lpad(slot_number::text,12,'0'))::uuid,exercise,null,kind,value,expected,remember,reference_expected);
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a2400000-0000-0000-0000-000000000001',true);
select ok(not has_table_privilege('authenticated','public.workout_exercise_detail','INSERT') and not has_table_privilege('anon','public.exercise_setup','SELECT'),'validated RPCs own personal text writes');
select pg_temp.save_detail(1,'details-machine-a','note','First occurrence');
select pg_temp.save_detail(2,'details-machine-a','note','Second occurrence');
select is((select count(*)::int from public.set_log where session_id='e2400000-0000-0000-0000-000000000001'),0,'notes before logging create no synthetic set');
select is((select note from public.workout_exercise_detail where occurrence_id='d2400000-0000-0000-0000-000000000002'),'Second occurrence','duplicate exercise occurrences stay independent');
select pg_temp.save_detail(1,'details-machine-a','setup','Seat 4',null,true);
select is((select setup from public.exercise_setup where exercise_id='details-machine-a'),'Seat 4','explicit remember saves exact setup reference');
select pg_temp.save_detail(4,'details-cable','setup','Pulley 12, rope');
select is((select setup from public.workout_exercise_detail where exercise_id='details-cable'),'Pulley 12, rope','custom cable supports setup');
select throws_ok($$select pg_temp.save_detail(3,'db-bench','setup','Seat 4')$$,'P0001','Setup is available for machine and cable exercises','free weights reject irrelevant setup');
select throws_ok($$select pg_temp.save_detail(1,'details-machine-a','note',repeat('a',2001),'First occurrence')$$,'P0001','Use 2,000 characters or fewer','oversize text rejected without truncation');
select throws_ok($$select pg_temp.save_detail(1,'details-machine-a','note','stale','older')$$,'40001','This detail changed elsewhere. Reopen to review it; your draft is still here','stale note cannot overwrite saved text');
insert into public.set_log(id,user_id,session_id,program_slot_id,exercise_id,set_index,weight,reps,rir,tempo,note,setup_snapshot) values
 ('f2400000-0000-0000-0000-000000000001',auth.uid(),'e2400000-0000-0000-0000-000000000001','d2400000-0000-0000-0000-000000000001','details-machine-a',0,50,8,2,'[2,1,1,0]','Shoulder discomfort','spoofed');
select is((select setup_snapshot from public.set_log where id='f2400000-0000-0000-0000-000000000001'),'Seat 4','set atomically captures applied setup, ignoring supplied snapshot');
select pg_temp.save_detail(1,'details-machine-a','setup','Seat 5','Seat 4',true,'Seat 4');
update public.set_log set reps=9 where id='f2400000-0000-0000-0000-000000000001';
select is((select setup_snapshot from public.set_log where id='f2400000-0000-0000-0000-000000000001'),'Seat 4','later setup and numeric edits preserve historical setup');
select is((select note from public.set_log where id='f2400000-0000-0000-0000-000000000001'),'Shoulder discomfort','numeric edits preserve set note');
select is((select tempo from public.set_log where id='f2400000-0000-0000-0000-000000000001'),'[2,1,1,0]'::jsonb,'numeric edits preserve tempo');
select is((select edit_revision from public.set_log where id='f2400000-0000-0000-0000-000000000001'),1,'edits advance compare-and-save revision');
select public.swap_session_exercise('e2400000-0000-0000-0000-000000000001','d2400000-0000-0000-0000-000000000001','details-machine-b','horizontal_press','workout');
select pg_temp.save_detail(1,'details-machine-b','setup','Pad 2',null,true);
select is((select setup from public.exercise_setup where exercise_id='details-machine-a'),'Seat 5','destination setup does not overwrite source reference');
select is((select note from public.workout_exercise_detail where exercise_id='details-machine-a' and occurrence_id='d2400000-0000-0000-0000-000000000001'),'First occurrence','earlier observation retains original exercise association');
select pg_temp.save_detail(1,'details-machine-a','note',null,'First occurrence');
select is((select note from public.workout_exercise_detail where exercise_id='details-machine-a' and occurrence_id='d2400000-0000-0000-0000-000000000001'),null::text,'earlier observation can be deliberately cleared after swap');
select public.save_workout_exercise_detail('e2400000-0000-0000-0000-000000000002','d2400000-0000-0000-0000-000000000001','details-machine-a','12400000-0000-0000-0000-000000000001','setup','Station one setting',null,true,null);
select is((select count(*)::int from public.exercise_setup where exercise_id='details-machine-a'),2,'physical equipment reference remains separate from the station-default reference');
select throws_ok($$select public.save_workout_exercise_detail('e2400000-0000-0000-0000-000000000002','d2400000-0000-0000-0000-000000000001','details-machine-a','12400000-0000-0000-0000-000000000002','setup','Wrong station',null,true,null)$$,'40001','Exercise changed. Reopen its details','a different equipment instance cannot borrow captured setup');
insert into public.set_log(id,user_id,session_id,program_slot_id,planned_slot_id,planned_set_id,exercise_id,equipment_instance_id,set_index,weight,reps,rir) values(
 'f2400000-0000-0000-0000-000000000002',auth.uid(),'e2400000-0000-0000-0000-000000000002','d2400000-0000-0000-0000-000000000001','d2400000-0000-0000-0000-000000000001','22400000-0000-4000-8000-000000000001','details-machine-a','12400000-0000-0000-0000-000000000001',0,50,8,2);
select is((select setup_snapshot from public.set_log where id='f2400000-0000-0000-0000-000000000002'),'Station one setting','logging captures only the exact equipment instance setup');
select set_config('request.jwt.claim.sub','a2400000-0000-0000-0000-000000000002',true);
select is((select count(*)::int from public.workout_exercise_detail),0,'another owner cannot read workout details');
select is((select count(*)::int from public.exercise_setup),0,'another owner cannot read remembered setup');
select throws_ok($$select pg_temp.save_detail(1,'details-machine-b','note','intrusion')$$,'42501','Workout not found','another owner cannot write workout details');
select * from finish();
rollback;
