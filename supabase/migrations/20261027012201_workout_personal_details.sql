-- Four lifetimes: reusable setup, workout setup, exercise observation, actual-set observation.
create table public.workout_exercise_detail (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 session_id uuid not null references public.workout_session on delete cascade,
 occurrence_id uuid not null,
 exercise_id text not null,
 equipment_instance_id uuid references public.equipment_instance on delete restrict,
 setup text check(char_length(setup)<=2000),
 note text check(char_length(note)<=2000),
 unique nulls not distinct(session_id,occurrence_id,exercise_id,equipment_instance_id)
);
create index workout_exercise_detail_owner on public.workout_exercise_detail(user_id,session_id);
create table public.exercise_setup (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users on delete cascade,
 exercise_id text not null,
 equipment_instance_id uuid references public.equipment_instance on delete cascade,
 setup text check(char_length(setup)<=2000),
 unique nulls not distinct(user_id,exercise_id,equipment_instance_id)
);
alter table public.workout_exercise_detail enable row level security;
alter table public.exercise_setup enable row level security;
create policy detail_read on public.workout_exercise_detail for select to authenticated using(user_id=(select auth.uid()));
create policy setup_read on public.exercise_setup for select to authenticated using(user_id=(select auth.uid()));
create policy detail_executor on public.workout_exercise_detail to workout_editor_executor
 using(user_id=(select private.coach_auth_uid())) with check(user_id=(select private.coach_auth_uid()));
create policy setup_executor on public.exercise_setup to workout_editor_executor
 using(user_id=(select private.coach_auth_uid())) with check(user_id=(select private.coach_auth_uid()));
revoke all on public.workout_exercise_detail,public.exercise_setup from public,anon,authenticated;
grant select on public.workout_exercise_detail,public.exercise_setup to authenticated;
grant select,insert,update on public.workout_exercise_detail,public.exercise_setup to workout_editor_executor;

alter table public.set_log add column note text check(char_length(note)<=2000),
 add column setup_snapshot text check(char_length(setup_snapshot)<=2000),
 add column edit_revision integer not null default 0;

-- Snapshot setup in the insert transaction. Updates never recapture later setup.
-- Existing source locks serialize this with the detail writer before row locks.
create function private.capture_set_detail() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' then
   select d.setup into new.setup_snapshot from public.workout_exercise_detail d
    where d.user_id=new.user_id and d.session_id=new.session_id
      and d.occurrence_id=coalesce(new.planned_slot_id,new.program_slot_id)
      and d.exercise_id=new.exercise_id and d.equipment_instance_id is not distinct from new.equipment_instance_id;
   new.edit_revision:=0;
 else
   new.setup_snapshot:=old.setup_snapshot;
   new.edit_revision:=old.edit_revision+1;
 end if;
 return new;
end $$;
revoke all on function private.capture_set_detail() from public,anon,authenticated;
create trigger capture_set_detail before insert or update on public.set_log for each row execute function private.capture_set_detail();

-- Owner RLS remains active under the existing non-login/non-bypass executor.
grant create on schema private to workout_editor_executor;
create function private.save_workout_exercise_detail(p_session uuid,p_slot uuid,p_exercise text,p_equipment uuid,
 p_kind text,p_text text,p_expected text,p_remember boolean,p_reference_expected text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=private.coach_auth_uid(); session_row public.workout_session;
 slot jsonb; current_exercise text; current_equipment uuid; equipment text;
 detail public.workout_exercise_detail; reference public.exercise_setup; current_text text;
begin
 if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_kind not in ('setup','note') or p_kind is null then raise exception 'Invalid detail'; end if;
 if char_length(p_text)>2000 or char_length(p_expected)>2000 or char_length(p_reference_expected)>2000 then raise exception 'Use 2,000 characters or fewer'; end if;
 p_text:=nullif(btrim(p_text),'');p_expected:=nullif(btrim(p_expected),'');p_reference_expected:=nullif(btrim(p_reference_expected),'');
 perform private.lock_coach_source();
 select * into session_row from public.workout_session where id=p_session and user_id=owner_id for update;
 if not found then raise exception 'Workout not found' using errcode='42501'; end if;
 if session_row.plan_snapshot is not null then
   select value into slot from jsonb_array_elements(session_row.plan_snapshot->'slots') where value->>'id'=p_slot::text;
   if slot is null then raise exception 'Exercise occurrence not found'; end if;
   current_exercise:=coalesce(session_row.exercise_swaps->>p_slot::text,slot->>'exerciseId');
   current_equipment:=case when current_exercise=slot->>'exerciseId' then (slot->>'equipmentInstanceId')::uuid else null end;
 else
   select coalesce(session_row.exercise_swaps->>p_slot::text,s.exercise_id) into current_exercise
     from public.program_slot s where s.id=p_slot and s.program_day_id=session_row.program_day_id and s.user_id=owner_id;
   select equipment_instance_id into current_equipment from public.set_log
     where user_id=owner_id and session_id=p_session and coalesce(planned_slot_id,program_slot_id)=p_slot and exercise_id=current_exercise
     order by created_at desc,id desc limit 1;
 end if;
 if current_exercise is distinct from p_exercise or current_equipment is distinct from p_equipment then
   -- Earlier associations remain editable after swapping, under their original identities.
   if not exists(select 1 from public.workout_exercise_detail where user_id=owner_id and session_id=p_session and occurrence_id=p_slot and exercise_id=p_exercise and equipment_instance_id is not distinct from p_equipment)
     and not exists(select 1 from public.set_log where user_id=owner_id and session_id=p_session and coalesce(planned_slot_id,program_slot_id)=p_slot and exercise_id=p_exercise and equipment_instance_id is not distinct from p_equipment)
     then raise exception 'Exercise changed. Reopen its details' using errcode='40001'; end if;
 end if;
 if p_equipment is not null and not exists(select 1 from public.equipment_instance where id=p_equipment and user_id=owner_id and exercise_id=p_exercise) then raise exception 'Equipment unavailable'; end if;
 if p_kind='setup' then
   select def->>'equipment' into equipment from private.workout_editor_catalog where id=p_exercise;
   if equipment is null then select e.equipment into equipment from public.exercise e where e.id=p_exercise and e.user_id=owner_id; end if;
   -- Assisted bodyweight exercises can also use a canonical machine station.
   if coalesce(equipment,'') not in ('machine','cable') and not exists(select 1 from public.exercise e
     left join private.workout_editor_catalog c on c.id=e.base_exercise_id
     where e.id=p_exercise and e.user_id=owner_id and c.def->>'stationProfile' in ('machine','cable'))
     then raise exception 'Setup is available for machine and cable exercises'; end if;
 end if;
 if current_exercise is null then raise exception 'Exercise occurrence unavailable'; end if;
 insert into public.workout_exercise_detail(user_id,session_id,occurrence_id,exercise_id,equipment_instance_id)
   values(owner_id,p_session,p_slot,p_exercise,p_equipment) on conflict do nothing;
 select * into detail from public.workout_exercise_detail where user_id=owner_id and session_id=p_session and occurrence_id=p_slot
   and exercise_id=p_exercise and equipment_instance_id is not distinct from p_equipment for update;
 current_text:=case when p_kind='setup' then detail.setup else detail.note end;
 if current_text is distinct from p_expected and current_text is distinct from p_text then raise exception 'This detail changed elsewhere. Reopen to review it; your draft is still here' using errcode='40001'; end if;
 if p_kind='setup' then
   update public.workout_exercise_detail set setup=p_text where id=detail.id;
   if p_remember then
     -- Serialize reusable setup for this owner across workouts as well.
     insert into public.exercise_setup(user_id,exercise_id,equipment_instance_id) values(owner_id,p_exercise,p_equipment) on conflict do nothing;
     select * into reference from public.exercise_setup where user_id=owner_id and exercise_id=p_exercise and equipment_instance_id is not distinct from p_equipment for update;
     if reference.setup is distinct from p_reference_expected and reference.setup is distinct from p_text then raise exception 'Remembered setup changed elsewhere. Reopen to review it' using errcode='40001'; end if;
     update public.exercise_setup set setup=p_text where id=reference.id;
   end if;
 else update public.workout_exercise_detail set note=p_text where id=detail.id;
 end if;
 return jsonb_build_object('text',p_text);
end $$;
alter function private.save_workout_exercise_detail(uuid,uuid,text,uuid,text,text,text,boolean,text) owner to workout_editor_executor;
revoke all on function private.save_workout_exercise_detail(uuid,uuid,text,uuid,text,text,text,boolean,text) from public,anon;
grant execute on function private.save_workout_exercise_detail(uuid,uuid,text,uuid,text,text,text,boolean,text) to authenticated;
revoke create on schema private from workout_editor_executor;
create function public.save_workout_exercise_detail(p_session uuid,p_slot uuid,p_exercise text,p_equipment uuid,
 p_kind text,p_text text,p_expected text,p_remember boolean,p_reference_expected text) returns jsonb
language sql security invoker set search_path='' as $$ select private.save_workout_exercise_detail(p_session,p_slot,p_exercise,p_equipment,p_kind,p_text,p_expected,p_remember,p_reference_expected); $$;
revoke all on function public.save_workout_exercise_detail(uuid,uuid,text,uuid,text,text,text,boolean,text) from public,anon;
grant execute on function public.save_workout_exercise_detail(uuid,uuid,text,uuid,text,text,text,boolean,text) to authenticated;
