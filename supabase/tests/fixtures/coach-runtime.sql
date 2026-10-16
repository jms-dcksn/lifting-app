-- Supabase's installer cannot delegate auth/extensions schema access. Exercise
-- the runtime boundary even on a superuser-owned local PostgreSQL fixture.
revoke all on schema auth, extensions from coach_executor;
revoke all on auth.users from coach_executor;
select ok(not has_schema_privilege('coach_executor','auth','USAGE'), 'executor needs no auth schema access');
select ok(not has_schema_privilege('coach_executor','extensions','USAGE'), 'executor needs no extensions schema access');
