-- 20261027173401 replaces private.validate_workout_editor and private.start_workout_plan
-- after 20261027010327 patches the previous bodies. Reapply those tempo seams onto the
-- definitions that migration leaves behind. Already-patched current bodies are left as-is,
-- so an on-top application of 20261027010327 does not get a second copy of the same text.
-- 20261027010327 keeps its version prefix; this file is the sort order after main.

grant create on schema private to workout_editor_executor;
do $$ declare body text; original text; begin
  if to_regprocedure('private.validate_workout_editor(jsonb,uuid,boolean)') is null then
    raise exception 'Plan tempo validation seam changed';
  end if;
  original:=pg_get_functiondef('private.validate_workout_editor(jsonb,uuid,boolean)'::regprocedure);
  if position($find$'tempo','resolvedTempo'$find$ in original)=0 then
    body:=replace(original,$find$'sets','normalSets'$find$,$replacement$'sets','normalSets','tempo','resolvedTempo'$replacement$);
    body:=replace(body,$find$perform (s->>'id')::uuid;$find$,$replacement$
    if not public.is_valid_exercise_tempo(s->'tempo') or not public.is_valid_exercise_tempo(s->'resolvedTempo') then raise exception 'Enter four non-negative whole seconds'; end if;
    perform (s->>'id')::uuid;$replacement$);
    if body=original or position($find$'tempo','resolvedTempo'$find$ in body)=0 then raise exception 'Plan tempo validation seam changed'; end if;
    execute body;
  end if;
end $$;

set local role workout_editor_executor;
do $$ declare body text; original text; begin
  original:=pg_get_functiondef('private.start_workout_plan(uuid,uuid,integer,bigint,bigint,jsonb)'::regprocedure);
  if position('resolvedTempo' in original)=0 then
    body:=replace(original,'tree:=coalesce(saved.plan,p_plan);',$replacement$tree:=coalesce(saved.plan,p_plan);
  -- Freeze resolved defaults even for saved pre-tempo plans. Only tempo is read from
  -- the matching current plan; its other saved prescription fields remain authoritative.
  tree:=jsonb_set(tree,'{slots}',(select jsonb_agg(slot || jsonb_build_object('resolvedTempo',
    coalesce(nullif(slot->'tempo','null'::jsonb),
      (select input->'resolvedTempo' from jsonb_array_elements(p_plan->'slots') input
        where input->>'id'=slot->>'id' and input->>'exerciseId'=slot->>'exerciseId'),
      '[2,0,1,0]'::jsonb)) order by ordinal)
    from jsonb_array_elements(tree->'slots') with ordinality as entries(slot,ordinal)));$replacement$);
    if body=original or position('resolvedTempo' in body)=0 then raise exception 'Start tempo snapshot seam changed'; end if;
    execute body;
  end if;
end $$;
reset role;
revoke create on schema private from workout_editor_executor;
