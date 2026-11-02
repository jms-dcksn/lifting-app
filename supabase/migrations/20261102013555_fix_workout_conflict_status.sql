-- Application revision conflicts must not trigger PostgREST serialization retries.
-- The occurrence helper belongs to the migration role; save/start belong to the executor.
do $$
declare original text; patched text;
begin
  original := pg_get_functiondef('private.require_workout_occurrence(uuid,uuid,integer,bigint)'::regprocedure);
  patched := replace(original, 'errcode=''40001''', 'errcode=''PT409''');
  if patched = original then raise exception 'Workout occurrence conflict seam changed'; end if;
  execute patched;
end $$;
grant create on schema private to workout_editor_executor;
set local role workout_editor_executor;
do $$
declare signature text; original text; patched text;
begin
  foreach signature in array array[
    'private.save_workout_plan(uuid,uuid,integer,bigint,bigint,text,jsonb,uuid)',
    'private.start_workout_plan(uuid,uuid,integer,bigint,bigint,jsonb)'
  ] loop
    original := pg_get_functiondef(signature::regprocedure);
    patched := replace(original, 'errcode=''40001''', 'errcode=''PT409''');
    if patched = original then raise exception 'Workout conflict seam changed: %', signature; end if;
    execute patched;
  end loop;
end $$;
reset role;
revoke create on schema private from workout_editor_executor;
