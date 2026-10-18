begin;
select no_plan();
\ir fixtures/coach-runtime.sql
insert into auth.users(id,email) values
 ('93000000-0000-0000-0000-000000000001','conversation-owner@example.test'),
 ('94000000-0000-0000-0000-000000000002','conversation-other@example.test');
\ir fixtures/coach-command.sql
set local role authenticated;
select set_config('request.jwt.claim.sub','93000000-0000-0000-0000-000000000001',true);
select pg_temp.refresh_coach(auth.uid());
create function pg_temp.open_episode(p_id uuid) returns jsonb language plpgsql as $$ declare p text; begin
 p:=pg_temp.coach_payload(auth.uid(),jsonb_build_object('operation','open_episode','episodeId',p_id,'revision',1));
 return public.open_coach_episode(p,pg_temp.coach_mac(p));
end $$;
select is(pg_temp.open_episode((select id from public.coach_episode))->>'status','ready','owned review opens a thread');
select is(pg_temp.open_episode((select id from public.coach_episode))->>'status','ready','reopening reuses the link');
select is((select count(*)::int from public.coach_episode_thread),1,'one thread link');
select is((select count(*)::int from public.agent_thread),1,'one ordinary thread');
select is((select count(*)::int from public.agent_message),1,'one deterministic seed');
select set_config('test.coach_episode_id',(select id::text from public.coach_episode limit 1),true);
select is((select role from public.agent_message),'user','seed is a review request, not an invented model reply');
select throws_ok($$insert into public.coach_episode_thread values(gen_random_uuid(),auth.uid(),gen_random_uuid(),gen_random_uuid(),1)$$,'42501',null,'direct link forgery denied');
select throws_ok($$update public.coach_episode_thread set user_id='94000000-0000-0000-0000-000000000002'$$,'42501',null,'link reassignment denied');
select throws_ok($$insert into public.coach_action_receipt(user_id) values(auth.uid())$$,'42501',null,'direct receipt creation denied');
select throws_ok($$update public.coach_action_receipt set result='{}'$$,'42501',null,'receipt editing denied');
select throws_ok($$delete from public.coach_action_receipt$$,'42501',null,'receipt deletion denied');
select throws_ok($$select private.verify_coach_action_integrity('{}',repeat('0',64))$$,'42501',null,'integrity helper is not a client capability');
select throws_ok($$select public.commit_coach_episode_action('{}',repeat('0',64))$$,'42501',null,'unsigned action rejected');
select set_config('request.jwt.claim.sub','94000000-0000-0000-0000-000000000002',true);
select is((select count(*)::int from public.coach_episode_thread),0,'other owner cannot see the link');
select is((select count(*)::int from public.coach_action_receipt),0,'other owner cannot see receipts');
select is(pg_temp.open_episode(gen_random_uuid())->>'status','unavailable','missing episode is unavailable');
select is(pg_temp.open_episode(current_setting('test.coach_episode_id')::uuid)->>'status','unavailable','foreign episode is equally unavailable');
select set_config('request.jwt.claim.sub','93000000-0000-0000-0000-000000000001',true);
delete from public.agent_message;
select is((select count(*)::int from public.coach_episode_thread),0,'deleting seed removes link');
select is((select count(*)::int from public.coach_episode),1,'deleting seed preserves episode');
select is(pg_temp.open_episode((select id from public.coach_episode))->>'status','ready','explicit reopen creates a replacement link');
select lives_ok($$select public.clear_coach_history()$$,'clear history cascades links');
select is((select count(*)::int from public.coach_episode_thread),0,'cleared links are gone');
select is((select count(*)::int from public.agent_thread),2,'clear preserves ordinary transcripts');
reset role;
select ok(bool_and(c.relrowsecurity),'both new tables enforce RLS') from pg_class c where c.oid=any(array['public.coach_episode_thread'::regclass,'public.coach_action_receipt'::regclass]);
set local role anon;
select throws_ok($$select * from public.coach_episode_thread$$,'42501',null,'anonymous links denied');
select throws_ok($$select * from public.coach_action_receipt$$,'42501',null,'anonymous receipts denied');
select throws_ok($$select public.open_coach_episode('{}','')$$,'42501',null,'anonymous open denied');
reset role;
select * from finish();
rollback;
