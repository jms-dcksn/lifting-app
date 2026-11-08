begin;
select no_plan();
-- Keep pgTAP outside the runtime role; it must not need extension schema access.
create function pg_temp.as_coach_runtime(p_sql text) returns jsonb language plpgsql as $$
declare result jsonb;
begin
  set local role coach_agent_runtime;
  if p_sql ~* '^select ' then execute p_sql into result;
  else execute p_sql; end if;
  reset role;
  return result;
exception when others then reset role; raise;
end $$;

insert into auth.users(id,email) values
 ('96000000-0000-0000-0000-000000000001','checkpoint-owner@example.test'),
 ('96000000-0000-0000-0000-000000000002','checkpoint-other@example.test');
insert into public.agent_thread(id,user_id,title) values
 ('96000000-0000-0000-0000-000000000011','96000000-0000-0000-0000-000000000001','Owner'),
 ('96000000-0000-0000-0000-000000000022','96000000-0000-0000-0000-000000000002','Other');
insert into public.agent_message(id,thread_id,user_id,role,parts) values
 ('96000000-0000-0000-0000-000000000111','96000000-0000-0000-0000-000000000011','96000000-0000-0000-0000-000000000001','user','[]');
insert into coach_runtime.thread(conversation_id,owner_id,runtime_version) values
 ('96000000-0000-0000-0000-000000000011','96000000-0000-0000-0000-000000000001','coach-deep-v1'),
 ('96000000-0000-0000-0000-000000000022','96000000-0000-0000-0000-000000000002','coach-deep-v1');
insert into coach_runtime.checkpoints(thread_id,checkpoint_id,checkpoint) values
 ('96000000-0000-0000-0000-000000000011','fixture','{}'),
 ('96000000-0000-0000-0000-000000000022','fixture','{}');
insert into coach_runtime.turn(request_id,owner_id,conversation_id,payload_hash,input_message_id,status,epoch)
 values('96000000-0000-0000-0000-000000001111','96000000-0000-0000-000000000001','96000000-0000-0000-0000-000000000011',repeat('a',64),'96000000-0000-0000-0000-000000000111','accepted',1);

set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
select is(public.agent_runtime_version('96000000-0000-0000-0000-000000000011'),'coach-deep-v1','owner can discover runtime version');
select is(public.agent_runtime_version('96000000-0000-0000-0000-000000000022'),null,'foreign runtime is not disclosed');
select throws_ok($$select * from coach_runtime.checkpoints$$,'42501',null,'client cannot read private checkpoints');
select throws_ok($$insert into public.agent_message(thread_id,user_id,role,parts) values('96000000-0000-0000-0000-000000000011','96000000-0000-0000-0000-000000000001','user','[]')$$,'P0001',null,'legacy executor cannot append to a checkpoint thread');
select throws_ok($$update public.agent_message set parts='[]' where id='96000000-0000-0000-0000-000000000111'$$,'P0001',null,'checkpoint projection is immutable to the client');
reset role;

select set_config('coach.owner','96000000-0000-0000-0000-000000000001',true);
select set_config('coach.thread','96000000-0000-0000-0000-000000000011',true);
select is(pg_temp.as_coach_runtime('select to_jsonb(count(*)) from coach_runtime.checkpoints')::int,1,'runtime reads only the scoped owner/thread');
select throws_ok($$select pg_temp.as_coach_runtime('select * from public.program')$$,'42501',null,'runtime has no training read authority');
select throws_ok($$select pg_temp.as_coach_runtime('select * from auth.users')$$,'42501',null,'runtime has no Auth authority');
select throws_ok($$select pg_temp.as_coach_runtime('select * from coach_runtime.checkpoint_migrations')$$,'42501',null,'runtime cannot use native DDL ledger');
select throws_ok($$select pg_temp.as_coach_runtime('create table coach_runtime.forbidden(id int)')$$,'42501',null,'runtime cannot create tables');
select is(pg_temp.as_coach_runtime('select to_jsonb(count(*)) from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)')::int,0,'runtime cannot bypass RLS');
select throws_ok($$select pg_temp.as_coach_runtime('insert into coach_runtime.checkpoints(thread_id,checkpoint_id,checkpoint) values(''96000000-0000-0000-0000-000000000022'',''forbidden'',''{}'')')$$,'42501',null,'runtime cannot write another thread');
select pg_temp.as_coach_runtime('delete from coach_runtime.checkpoints where thread_id=''96000000-0000-0000-0000-000000000022''');
select is((select count(*)::int from coach_runtime.checkpoints where thread_id='96000000-0000-0000-0000-000000000022'),1,'foreign checkpoint survives unauthorized deletion');

set local role authenticated;
select lives_ok($$delete from public.agent_thread where id='96000000-0000-0000-0000-000000000011'$$,'owned thread deletion still cascades');
reset role;
select is((select count(*)::int from coach_runtime.thread where conversation_id='96000000-0000-0000-0000-000000000011'),0,'thread deletion removes runtime binding');
select is((select count(*)::int from coach_runtime.turn),0,'thread deletion removes accepted input receipt');
select is((select count(*)::int from coach_runtime.checkpoints),1,'thread cleanup preserves other owner');
select * from finish();
rollback;
