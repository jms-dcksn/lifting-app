-- Fixed synthetic key is only a transaction-scoped test fixture.
insert into private.coach_command_key(key_id,key,valid_from,valid_until)
 values('pgtap-only',decode(repeat('11',32),'hex'),now()-interval '1 hour',now()+interval '1 hour');
create function pg_temp.coach_payload(p_owner uuid,p_extra jsonb default '{}'::jsonb) returns text
language sql security definer as $$
 select (jsonb_build_object('owner',p_owner,'operation','refresh','version','episodes-v1','policyVersion','1.0','keyId','pgtap-only',
  'issuedAt',statement_timestamp(),'expiresAt',statement_timestamp()+interval '60 seconds','allowArrival',true,
  'sourceRevision',coalesce(s.source_revision,0),'stateVersion',coalesce(s.state_version,0),'preferencesVersion',coalesce(p.version,0),
  'episodes',jsonb_build_array(jsonb_build_object('contextKey','session_pain:v1','family','session_pain','occurrence',1,'revision',1,'state','open','validity','current',
   'evidence',null,'fingerprint','fixture','attentionHistory',jsonb_build_array('pain:session'),'frontier',jsonb_build_array('session'),'terminalReason',null,'snoozeSourceIds',null)),
  'notices',jsonb_build_array(jsonb_build_object('contextKey','session_pain:v1','occurrence',1,'attentionKey','pain:session','category','pain','title','Pain review','body','Review significant pain','evidence',jsonb_build_object('test',true))))||p_extra)::text
 from (select p_owner as user_id) u left join public.coach_refresh_state s on s.user_id=u.user_id left join public.coach_preferences p on p.user_id=u.user_id
$$;
create function pg_temp.coach_mac(p text) returns text language sql security definer as $$ select encode(extensions.hmac(convert_to(p,'UTF8'),decode(repeat('11',32),'hex'),'sha256'),'hex') $$;
create function pg_temp.refresh_coach(p_owner uuid,p_extra jsonb default '{}'::jsonb) returns jsonb language plpgsql as $$ declare p text; begin
 p:=pg_temp.coach_payload(p_owner,p_extra); return public.reconcile_coach_episodes(p,pg_temp.coach_mac(p)); end $$;
