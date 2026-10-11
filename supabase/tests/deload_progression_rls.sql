-- CI pgTAP integration check; also run with psql -v ON_ERROR_STOP=1. Rolls back fixtures.
begin;
select plan(1);
insert into auth.users(id, email) values
 ('71000000-0000-0000-0000-000000000001', 'deload-owner@example.test'),
 ('71000000-0000-0000-0000-000000000002', 'deload-other@example.test');
insert into public.program(id, user_id, name, style) values
 ('71000000-0000-0000-0000-000000000010','71000000-0000-0000-0000-000000000001','Deload test','classic');
insert into public.program_phase(id, user_id, program_id, position, name, week_start, week_end, target_rir_min, target_rir_max, is_deload)
values ('71000000-0000-0000-0000-000000000020','71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000010',0,'Recovery',6,6,4,4,true);
insert into public.workout_session(id, user_id, program_id, week_index, is_deload) values
 ('71000000-0000-0000-0000-000000000030','71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000010',6,false),
 ('71000000-0000-0000-0000-000000000031','71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000010',7,true),
 ('71000000-0000-0000-0000-000000000032','71000000-0000-0000-0000-000000000002',null,6,false);
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
-- Deliberately wrong client flags must be ignored, even on ad-hoc/swapped sets.
insert into public.set_log(id,user_id,session_id,exercise_id,set_index,weight,reps,rir,e1rm,is_deload,is_calibration) values
 ('71000000-0000-0000-0000-000000000040','71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000030','bb-row',0,100,8,4,140,false,true),
 ('71000000-0000-0000-0000-000000000041','71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000031','bb-row',0,100,8,1,130,true,false);
do $$ begin
 if not (select is_deload from public.set_log where id='71000000-0000-0000-0000-000000000040') then raise exception 'deload inheritance failed'; end if;
 if (select is_calibration from public.set_log where id='71000000-0000-0000-0000-000000000040') then raise exception 'deload calibration must be false'; end if;
 if (select is_deload from public.set_log where id='71000000-0000-0000-0000-000000000041') then raise exception 'normal session misclassified'; end if;
 begin
  insert into public.set_log(user_id,session_id,exercise_id,set_index,weight,reps) values
   ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000032','bb-row',0,100,8);
  raise exception 'foreign session unexpectedly accepted';
 exception when insufficient_privilege then null; end;
end $$;
-- Save RPC roundtrip (the same path used by builder, templates and cloning).
select public.save_program('{
 "id":"71000000-0000-0000-0000-000000000010", "name":"Deload test", "weeks":12, "style":"classic", "isActive":false,
 "phases":[{"id":"71000000-0000-0000-0000-000000000020","name":"Recovery","weekStart":6,"weekEnd":6,"targetRirMin":4,"targetRirMax":4,"isDeload":true}],
 "days":[{"id":"71000000-0000-0000-0000-000000000050","name":"A","slots":[]}]
}'::jsonb);
do $$ begin
 if not (select is_deload from public.program_phase where id='71000000-0000-0000-0000-000000000020') then raise exception 'save RPC dropped deload'; end if;
end $$;
-- Phase changes and ordinary set/session edits preserve the snapshot and stored estimates.
update public.program_phase set is_deload=false, name='Build';
update public.workout_session set is_deload=false, notes='Edited';
update public.set_log set is_deload=false, reps=9 where id='71000000-0000-0000-0000-000000000040';
insert into public.set_log(user_id,session_id,exercise_id,set_index,weight,reps)
values ('71000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000030','db-row',1,50,8);
delete from public.program where id='71000000-0000-0000-0000-000000000010';
do $$ begin
 if not (select is_deload from public.workout_session where id='71000000-0000-0000-0000-000000000030') then raise exception 'session snapshot lost'; end if;
 if exists(select 1 from public.set_log where session_id='71000000-0000-0000-0000-000000000030' and not is_deload) then raise exception 'set snapshot lost after edit/swap/deletion'; end if;
 if (select e1rm from public.set_log where id='71000000-0000-0000-0000-000000000040') <> 140 then raise exception 'estimate rewritten'; end if;
 if (select count(*) from public.set_log) <> 3 then raise exception 'working sets lost'; end if;
end $$;
select pass('Deload inheritance, RPC persistence, calibration suppression, edits, deletion and cross-user denial');
reset role;
select * from finish();
rollback;
