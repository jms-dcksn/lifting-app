-- Run as postgres; synthetic users and every write are rolled back.
begin;
insert into auth.users(id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'calendar-owner@example.test'),
  ('a1000000-0000-0000-0000-000000000002', 'calendar-other@example.test');
insert into public.bodyweight_log(id, user_id, logged_on, weight) values
  ('a1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', '2024-02-29', 150),
  ('a1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', '2024-03-01', 151),
  ('a1000000-0000-0000-0000-000000000021', 'a1000000-0000-0000-0000-000000000002', '2024-02-29', 200);

-- Inject a failure after replacement deletes its destination, to prove transaction rollback.
create function pg_temp.fail_calendar_test_update() returns trigger language plpgsql as $$
begin raise exception 'injected failure'; end;
$$;
create trigger calendar_test_failure before update on public.bodyweight_log
for each row when (new.user_id = 'a1000000-0000-0000-0000-000000000001' and new.weight = 1234.56)
execute function pg_temp.fail_calendar_test_update();

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare v_id uuid;
begin
  assert not has_function_privilege('anon', 'public.save_bodyweight_entry(uuid,date,numeric,uuid)', 'EXECUTE'), 'anonymous RPC denied';
  assert (select count(*) from public.bodyweight_log) = 2, 'ownership isolates reads';
  begin
    perform public.save_bodyweight_entry('a1000000-0000-0000-0000-000000000021', '2024-04-01', 199);
    raise exception 'cross-user edit accepted';
  exception when no_data_found then null; end;
  begin
    perform public.save_bodyweight_entry(null, '2024-02-29', 149);
    raise exception 'unconfirmed overwrite accepted';
  exception when unique_violation then null; end;
  begin
    perform public.save_bodyweight_entry(null, (now() at time zone 'America/Chicago')::date + 1, 149);
    raise exception 'future observation accepted';
  exception when invalid_datetime_format then null; end;
  begin
    perform public.save_bodyweight_entry(null, '2024-02-30'::date, 149);
    raise exception 'impossible observation accepted';
  exception when datetime_field_overflow then null; end;
  begin
    perform public.save_bodyweight_entry(null, '2024-04-01', 'NaN'::numeric);
    raise exception 'NaN accepted';
  exception when numeric_value_out_of_range then null; end;
  begin
    perform public.save_bodyweight_entry('a1000000-0000-0000-0000-000000000011', '2024-03-01', 149);
    raise exception 'unconfirmed move accepted';
  exception when unique_violation then null; end;
  begin
    perform public.save_bodyweight_entry('a1000000-0000-0000-0000-000000000011', '2024-03-01', 1234.56,
      'a1000000-0000-0000-0000-000000000012');
    raise exception 'injected failure did not run';
  exception when raise_exception then
    if sqlerrm <> 'injected failure' then raise; end if;
  end;
  assert (select weight from public.bodyweight_log where logged_on = '2024-02-29') = 150, 'failed move retains source';
  assert (select weight from public.bodyweight_log where logged_on = '2024-03-01') = 151, 'failed move restores destination';
  v_id := public.save_bodyweight_entry('a1000000-0000-0000-0000-000000000011', '2024-03-01', 149,
    'a1000000-0000-0000-0000-000000000012');
  assert v_id = 'a1000000-0000-0000-0000-000000000011', 'move preserves source identity';
  assert (select count(*) from public.bodyweight_log) = 1, 'confirmed move leaves one reading';
  assert (select weight from public.bodyweight_log where id = v_id) = 149, 'confirmed move saves value';
  v_id := public.save_bodyweight_entry(null, '2024-02-29', 155);
  assert (select weight from public.bodyweight_log order by logged_on desc limit 1) = 149, 'backfill does not become newest';
  delete from public.bodyweight_log where id = v_id;
  assert (select count(*) from public.bodyweight_log) = 1, 'own reading removable';
  delete from public.bodyweight_log where id = 'a1000000-0000-0000-0000-000000000021';
  assert not found, 'cross-user delete denied';
end;
$$;
reset role;
select 'PASS: calendar ownership, validation, explicit replacement, atomic rollback, latest-date and deletion checks' as result;
rollback;
