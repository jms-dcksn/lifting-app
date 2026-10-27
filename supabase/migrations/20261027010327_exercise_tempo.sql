-- Nullable additive fields preserve the distinction between inherited prescriptions and
-- historical sets for which no performed tempo was recorded.
create function public.is_valid_exercise_tempo(value jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare phase jsonb;
begin
  if value is null or value='null'::jsonb then return true; end if;
  if jsonb_typeof(value)<>'array' or jsonb_array_length(value)<>4 then return false; end if;
  for phase in select jsonb_array_elements(value) loop
    if jsonb_typeof(phase)<>'number' then return false; end if;
    if phase::numeric<0 or phase::numeric>9007199254740991 or phase::numeric<>trunc(phase::numeric) then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.is_valid_exercise_tempo(jsonb) from public,anon;
grant execute on function public.is_valid_exercise_tempo(jsonb) to authenticated,workout_editor_executor,coach_executor,service_role;
alter table public.program_slot add column tempo jsonb check(public.is_valid_exercise_tempo(tempo));
alter table public.set_log add column tempo jsonb check(public.is_valid_exercise_tempo(tempo));

-- Extend the existing atomic boundaries without replacing their locking, receipts,
-- retirement, ownership or normal/recovery prescription reconciliation.
do $$ declare body text; original text; begin
  original:=pg_get_functiondef('public.save_program(jsonb)'::regprocedure);
  body:=replace(original,'plateau_patience, superset_group','plateau_patience, superset_group, tempo');
  body:=replace(body,$find$nullif(trim(v_slot->>'supersetGroup'), '')$find$,$replacement$nullif(trim(v_slot->>'supersetGroup'), ''), nullif(v_slot->'tempo','null'::jsonb)$replacement$);
  body:=replace(body,'superset_group = excluded.superset_group,','tempo = excluded.tempo, superset_group = excluded.superset_group,');
  if body=original or position('tempo = excluded.tempo' in body)=0 then raise exception 'Program tempo seam changed'; end if;
  execute body;

  original:=pg_get_functiondef('private.validate_workout_editor(jsonb,uuid)'::regprocedure);
  body:=replace(original,$find$'sets','normalSets'$find$,$replacement$'sets','normalSets','tempo','resolvedTempo'$replacement$);
  body:=replace(body,$find$perform (s->>'id')::uuid;$find$,$replacement$
    if not public.is_valid_exercise_tempo(s->'tempo') or not public.is_valid_exercise_tempo(s->'resolvedTempo') then raise exception 'Enter four non-negative whole seconds'; end if;
    perform (s->>'id')::uuid;$replacement$);
  if body=original then raise exception 'Plan tempo validation seam changed'; end if;
  execute body;

end $$;

-- The executor role owns these functions and deliberately does not inherit into the
-- migration role. Replace them as their owner, granting schema CREATE only here.
grant create on schema private to workout_editor_executor;
set local role workout_editor_executor;
do $$ declare body text; original text; begin
  original:=pg_get_functiondef('private.save_workout_plan(uuid,uuid,integer,bigint,bigint,text,jsonb,uuid)'::regprocedure);
  body:=replace(original,'superset_group,set_prescriptions)','superset_group,set_prescriptions,tempo)');
  body:=replace(body,$find$s->>'supersetGroup',coalesce(s->'normalSets',s->'sets'))$find$,$replacement$s->>'supersetGroup',coalesce(s->'normalSets',s->'sets'),nullif(s->'tempo','null'::jsonb))$replacement$);
  body:=replace(body,'set_prescriptions=excluded.set_prescriptions,','tempo=excluded.tempo,set_prescriptions=excluded.set_prescriptions,');
  if body=original then raise exception 'Plan tempo persistence seam changed'; end if;
  execute body;

  original:=pg_get_functiondef('private.start_workout_plan(uuid,uuid,integer,bigint,bigint,jsonb)'::regprocedure);
  body:=replace(original,'tree:=coalesce(saved.plan,p_plan);',$replacement$tree:=coalesce(saved.plan,p_plan);
  -- Freeze resolved defaults even for saved pre-tempo plans. Only tempo is read from
  -- the matching current plan; its other saved prescription fields remain authoritative.
  tree:=jsonb_set(tree,'{slots}',(select jsonb_agg(slot || jsonb_build_object('resolvedTempo',
    coalesce(nullif(slot->'tempo','null'::jsonb),
      (select input->'resolvedTempo' from jsonb_array_elements(p_plan->'slots') input
        where input->>'id'=slot->>'id' and input->>'exerciseId'=slot->>'exerciseId'),
      '[2,0,1,0]'::jsonb)) order by ordinal)
    from jsonb_array_elements(tree->'slots') with ordinality as entries(slot,ordinal)));$replacement$);
  if body=original then raise exception 'Start tempo snapshot seam changed'; end if;
  execute body;
end $$;

reset role;
revoke create on schema private from workout_editor_executor;
