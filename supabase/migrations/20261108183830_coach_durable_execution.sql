-- Human applies after merge; never run setup() in a request.
-- Native tables match @langchain/langgraph-checkpoint-postgres@1.1.2.
do $$
begin
  if not exists (select 1 from pg_roles where rolname='coach_agent_runtime') then
    create role coach_agent_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
  if exists (select 1 from pg_roles where rolname='coach_agent_runtime'
    and (rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolbypassrls))
    or exists (select 1 from pg_auth_members where member=(select oid from pg_roles where rolname='coach_agent_runtime')) then
    raise exception 'Coach runtime role must have no elevated attributes or role memberships';
  end if;
  execute format('grant coach_agent_runtime to %I with inherit false', current_user);
end $$;
create schema coach_runtime;
revoke all on schema coach_runtime from public, anon, authenticated;
grant usage on schema coach_runtime to coach_agent_runtime;
grant usage on schema public to coach_agent_runtime;

alter table public.agent_message add constraint agent_message_identity_owner_key
  unique (id, thread_id, user_id);

create table coach_runtime.thread (
  conversation_id uuid primary key,
  owner_id uuid not null,
  thread_id text generated always as (conversation_id::text) stored unique,
  runtime_version text not null check (runtime_version <> ''),
  epoch bigint not null default 0 check (epoch >= 0),
  bootstrap_version integer,
  bootstrap_checkpoint_id text,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, owner_id)
    references public.agent_thread(id, user_id) on delete cascade,
  unique (conversation_id, owner_id),
  check ((bootstrap_version is null) = (bootstrap_checkpoint_id is null)),
  check (bootstrap_version is null or bootstrap_version > 0)
);

create table coach_runtime.turn (
  request_id uuid not null,
  owner_id uuid not null,
  conversation_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  input_message_id uuid not null,
  status text not null check (status in ('accepted', 'running', 'interrupted', 'failed', 'completed')),
  epoch bigint not null check (epoch > 0),
  lease_until timestamptz,
  committed_checkpoint_id text,
  projected_checkpoint_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, request_id),
  foreign key (conversation_id, owner_id)
    references coach_runtime.thread(conversation_id, owner_id) on delete cascade,
  foreign key (input_message_id, conversation_id, owner_id)
    references public.agent_message(id, thread_id, user_id) deferrable initially deferred,
  check ((status = 'running') = (lease_until is not null)),
  check (status <> 'completed' or
    (committed_checkpoint_id is not null and projected_checkpoint_id is not null
      and committed_checkpoint_id = projected_checkpoint_id))
);

-- Unresolved work must be recovered before accepting a distinct new send.
create unique index coach_one_unresolved_turn on coach_runtime.turn(conversation_id)
  where status <> 'completed';
create index coach_turn_recent on coach_runtime.turn(conversation_id, created_at desc);

create table coach_runtime.checkpoint_migrations (v integer primary key);
create table coach_runtime.checkpoints (
  thread_id text not null references coach_runtime.thread(thread_id) on delete cascade,
  checkpoint_ns text not null default '',
  checkpoint_id text not null,
  parent_checkpoint_id text,
  type text,
  checkpoint jsonb not null,
  metadata jsonb not null default '{}',
  primary key (thread_id, checkpoint_ns, checkpoint_id)
);
create table coach_runtime.checkpoint_blobs (
  thread_id text not null references coach_runtime.thread(thread_id) on delete cascade,
  checkpoint_ns text not null default '',
  channel text not null,
  version text not null,
  type text not null,
  blob bytea,
  primary key (thread_id, checkpoint_ns, channel, version)
);
create table coach_runtime.checkpoint_writes (
  thread_id text not null references coach_runtime.thread(thread_id) on delete cascade,
  checkpoint_ns text not null default '',
  checkpoint_id text not null,
  task_id text not null,
  idx integer not null,
  channel text not null,
  type text,
  blob bytea not null,
  task_path text not null default '',
  primary key (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);
insert into coach_runtime.checkpoint_migrations(v) values (0), (1), (2), (3), (4), (5);

alter table coach_runtime.thread enable row level security;
alter table coach_runtime.turn enable row level security;
alter table coach_runtime.checkpoints enable row level security;
alter table coach_runtime.checkpoint_blobs enable row level security;
alter table coach_runtime.checkpoint_writes enable row level security;
alter table coach_runtime.checkpoint_migrations enable row level security;

create policy owned_thread on coach_runtime.thread to coach_agent_runtime
  using (owner_id = nullif(current_setting('coach.owner', true), '')::uuid
    and thread_id = current_setting('coach.thread', true))
  with check (owner_id = nullif(current_setting('coach.owner', true), '')::uuid
    and thread_id = current_setting('coach.thread', true));
create policy owned_turn on coach_runtime.turn to coach_agent_runtime
  using (owner_id = nullif(current_setting('coach.owner', true), '')::uuid
    and conversation_id::text = current_setting('coach.thread', true))
  with check (owner_id = nullif(current_setting('coach.owner', true), '')::uuid
    and conversation_id::text = current_setting('coach.thread', true));

do $$
declare table_name text;
begin
  foreach table_name in array array['checkpoints', 'checkpoint_blobs', 'checkpoint_writes'] loop
    execute format('create policy owned_state on coach_runtime.%I to coach_agent_runtime
      using (thread_id = current_setting(''coach.thread'', true)
        and exists (select 1 from coach_runtime.thread t where t.thread_id = %I.thread_id))
      with check (thread_id = current_setting(''coach.thread'', true)
        and exists (select 1 from coach_runtime.thread t where t.thread_id = %I.thread_id))',
      table_name, table_name, table_name);
  end loop;
end $$;

grant select, insert, update, delete on coach_runtime.thread, coach_runtime.turn,
  coach_runtime.checkpoints, coach_runtime.checkpoint_blobs, coach_runtime.checkpoint_writes
  to coach_agent_runtime;

-- Admission and projection share one transaction with their runtime records.
grant select, insert, update on public.agent_thread, public.agent_message to coach_agent_runtime;
create policy runtime_conversation on public.agent_thread to coach_agent_runtime
  using (user_id = nullif(current_setting('coach.owner', true), '')::uuid
    and id::text = current_setting('coach.thread', true))
  with check (user_id = nullif(current_setting('coach.owner', true), '')::uuid
    and id::text = current_setting('coach.thread', true));
create policy runtime_projection on public.agent_message to coach_agent_runtime
  using (user_id = nullif(current_setting('coach.owner', true), '')::uuid
    and thread_id::text = current_setting('coach.thread', true))
  with check (user_id = nullif(current_setting('coach.owner', true), '')::uuid
    and thread_id::text = current_setting('coach.thread', true));
-- No checkpoint_migrations, auth.users or training-domain table grants.

-- Owner-scoped discovery survives rollout being disabled or infrastructure being offline.
create function public.agent_runtime_version(p_thread_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select runtime_version from coach_runtime.thread
  where conversation_id = p_thread_id and owner_id = (select auth.uid())
$$;
revoke all on function public.agent_runtime_version(uuid) from public, anon;
grant execute on function public.agent_runtime_version(uuid) to authenticated;

-- Older authenticated executors must not append transcript-only output after cutover.
create function coach_runtime.guard_projection() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  target := case when tg_op = 'DELETE' then old.thread_id else new.thread_id end;
  if current_setting('role', true) in ('authenticated', 'anon') and pg_trigger_depth() = 1
    and exists (select 1 from coach_runtime.thread where conversation_id = target and owner_id=(select auth.uid())) then
    raise exception 'Checkpoint-backed messages are managed by the Coach runtime';
  end if;
  if tg_op = 'UPDATE' and current_setting('role', true) in ('authenticated', 'anon')
    and exists (select 1 from coach_runtime.thread where conversation_id = old.thread_id and owner_id=(select auth.uid())) then
    raise exception 'Checkpoint-backed messages are managed by the Coach runtime';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function coach_runtime.guard_projection() from public, anon, authenticated;
create trigger protect_checkpoint_projection before insert or update or delete on public.agent_message
  for each row execute function coach_runtime.guard_projection();
