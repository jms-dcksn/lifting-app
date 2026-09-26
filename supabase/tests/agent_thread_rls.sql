begin;

select plan(8);

insert into auth.users (id, email)
values
  ('51000000-0000-0000-0000-000000000001', 'agent-owner@example.test'),
  ('52000000-0000-0000-0000-000000000002', 'agent-other@example.test');

insert into public.agent_thread (id, user_id)
values
  ('51000000-0000-0000-0000-000000000011', '51000000-0000-0000-0000-000000000001'),
  ('52000000-0000-0000-0000-000000000022', '52000000-0000-0000-0000-000000000002');

insert into public.agent_message (id, thread_id, user_id, role, parts)
values
  (
    '51000000-0000-0000-0000-000000000111',
    '51000000-0000-0000-0000-000000000011',
    '51000000-0000-0000-0000-000000000001',
    'user',
    '[{"type":"text","text":"how was this week?"}]'::jsonb
  ),
  (
    '52000000-0000-0000-0000-000000000222',
    '52000000-0000-0000-0000-000000000022',
    '52000000-0000-0000-0000-000000000002',
    'user',
    '[{"type":"text","text":"secret"}]'::jsonb
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.agent_thread),
  1,
  'a user can read only their own agent thread'
);

select is(
  (select count(*)::int from public.agent_message),
  1,
  'a user can read only their own agent messages'
);

insert into public.agent_message (thread_id, user_id, role, parts)
values (
  '51000000-0000-0000-0000-000000000011',
  '51000000-0000-0000-0000-000000000001',
  'assistant',
  '[{"type":"text","text":"from weeklyCoach"}]'::jsonb
);

select is(
  (select count(*)::int from public.agent_message),
  2,
  'a user can insert a message on their own thread'
);

select throws_ok(
  $$insert into public.agent_thread (user_id) values ('52000000-0000-0000-0000-000000000002')$$,
  '42501',
  null,
  'a user cannot create a thread for another user'
);

select throws_ok(
  $$insert into public.agent_message (thread_id, user_id, role, parts) values ('52000000-0000-0000-0000-000000000022', '52000000-0000-0000-0000-000000000002', 'user', '[{"type":"text","text":"nope"}]'::jsonb)$$,
  '42501',
  null,
  'a user cannot insert a message for another user'
);

select throws_ok(
  $$insert into public.agent_thread (user_id) values ('51000000-0000-0000-0000-000000000001')$$,
  '23505',
  null,
  'a user may have only one agent thread'
);

update public.agent_message
set parts = '[{"type":"text","text":"updated"}]'::jsonb
where id = '51000000-0000-0000-0000-000000000111';

select is(
  (select parts->>'ignored' is null from public.agent_message where id = '51000000-0000-0000-0000-000000000111'),
  true,
  'a user can update their own message'
);

select is(
  (select parts->0->>'text' from public.agent_message where id = '51000000-0000-0000-0000-000000000111'),
  'updated',
  'own-message update writes the new parts'
);

select * from finish();
rollback;
