create function public.deployment_applied_migration_versions(requested_versions text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap constant integer := 500;
begin
  if requested_versions is null then
    return '{}'::text[];
  end if;
  if cardinality(requested_versions) > v_cap then
    raise exception 'too many migration versions';
  end if;
  return coalesce(
    array(
      select v
      from unnest(requested_versions) as requested(v)
      where v ~ '^[0-9]+$'
        and exists (
          select 1
          from supabase_migrations.schema_migrations as s
          where s.version = v
        )
      group by v
      order by v
    ),
    '{}'::text[]
  );
end;
$$;

revoke all on function public.deployment_applied_migration_versions(text[]) from public, anon, authenticated;
grant execute on function public.deployment_applied_migration_versions(text[]) to anon;
