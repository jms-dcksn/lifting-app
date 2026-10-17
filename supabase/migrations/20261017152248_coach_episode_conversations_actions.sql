-- #141: episode conversations and confirmed, replay-safe Fluid interventions.
alter table public.agent_message add constraint agent_message_seed_owner unique(id,thread_id,user_id);
create table public.coach_episode_thread (
  episode_id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  thread_id uuid not null unique,
  seed_message_id uuid not null,
  seed_revision integer not null check(seed_revision>0),
  foreign key(episode_id,user_id) references public.coach_episode(id,user_id) on delete cascade,
  foreign key(thread_id,user_id) references public.agent_thread(id,user_id) on delete cascade,
  foreign key(seed_message_id,thread_id,user_id) references public.agent_message(id,thread_id,user_id) on delete cascade
);
create index coach_episode_thread_owner on public.coach_episode_thread(user_id,thread_id);
create table public.coach_action_receipt (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  request_id uuid not null,
  episode_id uuid not null,
  occurrence integer not null check(occurrence>0),
  revision integer not null check(revision>0),
  action text not null check(action in ('rep_change','swap','keep_going')),
  intent_fingerprint text not null,
  confirmed_evidence jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  foreign key(episode_id,user_id) references public.coach_episode(id,user_id) on delete cascade,
  unique(user_id,request_id), unique(episode_id,occurrence,revision)
);
-- Adaptation references in receipts are historical values: deleting a program may cascade
-- its adaptation log, but must preserve the immutable record of what was confirmed.
create index coach_action_receipt_owner on public.coach_action_receipt(user_id,created_at desc,id);
do $$ declare t text; begin
  foreach t in array array['coach_episode_thread','coach_action_receipt'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant select,insert,delete on public.%I to coach_executor',t);
    execute format('create policy coach_owner_read on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
    execute format('create policy coach_executor_owner on public.%I to coach_executor using ((select private.coach_auth_uid())=user_id) with check ((select private.coach_auth_uid())=user_id)',t);
  end loop;
end $$;
grant select,insert on public.agent_thread,public.agent_message,public.movement_adaptation to coach_executor;
grant select on public.program,public.program_day,public.program_slot,public.workout_session,public.exercise to coach_executor;
grant update(exercise_swaps) on public.workout_session to coach_executor;
-- PostgreSQL requires UPDATE privilege on a column to take a row's FOR UPDATE lock.
grant update(id) on public.program_slot to coach_executor;
do $$ declare t text; begin
  foreach t in array array['agent_thread','agent_message','movement_adaptation','program','program_day','program_slot','workout_session','exercise'] loop
    execute format('create policy coach_intervention_owner on public.%I to coach_executor using ((select private.coach_auth_uid())=user_id) with check ((select private.coach_auth_uid())=user_id)',t);
  end loop;
end $$;

grant create on schema private to coach_executor;
create function private.open_coach_episode(p_payload text,p_mac text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p jsonb; e public.coach_episode; s public.coach_refresh_state; t uuid; m uuid;
begin
  p:=private.verify_coach_command(p_payload,p_mac,'open_episode');
  perform private.lock_coach_source();
  select * into e from public.coach_episode where id=(p->>'episodeId')::uuid and user_id=private.coach_auth_uid() for update;
  if not found then return '{"status":"unavailable"}'; end if;
  select thread_id into t from public.coach_episode_thread where episode_id=e.id and user_id=e.user_id;
  if t is not null then return jsonb_build_object('status','ready','threadId',t); end if;
  select * into s from public.coach_refresh_state where user_id=e.user_id;
  if e.revision<>(p->>'revision')::integer or s.source_revision<>(p->>'sourceRevision')::bigint
    or s.state_version<>(p->>'stateVersion')::bigint then return '{"status":"refresh_required"}'; end if;
  t:=gen_random_uuid(); m:=gen_random_uuid();
  insert into public.agent_thread(id,user_id,title) values(t,e.user_id,left(coalesce(e.data#>>'{evidence,name}','Coach review'),80));
  insert into public.agent_message(id,thread_id,user_id,role,parts) values(m,t,e.user_id,'user',
    jsonb_build_array(jsonb_build_object('type','text','text',
      'Opened a Coach exception review (evidence revision '||e.revision||'). Use the current authorized review context; this message does not confirm a training change.')));
  insert into public.coach_episode_thread values(e.id,e.user_id,t,m,e.revision);
  return jsonb_build_object('status','ready','threadId',t);
end $$;
alter function private.open_coach_episode(text,text) owner to coach_executor;
revoke all on function private.open_coach_episode(text,text) from public,anon;
grant execute on function private.open_coach_episode(text,text) to authenticated;
create function public.open_coach_episode(p_payload text,p_mac text) returns jsonb
language sql security invoker set search_path='' as $$ select private.open_coach_episode(p_payload,p_mac) $$;
revoke all on function public.open_coach_episode(text,text) from public,anon;
grant execute on function public.open_coach_episode(text,text) to authenticated;

-- Verify integrity and owner before checking a saved receipt; expiry still gates new writes.
create function private.verify_coach_action_integrity(p_payload text,p_mac text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p jsonb; k bytea; expected bytea; supplied bytea; delta integer:=0; i integer;
begin
  if private.coach_auth_uid() is null or p_payload is null or p_mac is null or octet_length(p_payload)>2000000 or p_mac !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid Coach command' using errcode='42501'; end if;
  p:=p_payload::jsonb;
  select key into k from private.coach_command_key where key_id=p->>'keyId' and clock_timestamp() between valid_from and valid_until;
  if k is null then raise exception 'Coach refresh unavailable' using errcode='42501'; end if;
  expected:=private.coach_hmac(p_payload,k); supplied:=decode(p_mac,'hex');
  for i in 0..31 loop delta:=delta | (get_byte(expected,i) # get_byte(supplied,i)); end loop;
  if delta<>0 or p->>'owner' is distinct from private.coach_auth_uid()::text or p->>'operation' is distinct from 'confirm_action'
    or p->>'version' is distinct from 'episodes-v1' or p->>'policyVersion' is distinct from '1.0' then
    raise exception 'Invalid Coach command' using errcode='42501'; end if;
  return p;
end $$;
alter function private.verify_coach_action_integrity(text,text) owner to coach_executor;
revoke all on function private.verify_coach_action_integrity(text,text) from public,anon,authenticated;

create function private.commit_coach_episode_action(p_payload text,p_mac text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p jsonb; e public.coach_episode; s public.coach_refresh_state; r public.coach_action_receipt;
  slot public.program_slot; day public.program_day; prog public.program; sess public.workout_session;
  a uuid:=gen_random_uuid(); result jsonb; next_data jsonb; prefs bigint; intent jsonb;
begin
  p:=private.verify_coach_action_integrity(p_payload,p_mac);
  perform private.lock_coach_source();
  intent:=p->'intent';
  select * into e from public.coach_episode where id=(intent->>'episodeId')::uuid and user_id=private.coach_auth_uid() for update;
  if not found then return '{"status":"unavailable"}'; end if;
  select * into r from public.coach_action_receipt where user_id=e.user_id and request_id=(intent->>'requestId')::uuid;
  if found then
    if r.intent_fingerprint is distinct from p->>'intentFingerprint' or r.confirmed_evidence->'intent' is distinct from intent then return '{"status":"request_conflict"}'; end if;
    return jsonb_build_object('status','ready','receipt',r.result);
  end if;
  perform private.verify_coach_command(p_payload,p_mac,'confirm_action');
  if intent->>'action' not in ('rep_change','swap','keep_going') or intent->>'scope' is distinct from 'program'
    or (intent->>'action'='swap') is distinct from (intent->>'replacementId' is not null) then
    raise exception 'Invalid action' using errcode='22023'; end if;
  select * into s from public.coach_refresh_state where user_id=e.user_id;
  select version into prefs from public.coach_preferences where user_id=e.user_id;
  if s.source_revision is distinct from (p->>'sourceRevision')::bigint or s.state_version is distinct from (p->>'stateVersion')::bigint
    or coalesce(prefs,0) is distinct from (p->>'preferencesVersion')::bigint
    or e.revision is distinct from (intent->>'revision')::integer or e.occurrence is distinct from (intent->>'occurrence')::integer
    or e.state<>'open' or e.validity<>'current' or e.family<>'lift_performance'
    or e.data->'snoozeSourceIds'<>'null'::jsonb then return '{"status":"stale_action"}'; end if;
  if exists(select 1 from public.coach_episode where user_id=e.user_id and family='session_pain' and state='open') then return '{"status":"stale_action"}'; end if;
  select * into slot from public.program_slot where id=(p->>'slotId')::uuid and user_id=e.user_id;
  select * into day from public.program_day where id=slot.program_day_id and user_id=e.user_id;
  select * into prog from public.program where id=day.program_id and user_id=e.user_id;
  if prog.id is null or not prog.is_active or prog.style<>'fluid'
    or slot.id::text is distinct from e.data#>>'{evidence,candidate,scope,slotId}'
    or prog.id::text is distinct from e.data#>>'{evidence,candidate,scope,context,programId}'
    or p->>'exerciseId' is distinct from e.data#>>'{evidence,candidate,scope,context,exerciseId}'
    or not exists(select 1 from jsonb_array_elements(e.data#>'{evidence,candidate,signals}') x
      where x->>'reason'='confirmed_plateau' and x->>'action'=p->>'offeredAction') then return '{"status":"stale_action"}'; end if;
  -- Lock order is state -> episode -> open session -> slot, including pre-workout calls.
  select * into sess from public.workout_session where user_id=e.user_id and program_id=prog.id
    and program_day_id=day.id and finished_at is null order by performed_at desc,id desc limit 1 for update;
  if sess.id is distinct from (intent->>'sessionId')::uuid then return '{"status":"scope_changed"}'; end if;
  perform 1 from public.program_slot where id=slot.id and user_id=e.user_id for update;
  if intent->>'action'='rep_change' then
    if p->>'offeredAction'<>'rep_change' or not exists(select 1 from jsonb_array_elements(e.data#>'{evidence,candidate,signals}') x
      where x->>'action'='rep_change' and x#>>'{repBand,repMin}'=p->>'repMin' and x#>>'{repBand,repMax}'=p->>'repMax') then
      return '{"status":"stale_action"}'; end if;
  elsif intent->>'action'='swap' and (p->>'offeredAction'<>'swap' or p->>'replacementId' is distinct from intent->>'replacementId') then
    return '{"status":"stale_action"}';
  end if;
  insert into public.movement_adaptation(id,user_id,program_slot_id,exercise_id,action,new_exercise_id,new_rep_min,new_rep_max,ladder_step)
    values(a,e.user_id,slot.id,p->>'exerciseId',case when intent->>'action'='keep_going' then 'dismiss' else intent->>'action' end,
      case when intent->>'action'='swap' then intent->>'replacementId' end,
      case when intent->>'action'='rep_change' then (p->>'repMin')::smallint end,
      case when intent->>'action'='rep_change' then (p->>'repMax')::smallint end,
      case when intent->>'action'='rep_change' then (p->>'ladderStep')::smallint+1 else 0 end);
  if intent->>'action'='swap' and sess.id is not null then
    update public.workout_session set exercise_swaps=coalesce(exercise_swaps,'{}'::jsonb)||jsonb_build_object(slot.id::text,intent->>'replacementId')
      where id=sess.id and user_id=e.user_id;
  end if;
  next_data:=e.data||jsonb_build_object('revision',e.revision+1);
  if intent->>'action'='keep_going' then
    next_data:=next_data||jsonb_build_object('snoozeSourceIds',e.data->'frontier');
  else
    next_data:=next_data||'{"state":"superseded","terminalReason":"intervention_applied"}'::jsonb;
  end if;
  update public.coach_episode set data=next_data,revision=e.revision+1,state=next_data->>'state',updated_at=now() where id=e.id and user_id=e.user_id;
  update public.coach_refresh_state set state_version=state_version+1 where user_id=e.user_id;
  result:=jsonb_build_object('requestId',intent->>'requestId','episodeId',e.id,'action',intent->>'action',
    'status',case when intent->>'action'='keep_going' then 'snoozed' else 'applied' end,'adaptationId',a,
    'sessionId',sess.id,'slotId',slot.id,'replacementId',case when intent->>'action'='swap' then intent->>'replacementId' end,
    'repMin',case when intent->>'action'='rep_change' then (p->>'repMin')::integer end,
    'repMax',case when intent->>'action'='rep_change' then (p->>'repMax')::integer end);
  insert into public.coach_action_receipt(user_id,request_id,episode_id,occurrence,revision,action,intent_fingerprint,confirmed_evidence,result)
    values(e.user_id,(intent->>'requestId')::uuid,e.id,e.occurrence,e.revision,intent->>'action',p->>'intentFingerprint',
      jsonb_build_object('evidence',e.data->'evidence','sourceRevision',s.source_revision,'intent',intent),result);
  return jsonb_build_object('status','ready','receipt',result);
end $$;
alter function private.commit_coach_episode_action(text,text) owner to coach_executor;
revoke all on function private.commit_coach_episode_action(text,text) from public,anon;
grant execute on function private.commit_coach_episode_action(text,text) to authenticated;
create function public.commit_coach_episode_action(p_payload text,p_mac text) returns jsonb
language sql security invoker set search_path='' as $$ select private.commit_coach_episode_action(p_payload,p_mac) $$;
revoke all on function public.commit_coach_episode_action(text,text) from public,anon;
grant execute on function public.commit_coach_episode_action(text,text) to authenticated;
revoke create on schema private from coach_executor;
