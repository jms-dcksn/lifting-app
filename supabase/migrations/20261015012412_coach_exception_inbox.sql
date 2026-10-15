-- #195: derived Coach state. No training writes or model calls in reconciliation.
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'coach_executor') then
    create role coach_executor nologin nosuperuser nobypassrls;
  end if;
  execute format('grant coach_executor to %I with inherit false',current_user);
end $$;
grant create on schema private to coach_executor;
grant usage on schema public, private, auth, extensions to coach_executor;
grant execute on function auth.uid() to coach_executor;

create table public.coach_refresh_state (
  user_id uuid primary key references auth.users on delete cascade,
  source_revision bigint not null default 0,
  reconciled_revision bigint not null default -1,
  state_version bigint not null default 0,
  bootstrap_at timestamptz,
  history_cleared_at timestamptz,
  defaults_version text not null default 'episodes-v1'
);
create table public.coach_preferences (
  user_id uuid primary key references auth.users on delete cascade,
  settings jsonb not null default '{"pain":true,"reduction":true,"plateau":true,"decline":true,"quietEnabled":false,"quietStart":1320,"quietEnd":420,"timeZone":"America/Chicago"}',
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table public.coach_episode (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  context_key text not null,
  family text not null check (family in ('session_pain','lift_performance')),
  occurrence integer not null check (occurrence > 0),
  revision integer not null check (revision > 0),
  state text not null check (state in ('open','resolved','superseded')),
  validity text not null check (validity in ('current','stale','invalidated','blocked_by_pain')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, context_key), unique (id,user_id)
);
create table public.coach_notice (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  episode_id uuid not null,
  occurrence integer not null check (occurrence > 0),
  attention_key text not null,
  category text not null check (category in ('pain','reduction','plateau','decline')),
  title text not null,
  body text not null,
  generation_evidence jsonb,
  generation_revision integer not null,
  redacted boolean not null default false,
  read_at timestamptz,
  acknowledged_at timestamptz,
  arrival_state text not null check (arrival_state in ('pending','suppressed','delivered','retired')),
  created_at timestamptz not null default now(),
  foreign key (episode_id,user_id) references public.coach_episode(id,user_id) on delete cascade,
  unique (episode_id,occurrence,attention_key)
);
create index coach_episode_owner_state on public.coach_episode (user_id,state,updated_at desc,id);
create index coach_notice_owner_page on public.coach_notice (user_id,created_at desc,id desc);
create index coach_notice_owner_unread on public.coach_notice (user_id,created_at desc,id desc) where read_at is null;

-- Key material is provisioned separately, never in a migration or seed.
create table private.coach_command_key (
  key_id text primary key, key bytea not null check (octet_length(key) = 32),
  valid_from timestamptz not null, valid_until timestamptz not null,
  check (valid_until > valid_from)
);
alter table private.coach_command_key enable row level security;
grant select on private.coach_command_key to coach_executor;
create policy coach_key_executor on private.coach_command_key for select to coach_executor using (true);
revoke all on private.coach_command_key from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['coach_refresh_state','coach_preferences','coach_episode','coach_notice'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to coach_executor',t);
    execute format('create policy coach_owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
    execute format('create policy coach_executor_owner on public.%I to coach_executor using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
  end loop;
end $$;
-- Source revision maintenance also runs for migrations/admin writes without a JWT.
create policy coach_revision_admin on public.coach_refresh_state to coach_executor
  using (auth.uid() is null) with check (auth.uid() is null);

create function private.lock_coach_source() returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in required' using errcode='42501'; end if;
  insert into public.coach_refresh_state(user_id) values(u) on conflict do nothing;
  perform 1 from public.coach_refresh_state where user_id=u for update;
end $$;
alter function private.lock_coach_source() owner to coach_executor;
revoke all on function private.lock_coach_source() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.lock_coach_source() to authenticated;

-- BEFORE STATEMENT runs before any source row locks, including RPC UPDATE/DELETE.
create function private.coach_source_statement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  if auth.uid() is not null then
    if exists(select 1 from auth.users where id=auth.uid()) then perform private.lock_coach_source(); end if;
  else
    -- Administrative multi-owner writes lock in UUID order. Do not read credentials.
    for u in select id from auth.users order by id loop
      insert into public.coach_refresh_state(user_id) values(u) on conflict do nothing;
      perform 1 from public.coach_refresh_state where user_id=u for update;
    end loop;
  end if;
  return null;
end $$;
grant select (id) on auth.users to coach_executor;
alter function private.coach_source_statement() owner to coach_executor;
revoke all on function private.coach_source_statement() from public, anon, authenticated;

create function private.coach_source_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u uuid; old_u uuid; r jsonb;
begin
  r := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  u := (case when tg_table_name='profile' then r->>'id' else r->>'user_id' end)::uuid;
  if tg_op='UPDATE' then
    old_u := (case when tg_table_name='profile' then to_jsonb(old)->>'id' else to_jsonb(old)->>'user_id' end)::uuid;
    if old_u is distinct from u then raise exception 'Source ownership cannot change' using errcode='42501'; end if;
  end if;
  if auth.uid() is not null and auth.uid() <> u then raise exception 'Source owner mismatch' using errcode='42501'; end if;
  if exists(select 1 from auth.users where id=u) then
    update public.coach_refresh_state set source_revision=source_revision+1 where user_id=u;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
alter function private.coach_source_row() owner to coach_executor;
revoke all on function private.coach_source_row() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['set_log','workout_session','program','program_day','program_slot','program_phase',
    'movement_adaptation','equipment_instance','exercise','bodyweight_log','profile','user_exercise_stat'] loop
    execute format('create trigger coach_source_lock before insert or update or delete on public.%I for each statement execute function private.coach_source_statement()',t);
    execute format('create trigger coach_source_revision before insert or update or delete on public.%I for each row execute function private.coach_source_row()',t);
  end loop;
end $$;

-- Existing RPCs explicitly lock rows before their first write. Acquire owner lock first.
-- Copy their current definitions without changing their validated swap/save behavior.
do $$ declare f regprocedure; definition text; begin
  foreach f in array array['public.save_program(jsonb)'::regprocedure,'public.set_active_program(uuid)'::regprocedure,
    'public.swap_session_exercise(uuid,uuid,text,text,text)'::regprocedure,
    'public.swap_program_slot_exercise(uuid,text,text)'::regprocedure] loop
    definition := pg_get_functiondef(f);
    definition := regexp_replace(definition, E'(?i)\\mbegin\\M', E'begin\n  perform private.lock_coach_source();', '');
    execute definition;
  end loop;
end $$;

create function private.verify_coach_command(p_payload text,p_mac text,p_operation text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p jsonb; k bytea; expected bytea; supplied bytea; delta integer := 0; i integer;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_payload is null or p_mac is null or octet_length(p_payload)>2000000 or p_mac !~ '^[0-9a-f]{64}$' then raise exception 'Invalid Coach command' using errcode='42501'; end if;
  p := p_payload::jsonb;
  if p->>'issuedAt' is null or p->>'expiresAt' is null then raise exception 'Invalid Coach command' using errcode='42501'; end if;
  select key into k from private.coach_command_key where key_id=p->>'keyId' and clock_timestamp() between valid_from and valid_until;
  if k is null then raise exception 'Coach refresh unavailable' using errcode='42501'; end if;
  expected := extensions.hmac(convert_to(p_payload,'UTF8'), k, 'sha256');
  supplied := decode(p_mac,'hex');
  for i in 0..31 loop delta := delta | (get_byte(expected,i) # get_byte(supplied,i)); end loop;
  if delta<>0 or p->>'owner' is distinct from auth.uid()::text or p->>'operation' is distinct from p_operation
    or p->>'version' is distinct from 'episodes-v1' or p->>'policyVersion' is distinct from '1.0'
    or (p->>'expiresAt')::timestamptz < clock_timestamp()
    or (p->>'issuedAt')::timestamptz > clock_timestamp()+interval '5 seconds'
    or (p->>'expiresAt')::timestamptz > (p->>'issuedAt')::timestamptz+interval '60 seconds'
    or (p->>'issuedAt')::timestamptz < clock_timestamp()-interval '65 seconds'
  then raise exception 'Invalid Coach command' using errcode='42501'; end if;
  return p;
end $$;
alter function private.verify_coach_command(text,text,text) owner to coach_executor;
revoke all on function private.verify_coach_command(text,text,text) from public,anon,authenticated;

create function private.reconcile_coach_episodes(p_payload text,p_mac text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p jsonb; s public.coach_refresh_state; e jsonb; n jsonb; v_episode_id uuid; prefs jsonb; prefs_version bigint;
  arrival public.coach_notice; local_minute integer; quiet boolean; pain boolean;
begin
  p := private.verify_coach_command(p_payload,p_mac,'refresh');
  perform private.lock_coach_source();
  select * into s from public.coach_refresh_state where user_id=auth.uid();
  select settings,version into prefs,prefs_version from public.coach_preferences where user_id=auth.uid();
  prefs := coalesce(prefs,'{"pain":true,"reduction":true,"plateau":true,"decline":true,"quietEnabled":false,"quietStart":1320,"quietEnd":420,"timeZone":"America/Chicago"}'::jsonb);
  if s.source_revision<>(p->>'sourceRevision')::bigint or s.state_version<>(p->>'stateVersion')::bigint
    or coalesce(prefs_version,0)<>(p->>'preferencesVersion')::bigint then return '{"status":"refresh_required"}'::jsonb; end if;
  for e in select value from jsonb_array_elements(p->'episodes') loop
    insert into public.coach_episode(user_id,context_key,family,occurrence,revision,state,validity,data)
      values(auth.uid(),e->>'contextKey',e->>'family',(e->>'occurrence')::integer,(e->>'revision')::integer,e->>'state',e->>'validity',e)
      on conflict(user_id,context_key) do update set family=excluded.family,occurrence=excluded.occurrence,
        revision=excluded.revision,state=excluded.state,validity=excluded.validity,data=excluded.data,
        updated_at=case when public.coach_episode.data is distinct from excluded.data then now() else public.coach_episode.updated_at end;
  end loop;
  -- Source removals/corrections redact derived snapshots; delivery identity survives.
  update public.coach_notice n set generation_evidence=null,redacted=true,arrival_state='retired'
    from public.coach_episode e where e.id=n.episode_id and e.user_id=auth.uid() and n.user_id=auth.uid()
      and e.validity='invalidated';
  for n in select value from jsonb_array_elements(p->'notices') loop
    select id into v_episode_id from public.coach_episode where user_id=auth.uid() and context_key=n->>'contextKey';
    insert into public.coach_notice(user_id,episode_id,occurrence,attention_key,category,title,body,generation_evidence,generation_revision,arrival_state)
      select auth.uid(),v_episode_id,(n->>'occurrence')::integer,n->>'attentionKey',n->>'category',n->>'title',n->>'body',n->'evidence',e.revision,
        case when s.bootstrap_at is null or not coalesce((prefs->>(n->>'category'))::boolean,false) then 'suppressed' else 'pending' end
      from public.coach_episode e where e.id=v_episode_id and e.user_id=auth.uid()
      on conflict(episode_id,occurrence,attention_key) do nothing;
  end loop;
  update public.coach_refresh_state set reconciled_revision=source_revision,state_version=state_version+1,
    bootstrap_at=coalesce(bootstrap_at,now()) where user_id=auth.uid();
  -- Retire superseded or resolved arrivals; never resurrect them on later correction.
  update public.coach_notice n set arrival_state='retired' from public.coach_episode e
    where n.user_id=auth.uid() and e.id=n.episode_id and e.user_id=auth.uid() and n.arrival_state='pending'
      and (e.state<>'open' or e.occurrence<>n.occurrence);
  select exists(select 1 from public.coach_episode where user_id=auth.uid() and family='session_pain' and state='open') into pain;
  local_minute := extract(hour from clock_timestamp() at time zone (prefs->>'timeZone'))::integer*60
    +extract(minute from clock_timestamp() at time zone (prefs->>'timeZone'))::integer;
  quiet := (prefs->>'quietEnabled')::boolean and case when (prefs->>'quietStart')::integer<(prefs->>'quietEnd')::integer
    then local_minute>=(prefs->>'quietStart')::integer and local_minute<(prefs->>'quietEnd')::integer
    else local_minute>=(prefs->>'quietStart')::integer or local_minute<(prefs->>'quietEnd')::integer end;
  -- Disabling a category consumes already queued arrivals, too.
  update public.coach_notice set arrival_state='suppressed' where user_id=auth.uid() and arrival_state='pending'
    and not coalesce((prefs->>category)::boolean,false);
  if coalesce((p->>'allowArrival')::boolean,false) and not quiet then
    select n.* into arrival from public.coach_notice n join public.coach_episode e on e.id=n.episode_id and e.user_id=n.user_id
      where n.user_id=auth.uid() and n.arrival_state='pending' and n.read_at is null and n.acknowledged_at is null
      and e.state='open' and e.validity='current' and e.occurrence=n.occurrence
      and (not pain or n.category='pain') and coalesce((prefs->>n.category)::boolean,false)
      order by case n.category when 'pain' then 0 else 1 end,n.created_at,n.id limit 1;
    if arrival.id is not null then update public.coach_notice set arrival_state='delivered' where id=arrival.id and user_id=auth.uid(); end if;
  end if;
  return jsonb_build_object('status','ready','arrival',case when arrival.id is null then null else jsonb_build_object('id',arrival.id,'title',arrival.title) end);
end $$;
alter function private.reconcile_coach_episodes(text,text) owner to coach_executor;
revoke all on function private.reconcile_coach_episodes(text,text) from public,anon;
grant execute on function private.reconcile_coach_episodes(text,text) to authenticated;
create function public.reconcile_coach_episodes(p_payload text,p_mac text) returns jsonb
language sql security invoker set search_path='' as $$ select private.reconcile_coach_episodes(p_payload,p_mac) $$;
revoke all on function public.reconcile_coach_episodes(text,text) from public,anon;
grant execute on function public.reconcile_coach_episodes(text,text) to authenticated;

create function private.mark_coach_notice(p_id uuid,p_acknowledge boolean) returns void
language plpgsql security definer set search_path='' as $$ begin
  perform private.lock_coach_source();
  update public.coach_notice set read_at=coalesce(read_at,now()),
    acknowledged_at=case when p_acknowledge then coalesce(acknowledged_at,now()) else acknowledged_at end,
    arrival_state=case when arrival_state='pending' then 'suppressed' else arrival_state end
    where id=p_id and user_id=auth.uid();
  if not found then raise exception 'Notice unavailable' using errcode='P0002'; end if;
end $$;
alter function private.mark_coach_notice(uuid,boolean) owner to coach_executor;
revoke all on function private.mark_coach_notice(uuid,boolean) from public,anon;
grant execute on function private.mark_coach_notice(uuid,boolean) to authenticated;
create function public.mark_coach_notice(p_id uuid,p_acknowledge boolean default false) returns void
language sql security invoker set search_path='' as $$ select private.mark_coach_notice(p_id,p_acknowledge) $$;
revoke all on function public.mark_coach_notice(uuid,boolean) from public,anon;
grant execute on function public.mark_coach_notice(uuid,boolean) to authenticated;

create function private.save_coach_preferences(p_settings jsonb,p_version bigint) returns void
language plpgsql security definer set search_path='' as $$ declare k text; begin
  perform private.lock_coach_source();
  if (select count(*) from jsonb_object_keys(p_settings))<>8 then raise exception 'Invalid preferences'; end if;
  foreach k in array array['pain','reduction','plateau','decline','quietEnabled'] loop
    if jsonb_typeof(p_settings->k) is distinct from 'boolean' then raise exception 'Invalid preferences'; end if;
  end loop;
  foreach k in array array['quietStart','quietEnd'] loop
    if jsonb_typeof(p_settings->k) is distinct from 'number' or (p_settings->>k)!~'^[0-9]+$'
      or (p_settings->>k)::integer not between 0 and 1439 then raise exception 'Invalid quiet hours'; end if;
  end loop;
  if p_settings->>'quietStart'=p_settings->>'quietEnd'
    or not exists(select 1 from pg_timezone_names where name=p_settings->>'timeZone') then raise exception 'Invalid quiet hours'; end if;
  insert into public.coach_preferences(user_id) values(auth.uid()) on conflict do nothing;
  update public.coach_preferences set settings=p_settings,version=version+1,updated_at=now()
    where user_id=auth.uid() and version=p_version;
  if not found then raise exception 'Preferences changed. Reload and try again.' using errcode='40001'; end if;
end $$;
alter function private.save_coach_preferences(jsonb,bigint) owner to coach_executor;
revoke all on function private.save_coach_preferences(jsonb,bigint) from public,anon;
grant execute on function private.save_coach_preferences(jsonb,bigint) to authenticated;
create function public.save_coach_preferences(p_settings jsonb,p_version bigint) returns void
language sql security invoker set search_path='' as $$ select private.save_coach_preferences(p_settings,p_version) $$;
revoke all on function public.save_coach_preferences(jsonb,bigint) from public,anon;
grant execute on function public.save_coach_preferences(jsonb,bigint) to authenticated;

-- Explicit user intent, signed by the server; acknowledging a notice never calls this.
create function private.end_coach_pain_episode(p_payload text,p_mac text) returns void
language plpgsql security definer set search_path='' as $$ declare p jsonb; s public.coach_refresh_state; begin
  p := private.verify_coach_command(p_payload,p_mac,'pain_end');
  perform private.lock_coach_source();
  select * into s from public.coach_refresh_state where user_id=auth.uid();
  if s.source_revision<>(p->>'sourceRevision')::bigint or s.state_version<>(p->>'stateVersion')::bigint then
    raise exception 'Refresh required' using errcode='40001'; end if;
  update public.coach_episode set state='resolved',validity='current',revision=revision+1,
    data=jsonb_set(jsonb_set(jsonb_set(jsonb_set(data,'{state}','"resolved"'),'{validity}','"current"'),
      '{terminalReason}','"user_reported_ended"'),'{revision}',to_jsonb(revision+1)),updated_at=now()
    where user_id=auth.uid() and id=(p->>'episodeId')::uuid and family='session_pain' and revision=(p->>'episodeRevision')::integer;
  if not found then raise exception 'Pain review changed. Refresh required.' using errcode='40001'; end if;
  update public.coach_refresh_state set state_version=state_version+1 where user_id=auth.uid();
end $$;
alter function private.end_coach_pain_episode(text,text) owner to coach_executor;
revoke all on function private.end_coach_pain_episode(text,text) from public,anon;
grant execute on function private.end_coach_pain_episode(text,text) to authenticated;
create function public.end_coach_pain_episode(p_payload text,p_mac text) returns void
language sql security invoker set search_path='' as $$ select private.end_coach_pain_episode(p_payload,p_mac) $$;
revoke all on function public.end_coach_pain_episode(text,text) from public,anon;
grant execute on function public.end_coach_pain_episode(text,text) to authenticated;

create function private.clear_coach_history() returns void
language plpgsql security definer set search_path='' as $$ begin
  perform private.lock_coach_source();
  delete from public.coach_episode where user_id=auth.uid();
  update public.coach_refresh_state set bootstrap_at=null,history_cleared_at=now(),state_version=state_version+1 where user_id=auth.uid();
end $$;
alter function private.clear_coach_history() owner to coach_executor;
revoke all on function private.clear_coach_history() from public,anon;
grant execute on function private.clear_coach_history() to authenticated;
create function public.clear_coach_history() returns void
language sql security invoker set search_path='' as $$ select private.clear_coach_history() $$;
revoke all on function public.clear_coach_history() from public,anon;
grant execute on function public.clear_coach_history() to authenticated;

-- Ownership transfer needs CREATE during installation, not at runtime.
revoke create on schema private from coach_executor;
