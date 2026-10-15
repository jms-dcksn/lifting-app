begin;
select no_plan();
-- Supabase's installer cannot delegate auth/extensions schema access. Exercise
-- the runtime boundary even on a superuser-owned local PostgreSQL fixture.
revoke all on schema auth, extensions from coach_executor;
revoke all on auth.users from coach_executor;
select ok(not has_schema_privilege('coach_executor','auth','USAGE'), 'executor needs no auth schema access');
select ok(not has_schema_privilege('coach_executor','extensions','USAGE'), 'executor needs no extensions schema access');
insert into auth.users(id,email) values
 ('91000000-0000-0000-0000-000000000001','coach-owner@example.test'),
 ('92000000-0000-0000-0000-000000000002','coach-other@example.test');
-- Fixed synthetic key is only a transaction-scoped test fixture.
insert into private.coach_command_key(key_id,key,valid_from,valid_until)
 values('pgtap-only',decode(repeat('11',32),'hex'),now()-interval '1 hour',now()+interval '1 hour');
create function pg_temp.coach_payload(p_owner uuid,p_extra jsonb default '{}'::jsonb) returns text
language sql security definer as $$
 select (jsonb_build_object('owner',p_owner,'operation','refresh','version','episodes-v1','policyVersion','1.0','keyId','pgtap-only',
  'issuedAt',clock_timestamp(),'expiresAt',clock_timestamp()+interval '60 seconds','allowArrival',true,
  'sourceRevision',coalesce(s.source_revision,0),'stateVersion',coalesce(s.state_version,0),'preferencesVersion',coalesce(p.version,0),
  'episodes',jsonb_build_array(jsonb_build_object('contextKey','session_pain:v1','family','session_pain','occurrence',1,'revision',1,'state','open','validity','current',
   'evidence',null,'fingerprint','fixture','attentionHistory',jsonb_build_array('pain:session'),'frontier',jsonb_build_array('session'),'terminalReason',null,'snoozeSourceIds',null)),
  'notices',jsonb_build_array(jsonb_build_object('contextKey','session_pain:v1','occurrence',1,'attentionKey','pain:session','category','pain','title','Pain review','body','Review significant pain','evidence',jsonb_build_object('test',true))))||p_extra)::text
 from (select p_owner as user_id) u left join public.coach_refresh_state s on s.user_id=u.user_id left join public.coach_preferences p on p.user_id=u.user_id
$$;
create function pg_temp.coach_mac(p text) returns text language sql security definer as $$ select encode(extensions.hmac(convert_to(p,'UTF8'),decode(repeat('11',32),'hex'),'sha256'),'hex') $$;
create function pg_temp.refresh_coach(p_owner uuid,p_extra jsonb default '{}'::jsonb) returns jsonb language plpgsql as $$ declare p text; begin
 p:=pg_temp.coach_payload(p_owner,p_extra); return public.reconcile_coach_episodes(p,pg_temp.coach_mac(p)); end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
select throws_ok($$select private.coach_auth_uid()$$,'42501',null,'client cannot call the Auth identity adapter');
select throws_ok($$select private.coach_auth_user_ids(null)$$,'42501',null,'client cannot enumerate Auth owners');
select throws_ok($$select private.coach_hmac('forged',decode(repeat('11',32),'hex'))$$,'42501',null,'client cannot call the HMAC adapter');
select is(pg_temp.refresh_coach(auth.uid())->>'status','ready','owner can reconcile a signed current evaluation');
select is((select count(*)::int from public.coach_episode),1,'one owned episode');
select is((select count(*)::int from public.coach_notice),1,'one bootstrap notice');
select is((select arrival_state from public.coach_notice),'suppressed','bootstrap suppresses arrival');
select is(pg_temp.refresh_coach(auth.uid())->>'status','ready','repeat refresh succeeds');
select is((select count(*)::int from public.coach_notice),1,'replay deduplicates notice');
select throws_ok($$insert into public.coach_episode(user_id,context_key,family,occurrence,revision,state,validity,data) values(auth.uid(),'forged','session_pain',1,1,'open','current','{}')$$,'42501',null,'direct derived insert denied');
select throws_ok($$update public.coach_episode set user_id='92000000-0000-0000-0000-000000000002'$$,'42501',null,'derived ownership reassignment denied');
select throws_ok($$update public.coach_refresh_state set source_revision=0$$,'42501',null,'revision forgery denied');
select throws_ok($$select * from private.coach_command_key$$,'42501',null,'signing key cannot be read');
select throws_ok($$select public.reconcile_coach_episodes('{}',repeat('0',64))$$,'42501',null,'unsigned command denied');
select throws_ok($$select private.reconcile_coach_episodes('{}',repeat('0',64))$$,'42501',null,'direct private executor has identical guards');
select throws_ok($$select pg_temp.refresh_coach('92000000-0000-0000-0000-000000000002')$$,'42501',null,'correct signature cannot change owner');
select throws_ok($$select pg_temp.refresh_coach(auth.uid(),'{"operation":"pain_end"}')$$,'42501',null,'wrong operation denied');
select throws_ok($$select pg_temp.refresh_coach(auth.uid(),'{"version":"future"}')$$,'42501',null,'unsupported version denied');
select throws_ok($$select pg_temp.refresh_coach(auth.uid(),jsonb_build_object('issuedAt',now()-interval '2 minutes','expiresAt',now()-interval '1 minute'))$$,'42501',null,'expired command denied');
select is(pg_temp.refresh_coach(auth.uid(),'{"sourceRevision":-1}')->>'status','refresh_required','stale source cannot overwrite evidence');
select lives_ok($$select public.mark_coach_notice((select id from public.coach_notice limit 1),true)$$,'owner can acknowledge');
select ok((select read_at is not null and acknowledged_at is not null from public.coach_notice),'read and acknowledgment persisted');
select is((select state from public.coach_episode),'open','acknowledging never resolves pain');
select lives_ok($$select public.save_coach_preferences('{"pain":false,"reduction":true,"plateau":true,"decline":true,"quietEnabled":true,"quietStart":1320,"quietEnd":420,"timeZone":"America/Chicago"}',0)$$,'owner saves category and overnight quiet hours');
select throws_ok($$select public.save_coach_preferences('{"pain":true,"reduction":true,"plateau":true,"decline":true,"quietEnabled":false,"quietStart":1320,"quietEnd":420,"timeZone":"America/Chicago"}',0)$$,'40001',null,'preferences use compare-and-swap');
select throws_ok($$select public.save_coach_preferences('{"pain":true,"reduction":true,"plateau":true,"decline":true,"quietEnabled":true,"quietStart":420,"quietEnd":420,"timeZone":"America/Chicago"}',1)$$,'P0001',null,'equal quiet hours rejected');
select set_config('request.jwt.claim.sub','92000000-0000-0000-0000-000000000002',true);
select is((select count(*)::int from public.coach_notice),0,'other user sees no notice/evidence');
select is((select count(*)::int from public.coach_episode),0,'other user sees no episode');
select is((select count(*)::int from public.coach_preferences),0,'other user sees no preferences');
select is((select count(*)::int from public.coach_refresh_state),1,'other user sees only own revision state');
select lives_ok($$select public.clear_coach_history()$$,'other user can clear only their own history');
select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',true);
select is((select count(*)::int from public.coach_notice),1,'other user clear preserved owner notice');
-- Quiet-hours tests use the database clock, so they work at any CI time or timezone.
select lives_ok($$select public.save_coach_preferences(jsonb_build_object('pain',true,'reduction',true,'plateau',true,'decline',true,'quietEnabled',true,'quietStart',((extract(hour from now() at time zone 'UTC')::int*60+extract(minute from now() at time zone 'UTC')::int)+1439)%1440,'quietEnd',((extract(hour from now() at time zone 'UTC')::int*60+extract(minute from now() at time zone 'UTC')::int)+1)%1440,'timeZone','UTC'),1)$$,'configure quiet hours around the current database minute');
select is(pg_temp.refresh_coach(auth.uid(),jsonb_build_object('notices',jsonb_build_array(jsonb_build_object('contextKey','session_pain:v1','occurrence',1,'attentionKey','pain:quiet','category','pain','title','Quiet test','body','Synthetic test','evidence',jsonb_build_object('test',true)))))->>'arrival',null::text,'quiet hours defer arrival');
select is((select arrival_state from public.coach_notice where attention_key='pain:quiet'),'pending','quiet notice remains in persistent inbox');
select lives_ok($$select public.save_coach_preferences(jsonb_set((select settings from public.coach_preferences),'{quietEnabled}','false'),2)$$,'disable quiet hours without changing training');
select is(pg_temp.refresh_coach(auth.uid())->'arrival'->>'title','Quiet test','foreground refresh delivers the revalidated deferred arrival');
select is(pg_temp.refresh_coach(auth.uid())->>'arrival',null::text,'arrival is claimed at most once');
select throws_ok($$select public.reconcile_coach_episodes(pg_temp.coach_payload(auth.uid()),null)$$,'42501',null,'null MAC cannot bypass authentication');
select throws_ok($$select pg_temp.refresh_coach(auth.uid(),'{"issuedAt":null}')$$,'42501',null,'missing command timestamp rejected');
select throws_ok($$select pg_temp.refresh_coach(auth.uid(),'{"policyVersion":"future"}')$$,'42501',null,'unknown policy rejected');
select throws_ok($$select pg_temp.refresh_coach(auth.uid(),jsonb_build_object('issuedAt',now()+interval '10 seconds','expiresAt',now()+interval '60 seconds'))$$,'42501',null,'future issued timestamp rejected');
select throws_ok($$select public.mark_coach_notice('92000000-0000-0000-0000-000000000099',true)$$,'P0002',null,'foreign and missing notice have same unavailable response');
select throws_ok($$update public.coach_preferences set user_id='92000000-0000-0000-0000-000000000002'$$,'42501',null,'preference owner cannot be reassigned');
select throws_ok($$delete from public.coach_notice$$,'42501',null,'derived notices cannot be deleted directly');
select lives_ok($$do $inner$ declare p text; begin p:=pg_temp.coach_payload(auth.uid(),jsonb_build_object('operation','pain_end','episodeId',(select id from public.coach_episode limit 1),'episodeRevision',1)); perform public.end_coach_pain_episode(p,pg_temp.coach_mac(p)); end $inner$ $$,'explicit signed pain end succeeds');
select is((select state from public.coach_episode),'resolved','pain end records resolved lifecycle');
select is((select data->>'terminalReason' from public.coach_episode),'user_reported_ended','pain end states user report, not medical recovery');
select is((select count(*)::int from public.workout_session),0,'pain end does not create training writes');
select lives_ok($$insert into public.workout_session(id,user_id) values('91000000-0000-0000-0000-000000000011',auth.uid())$$,'training insert remains available');
select ok((select source_revision>0 from public.coach_refresh_state),'source mutation invalidates reconciliation');
select lives_ok($$select public.clear_coach_history()$$,'owner can clear own Coach history');
select is((select count(*)::int from public.coach_notice),0,'clear cascades derived notices');
select is((select count(*)::int from public.workout_session),1,'clear preserves actual training');
reset role;
select ok(not (select rolbypassrls or rolcanlogin or rolsuper from pg_roles where rolname='coach_executor'),'executor has no login/superuser/RLS bypass');
select ok(bool_and(not has_table_privilege('authenticated',c.oid,'INSERT') and not has_table_privilege('authenticated',c.oid,'UPDATE') and not has_table_privilege('authenticated',c.oid,'DELETE')), 'all derived direct writes denied') from pg_class c where c.oid=any(array['public.coach_episode'::regclass,'public.coach_notice'::regclass,'public.coach_refresh_state'::regclass]);
select ok(bool_and(c.relrowsecurity),'all Coach tables have RLS') from pg_class c where c.oid=any(array['public.coach_episode'::regclass,'public.coach_notice'::regclass,'public.coach_refresh_state'::regclass,'public.coach_preferences'::regclass]);
select ok(count(*)=12,'all twelve authoritative tables have statement-before-row invalidation locks') from pg_trigger where tgname='coach_source_lock';
set local role anon;
select throws_ok($$select * from public.coach_episode$$,'42501',null,'anonymous episode access denied');
select throws_ok($$select public.clear_coach_history()$$,'42501',null,'anonymous mutation denied');
select throws_ok($$select private.reconcile_coach_episodes('{}',repeat('0',64))$$,'42501',null,'anonymous private RPC denied');
reset role;
delete from auth.users where id='91000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.coach_preferences where user_id='91000000-0000-0000-0000-000000000001'),0,'account deletion cascades preferences without source-trigger failure');
select * from finish();
rollback;
