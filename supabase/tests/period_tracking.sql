-- Run as postgres; synthetic users and every write are rolled back.
begin;
insert into auth.users(id, email) values
  ('b1000000-0000-0000-0000-000000000001', 'period-owner@example.test'),
  ('b1000000-0000-0000-0000-000000000002', 'period-other@example.test');
update public.profile set sex = 'female', period_tracking_enabled = true
  where id = 'b1000000-0000-0000-0000-000000000001';
insert into public.period_observation(id, user_id, observed_on) values
  ('b1000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000001', '2024-03-01'),
  ('b1000000-0000-0000-0000-000000000021', 'b1000000-0000-0000-0000-000000000002', '2024-03-01');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  assert (select count(*) from public.period_observation) = 1, 'ownership isolates reads';
  begin
    insert into public.period_observation(user_id, observed_on)
      values ('b1000000-0000-0000-0000-000000000002', '2024-03-02');
    raise exception 'cross-user insert accepted';
  exception when others then
    if sqlerrm = 'cross-user insert accepted' then raise; end if;
  end;
  delete from public.period_observation where id = 'b1000000-0000-0000-0000-000000000021';
  assert not found, 'cross-user delete denied';
  begin
    insert into public.period_observation(user_id, observed_on)
      values ('b1000000-0000-0000-0000-000000000001', '2024-03-01');
    raise exception 'duplicate observation accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.period_observation(user_id, observed_on)
      values ('b1000000-0000-0000-0000-000000000001', current_date + 1);
    raise exception 'future observation accepted';
  exception when check_violation then null; end;
  insert into public.period_observation(user_id, observed_on)
    values ('b1000000-0000-0000-0000-000000000001', '2024-03-02');
  assert (select count(*) from public.period_observation) = 2, 'own insert allowed';
  delete from public.period_observation where observed_on = '2024-03-02';
  assert (select count(*) from public.period_observation) = 1, 'own delete allowed';
end;
$$;
reset role;
select 'PASS: period observation ownership, uniqueness, future-date denial' as result;
rollback;
