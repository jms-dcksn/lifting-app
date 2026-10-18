-- Preserve the Coach source-lock contract when extending the atomic program save RPC.
-- Amend the live definition so superset validation and all existing behavior stay intact.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.save_program(jsonb)'::regprocedure);
  if definition !~* E'begin\\s+perform private\\.lock_coach_source\\(\\)' then
    definition := regexp_replace(definition, E'(?i)\\mbegin\\M', E'begin\n  perform private.lock_coach_source();');
    execute definition;
  end if;
end;
$$;
