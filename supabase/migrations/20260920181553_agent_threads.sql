-- One conversation thread per user. Messages store JSON parts so tool calls
-- survive a reload. The UI reads the full transcript; the model only sees last N.

create table public.agent_thread (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_thread_user_key unique (user_id)
);

create table public.agent_message (
  id         uuid primary key default uuid_generate_v4(),
  thread_id  uuid not null references public.agent_thread on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       text not null,
  parts      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint agent_message_role_check check (role in ('user', 'assistant', 'tool')),
  constraint agent_message_parts_array check (jsonb_typeof(parts) = 'array')
);

create index agent_message_thread_created_idx
  on public.agent_message (thread_id, created_at);

alter table public.agent_thread enable row level security;
alter table public.agent_message enable row level security;

create policy "users manage own agent threads"
on public.agent_thread
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users manage own agent messages"
on public.agent_message
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.agent_thread to authenticated;
grant select, insert, update, delete on table public.agent_message to authenticated;
