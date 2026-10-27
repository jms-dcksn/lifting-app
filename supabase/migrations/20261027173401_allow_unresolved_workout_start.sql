-- Existing programs may contain equipment templates. Capture them at Start; resolve before logging.
create function private.validate_workout_editor(p_plan jsonb,p_day uuid,p_allow_unresolved boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare s jsonb; r jsonb; d jsonb; v jsonb; b jsonb; ids text[]:='{}';
  g text; n integer; first_i integer; last_i integer;
begin
  if p_plan->'version' is distinct from '1'::jsonb or jsonb_typeof(p_plan->'slots') is distinct from 'array'
    or jsonb_array_length(p_plan->'slots') not between 1 and 100 then raise exception 'Add at least one exercise with a working set'; end if;
  if exists(select 1 from jsonb_object_keys(p_plan) k where k not in ('version','slots','variants','dayName','phase'))
    or (p_plan ? 'dayName' and jsonb_typeof(p_plan->'dayName')<>'string') then raise exception 'Unsupported workout plan format'; end if;
  if p_plan->'phase' is not null and p_plan->'phase'<>'null'::jsonb then
    if jsonb_typeof(p_plan->'phase')<>'object' or jsonb_typeof(p_plan->'phase'->'id') is distinct from 'string'
      or jsonb_typeof(p_plan->'phase'->'name') is distinct from 'string'
      or not (p_plan->'phase' ?& array['position','description','weekStart','weekEnd','targetRirMin','targetRirMax','setMultiplier']) then raise exception 'Invalid phase context'; end if;
  end if;
  -- Deferred station selections become owner catalog rows only inside this save/start.
  for v in select value from jsonb_array_elements(coalesce(p_plan->'variants','[]')) loop
    select def into b from private.workout_editor_catalog where id=v->>'baseExerciseId';
    if b is null or coalesce(b->>'stationProfile','none')='none'
      or v->>'machineType' not in ('selectorized','plate_loaded','bench','rack','platform')
      or (b->>'stationProfile'='machine' and v->>'machineType' not in ('selectorized','plate_loaded'))
      or (b->>'stationProfile'='cable' and v->>'machineType'<>'selectorized')
      or (b->>'stationProfile' in ('bench','rack','platform') and v->>'machineType'<>b->>'stationProfile')
      or (b->'allowedMachineTypes' is not null and not (b->'allowedMachineTypes' ? (v->>'machineType')))
      or (b->>'stationProfile'<>'machine' and coalesce(trim(v->>'brand'),'')='')
      or length(coalesce(v->>'brand',''))>100 or length(coalesce(v->>'stationModel',''))>150
      or coalesce(v->>'id','')='' then raise exception 'Choose a valid specific station'; end if;
    if exists(select 1 from public.exercise where id=v->>'id' and user_id<>private.coach_auth_uid())
      or exists(select 1 from private.workout_editor_catalog where id=v->>'id') then raise exception 'Station identity conflict'; end if;
    insert into public.exercise(id,user_id,name,pattern,equipment,brand,machine_type,station_model,
      base_exercise_id,coefficient,is_reference,needs_calibration,increment)
    values(v->>'id',private.coach_auth_uid(),(b->>'name')||' — '||coalesce(v->>'brand','')||' ('||(v->>'machineType')||')',
      b->>'pattern',b->>'equipment',nullif(v->>'brand',''),v->>'machineType',nullif(v->>'stationModel',''),
      b->>'id',(b->>'coefficient')::numeric,false,coalesce((b->>'needsCalibration')::boolean,false),(b->>'increment')::numeric)
    on conflict(id) do nothing;
    if not exists(select 1 from public.exercise where id=v->>'id' and user_id=private.coach_auth_uid()
      and base_exercise_id=v->>'baseExerciseId' and brand is not distinct from nullif(v->>'brand','')
      and machine_type=v->>'machineType' and station_model is not distinct from nullif(v->>'stationModel','')) then raise exception 'Station identity changed'; end if;
  end loop;
  for s in select value from jsonb_array_elements(p_plan->'slots') loop
    if s->>'id' is null or not (s ?& array['programSlotId','supersetGroup'])
      or exists(select 1 from jsonb_object_keys(s) k where k not in ('id','programSlotId','exerciseId','equipmentInstanceId','pattern','restSeconds','supersetGroup','sets','normalSets'))
      then raise exception 'Invalid exercise plan format'; end if;
    perform (s->>'id')::uuid;
    if s->>'id'=any(ids) then raise exception 'Duplicate exercise identity'; end if;
    ids:=array_append(ids,s->>'id');
    if s->>'programSlotId' is not null and not exists(select 1 from public.program_slot
      where id=(s->>'programSlotId')::uuid and program_day_id=p_day and user_id=private.coach_auth_uid() and retired_at is null)
      then raise exception 'Exercise slot changed. Reload your workout'; end if;
    if s->>'equipmentInstanceId' is not null and not exists(select 1 from public.equipment_instance where id=(s->>'equipmentInstanceId')::uuid and user_id=private.coach_auth_uid() and exercise_id=s->>'exerciseId') then raise exception 'Equipment identity unavailable'; end if;
    select def into d from private.workout_editor_catalog where id=s->>'exerciseId';
    if d is null then
      select jsonb_build_object('pattern',e.pattern,'equipment',e.equipment,
        'loadMode',coalesce(c.def->>'loadMode','external')) into d from public.exercise e
        left join private.workout_editor_catalog c on c.id=e.base_exercise_id
        where e.id=s->>'exerciseId' and e.user_id=private.coach_auth_uid();
    elsif coalesce(d->>'stationProfile','none')<>'none' and not coalesce(p_allow_unresolved,false) then raise exception 'Choose a specific station';
    end if;
    if d is null or d->>'pattern' is distinct from s->>'pattern' then raise exception 'Exercise unavailable'; end if;
    if (s->>'restSeconds')::numeric not between 0 and 1800 or (s->>'restSeconds')::numeric<>trunc((s->>'restSeconds')::numeric)
      or s->>'restSeconds' is null then raise exception 'Rest must be 0–1800 seconds'; end if;
    if jsonb_typeof(s->'sets') is distinct from 'array' or jsonb_array_length(s->'sets') not between 1 and 30 then raise exception 'Add at least one working set'; end if;
    if s ? 'normalSets' and (jsonb_typeof(s->'normalSets')<>'array' or jsonb_array_length(s->'normalSets') not between 1 and 30) then raise exception 'Invalid normal-week sets'; end if;
    for r in select value from jsonb_array_elements(s->'sets') union all select value from jsonb_array_elements(coalesce(s->'normalSets','[]')) loop
      if not (r ?& array['id','repMin','repMax','rirMin','rirMax','repsEdited','rirEdited','weight','suggestedWeight','targetReps','seedAt'])
        or exists(select 1 from jsonb_object_keys(r) k where k not in ('id','repMin','repMax','rirMin','rirMax','repsEdited','rirEdited','weight','suggestedWeight','targetReps','seedAt','contextAt'))
        or jsonb_typeof(r->'weight') not in ('number','null') or jsonb_typeof(r->'suggestedWeight') not in ('number','null')
        then raise exception 'Invalid set plan format'; end if;
      perform (r->>'id')::uuid;
      if r->>'suggestedWeight' is not null and (r->>'suggestedWeight')::numeric not between -2000 and 2000 then raise exception 'Invalid suggested load'; end if;
      if (r->>'targetReps')::numeric<>trunc((r->>'targetReps')::numeric) then raise exception 'Reps must be whole numbers'; end if;
      if r->>'seedAt' is not null then
        if r->>'seedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$' then raise exception 'Invalid weight seed timestamp'; end if;
        perform (r->>'seedAt')::timestamptz;
      end if;
      if r->>'contextAt' is not null then
        if r->>'contextAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$' then raise exception 'Invalid prescription timestamp'; end if;
        perform (r->>'contextAt')::timestamptz;
      end if;
      if r->>'id' is null or r->>'repMin' is null or r->>'repMax' is null or r->>'rirMin' is null or r->>'rirMax' is null
        or (r->>'repMin')::numeric not between 1 and 100 or (r->>'repMax')::numeric not between 1 and 100
        or (r->>'repMin')::numeric<>trunc((r->>'repMin')::numeric) or (r->>'repMax')::numeric<>trunc((r->>'repMax')::numeric)
        or (r->>'repMin')::numeric>(r->>'repMax')::numeric
        or (r->>'rirMin')::numeric not between 0 and 5 or (r->>'rirMax')::numeric not between 0 and 5
        or (r->>'rirMin')::numeric>(r->>'rirMax')::numeric
        or jsonb_typeof(r->'repsEdited') is distinct from 'boolean' or jsonb_typeof(r->'rirEdited') is distinct from 'boolean'
        or (r->>'targetReps')::numeric not between (r->>'repMin')::numeric and (r->>'repMax')::numeric
        or r->>'targetReps' is null then raise exception 'Invalid reps or RIR'; end if;
      if r->>'weight' is not null and ((r->>'weight')::numeric not between -2000 and 2000
        or (d->>'loadMode'='reps_only' and (r->>'weight')::numeric<>0)
        or (d->>'loadMode'='assisted' and (r->>'weight')::numeric>0)
        or (coalesce(d->>'loadMode','external') not in ('reps_only','assisted') and d->>'equipment'<>'bodyweight' and (r->>'weight')::numeric<=0)) then raise exception 'Invalid equipment load'; end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(s->'sets') entry group by entry.value->>'id' having count(*)>1)
      then raise exception 'Duplicate set identity'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_plan->'slots') slot_entry cross join lateral jsonb_array_elements(slot_entry.value->'sets') row_entry group by row_entry.value->>'id' having count(*)>1) then raise exception 'Set identities must be unique across exercises'; end if;
  if exists(select 1 from jsonb_array_elements(p_plan->'slots') slot_entry cross join lateral jsonb_array_elements(coalesce(slot_entry.value->'normalSets',slot_entry.value->'sets')) row_entry group by row_entry.value->>'id' having count(*)>1) then raise exception 'Normal set identities must be unique'; end if;
  for g in select distinct value->>'supersetGroup'   from jsonb_array_elements(p_plan->'slots') where value->>'supersetGroup' is not null loop
    select count(*),min(ordinality),max(ordinality) into n,first_i,last_i
      from jsonb_array_elements(p_plan->'slots') with ordinality where value->>'supersetGroup'=g;
    if g !~ '^[A-Za-z][A-Za-z0-9_-]{0,15}$' or n<2 or last_i-first_i+1<>n then raise exception 'Keep supersets together with at least two exercises'; end if;
  end loop;
end;
$$;
revoke all on function private.validate_workout_editor(jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function private.validate_workout_editor(jsonb,uuid,boolean) to workout_editor_executor;

-- Existing saves remain strict. Only the private start operation opts into pending equipment.
create or replace function private.validate_workout_editor(p_plan jsonb,p_day uuid) returns void
language sql security invoker set search_path='' as $$
  select private.validate_workout_editor(p_plan,p_day,false);
$$;

create or replace function private.start_workout_plan(p_program uuid,p_day uuid,p_completed integer,p_source bigint,p_revision bigint,p_plan jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved public.workout_plan; session_id uuid; week integer; tree jsonb; swaps jsonb;
begin
  if private.coach_auth_uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform private.lock_coach_source();
  -- Resume always wins, including a retry after a lost successful response.
  select id into session_id from public.workout_session where user_id=private.coach_auth_uid() and program_id=p_program
    and program_day_id is not null and finished_at is null order by performed_at desc limit 1;
  if found then return session_id; end if;
  week:=private.require_workout_occurrence(p_program,p_day,p_completed,p_source);
  select * into saved from public.workout_plan where user_id=private.coach_auth_uid() and program_id=p_program and program_day_id=p_day and completed_count=p_completed for update;
  if coalesce(saved.revision,0)<>p_revision then raise exception 'A newer plan was saved. Reload before starting' using errcode='40001'; end if;
  if saved.user_id is not null and (saved.updated_at<now()-interval '30 days' or saved.day_version<>private.workout_day_version(p_program,p_day)) then raise exception 'Your saved plan needs review because the program changed. Reopen and save it again' using errcode='40001'; end if;
  tree:=coalesce(saved.plan,p_plan);
  perform private.validate_workout_editor(tree,p_day,true);
  select jsonb_object_agg(value->>'id',value->>'exerciseId') into swaps from jsonb_array_elements(tree->'slots');
  insert into public.workout_session(user_id,program_id,program_day_id,week_index,exercise_swaps,plan_snapshot)
    values(private.coach_auth_uid(),p_program,p_day,week,swaps,tree) returning id into session_id;
  delete from public.workout_plan where user_id=private.coach_auth_uid() and program_id=p_program and program_day_id=p_day and completed_count=p_completed;
  return session_id;
end;
$$;
alter function private.start_workout_plan(uuid,uuid,integer,bigint,bigint,jsonb) owner to workout_editor_executor;
revoke all on function private.start_workout_plan(uuid,uuid,integer,bigint,bigint,jsonb) from public,anon;
grant execute on function private.start_workout_plan(uuid,uuid,integer,bigint,bigint,jsonb) to authenticated;
-- A captured template is intent only. Direct API inserts must resolve equipment too.
create function private.require_logged_workout_station() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- Preserve edits to old performance, including pre-station historical identities.
  if tg_op='UPDATE' and new.session_id=old.session_id and new.exercise_id=old.exercise_id then
    return new;
  end if;
  if exists(select 1 from public.workout_session where id=new.session_id
    and user_id=private.coach_auth_uid() and plan_snapshot is not null)
    and exists(select 1 from private.workout_editor_catalog
    where id=new.exercise_id and coalesce(def->>'stationProfile','none')<>'none') then
    raise exception 'Choose equipment for this exercise before logging a set';
  end if;
  return new;
end;
$$;
alter function private.require_logged_workout_station() owner to workout_editor_executor;
revoke all on function private.require_logged_workout_station() from public,anon,authenticated;
create trigger require_logged_workout_station before insert or update of exercise_id,session_id
  on public.set_log for each row execute function private.require_logged_workout_station();
