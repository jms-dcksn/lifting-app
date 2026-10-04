begin;

select plan(4);

set local role anon;

select ok(
  '0001' = any (public.deployment_applied_migration_versions(array['0001'])),
  'anon can see that 0001 is applied'
);

select is(
  public.deployment_applied_migration_versions(array['99999999999999']),
  '{}'::text[],
  'anon gets an empty array for a version that is not applied'
);

select throws_ok(
  $$select version from supabase_migrations.schema_migrations$$,
  '42501',
  null,
  'anon cannot read the migration ledger'
);

select throws_ok(
  $$select public.deployment_applied_migration_versions(array(select g::text from generate_series(1, 501) as g))$$,
  'P0001',
  'too many migration versions',
  'anon cannot request more than 500 versions'
);

reset role;

select * from finish();
rollback;
