-- One transaction for inserts, corrections, and explicitly confirmed date replacements.
-- Additive: existing clients and observations are unchanged.
create or replace function public.save_bodyweight_entry(
  p_entry_id uuid,
  p_logged_on date,
  p_weight numeric,
  p_replace_entry_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_target uuid;
  v_saved uuid;
begin
  if v_user is null then
    raise exception 'Sign in to log weight.' using errcode = '42501';
  end if;
  if p_logged_on is null or p_logged_on < date '0001-01-01'
     or p_logged_on > (now() at time zone 'America/Chicago')::date then
    raise exception 'Choose today or an earlier valid date.' using errcode = '22007';
  end if;
  if p_weight is null or p_weight <= 0 or p_weight > 1500 or p_weight = 'NaN'::numeric then
    raise exception 'Enter a valid bodyweight in pounds.' using errcode = '22003';
  end if;

  -- Serialize calendar writes per owner, including writes to a previously empty date.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  if p_entry_id is not null then
    perform 1 from public.bodyweight_log
      where id = p_entry_id and user_id = v_user for update;
    if not found then
      raise exception 'Reading no longer available.' using errcode = 'P0002';
    end if;
  end if;

  select id into v_target from public.bodyweight_log
    where user_id = v_user and logged_on = p_logged_on for update;
  if v_target is not null and v_target is distinct from p_entry_id then
    if p_replace_entry_id is distinct from v_target then
      raise exception 'Confirm replacement of the existing reading.' using errcode = '23505';
    end if;
    delete from public.bodyweight_log where id = v_target and user_id = v_user;
  end if;

  if p_entry_id is null then
    insert into public.bodyweight_log(user_id, logged_on, weight)
      values (v_user, p_logged_on, p_weight) returning id into v_saved;
  else
    update public.bodyweight_log set logged_on = p_logged_on, weight = p_weight, updated_at = now()
      where id = p_entry_id and user_id = v_user returning id into v_saved;
  end if;
  return v_saved;
end;
$$;

revoke all on function public.save_bodyweight_entry(uuid, date, numeric, uuid) from public, anon;
grant execute on function public.save_bodyweight_entry(uuid, date, numeric, uuid) to authenticated;
