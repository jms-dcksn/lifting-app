-- Run on the schema immediately BEFORE the deload migration; rollback restores it.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/deload_backfill.sql
begin;
insert into auth.users(id,email) values ('72000000-0000-0000-0000-000000000001','deload-backfill@example.test');
insert into public.program(id,user_id,name,style) values ('72000000-0000-0000-0000-000000000010','72000000-0000-0000-0000-000000000001','Legacy','classic');
insert into public.program_phase(user_id,program_id,position,name,week_start,week_end,target_rir_min,target_rir_max,set_multiplier) values
 ('72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000010',0,'Deload',6,6,3,4,0.5),
 ('72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000010',1,'Less volume',7,7,2,2,0.8);
insert into public.workout_session(id,user_id,program_id,week_index) values
 ('72000000-0000-0000-0000-000000000020','72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000010',5),
 ('72000000-0000-0000-0000-000000000021','72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000010',6),
 ('72000000-0000-0000-0000-000000000022','72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000010',7);
insert into public.set_log(user_id,session_id,exercise_id,set_index,weight,reps,e1rm) values
 ('72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000020','bb-row',0,100,8,200),
 ('72000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000021','bb-row',0,150,8,300);
insert into public.user_exercise_stat(user_id,exercise_id,current_e1rm,personal_coefficient,coeff_confidence_n) values
 ('72000000-0000-0000-0000-000000000001','bb-row',300,0.9,2);
\ir ../migrations/20261010171247_deload_progression.sql

do $$ begin
 if not (select is_deload from public.workout_session where id='72000000-0000-0000-0000-000000000021') then raise exception 'legacy deload not backfilled'; end if;
 if (select is_deload from public.workout_session where id='72000000-0000-0000-0000-000000000022') then raise exception 'ambiguous custom phase classified'; end if;
 if (select current_e1rm from public.user_exercise_stat where user_id='72000000-0000-0000-0000-000000000001') <> 200 then raise exception 'strength cache not rebuilt'; end if;
 if (select coeff_confidence_n from public.user_exercise_stat where user_id='72000000-0000-0000-0000-000000000001') <> 1 then raise exception 'deload confidence counted'; end if;
 if (select e1rm from public.set_log where session_id='72000000-0000-0000-0000-000000000021') <> 300 then raise exception 'stored estimate modified'; end if;
end $$;
rollback;
