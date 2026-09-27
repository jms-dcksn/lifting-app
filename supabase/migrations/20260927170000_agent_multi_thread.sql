-- Many agent threads per user. A thread row is written together with its first
-- message, so its title comes from that message and its id is chosen by the app
-- (the same uuid is the LangSmith metadata.thread_id).

alter table public.agent_thread add column title text;

-- Slice 0 created an empty thread whenever the chat opened. Those rows never
-- held a conversation.
delete from public.agent_thread as thread
where not exists (
  select 1 from public.agent_message as message where message.thread_id = thread.id
);

update public.agent_thread as thread
set title = left(btrim(regexp_replace(first_user.text, '\s+', ' ', 'g')), 80)
from (
  select distinct on (message.thread_id)
    message.thread_id,
    (
      select string_agg(part.value->>'text', '' order by part.ordinality)
      from jsonb_array_elements(message.parts) with ordinality as part(value, ordinality)
      where part.value->>'type' = 'text'
    ) as text
  from public.agent_message as message
  where message.role = 'user'
  order by message.thread_id, message.created_at, message.id
) as first_user
where first_user.thread_id = thread.id;

update public.agent_thread set title = 'New chat' where coalesce(title, '') = '';

alter table public.agent_thread alter column title set not null;
alter table public.agent_thread alter column id drop default;

alter table public.agent_thread drop constraint agent_thread_user_key;
alter table public.agent_thread
  add constraint agent_thread_id_user_key unique (id, user_id);

-- A message may only attach to a thread owned by the same user. RLS alone does
-- not stop a caller from pointing their own row at someone else's thread id.
alter table public.agent_message drop constraint agent_message_thread_id_fkey;
alter table public.agent_message
  add constraint agent_message_thread_owner_fkey
  foreign key (thread_id, user_id)
  references public.agent_thread (id, user_id)
  on delete cascade;

create index agent_thread_user_updated_idx
  on public.agent_thread (user_id, updated_at desc);
