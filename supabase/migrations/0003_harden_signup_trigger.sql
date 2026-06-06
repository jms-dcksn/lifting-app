-- Security advisor hardening for the signup trigger from 0001:
-- pin search_path (was mutable) and stop the SECURITY DEFINER function being RPC-callable.
-- The trigger still fires on auth.users insert; only direct /rpc/ access is removed.

create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profile (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function handle_new_user() from public, anon, authenticated;
