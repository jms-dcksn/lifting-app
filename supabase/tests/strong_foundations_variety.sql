-- Run with psql from this directory as postgres. Everything rolls back.
-- Uses one existing account solely as fixture owner; no auth/profile changes.
begin;
create temp table fixture_program (id uuid, kind text, user_id uuid) on commit drop;
do $$
declare u uuid; pid uuid; k text;
begin
  select id into strict u from public.profile limit 1;
  foreach k in array array['normal', 'custom', 'unrelated'] loop
    insert into public.program (user_id, name, description, weeks, style, is_active)
    values (u, case when k = 'unrelated' then 'Unrelated test plan' else 'Strong Foundations · Women''s Glutes & Legs' end,
      'A 12-week beginner/intermediate strength and muscle-building plan for women, test fixture', 12, 'classic', false)
    returning id into pid;
    insert into fixture_program values (pid, k, u);
  end loop;
end $$;
create temp table old_slots on commit drop as select * from (values
(0, 'A · Glutes & Thighs + Push/Pull', 0, 'leg-press', 'squat', 2, 6, 10, 2, 120),
(0, 'A · Glutes & Thighs + Push/Pull', 1, 'glute-drive', 'hip_thrust', 2, 8, 12, 2, 120),
(0, 'A · Glutes & Thighs + Push/Pull', 2, 'seated-leg-curl', 'knee_flexion', 2, 10, 15, 2, 90),
(0, 'A · Glutes & Thighs + Push/Pull', 3, 'machine-chest-press', 'horizontal_press', 2, 8, 12, 2, 90),
(0, 'A · Glutes & Thighs + Push/Pull', 4, 'seated-cable-row', 'horizontal_pull', 2, 8, 12, 2, 90),
(0, 'A · Glutes & Thighs + Push/Pull', 5, 'seated-hip-abduction', 'hip_thrust', 2, 12, 20, 2, 60),
(1, 'B · Posterior Chain & Quads + Shoulders/Back', 0, 'bb-rdl', 'hinge', 2, 8, 10, 2, 150),
(1, 'B · Posterior Chain & Quads + Shoulders/Back', 1, 'leg-press', 'squat', 2, 8, 12, 2, 120),
(1, 'B · Posterior Chain & Quads + Shoulders/Back', 2, 'leg-extension', 'knee_extension', 2, 10, 15, 2, 90),
(1, 'B · Posterior Chain & Quads + Shoulders/Back', 3, 'lat-pulldown', 'vertical_pull', 2, 8, 12, 2, 90),
(1, 'B · Posterior Chain & Quads + Shoulders/Back', 4, 'db-shoulder-press', 'vertical_press', 2, 8, 12, 2, 90),
(1, 'B · Posterior Chain & Quads + Shoulders/Back', 5, 'standing-calf-raise', 'calf', 2, 10, 15, 2, 60),
(2, 'C · Glute Strength & Legs + Push/Pull/Core', 0, 'glute-drive', 'hip_thrust', 2, 6, 10, 2, 120),
(2, 'C · Glute Strength & Legs + Push/Pull/Core', 1, 'leg-press', 'squat', 2, 10, 15, 2, 120),
(2, 'C · Glute Strength & Legs + Push/Pull/Core', 2, 'seated-leg-curl', 'knee_flexion', 2, 10, 15, 2, 90),
(2, 'C · Glute Strength & Legs + Push/Pull/Core', 3, 'machine-chest-press', 'horizontal_press', 2, 8, 12, 2, 90),
(2, 'C · Glute Strength & Legs + Push/Pull/Core', 4, 'seated-cable-row', 'horizontal_pull', 2, 8, 12, 2, 90),
(2, 'C · Glute Strength & Legs + Push/Pull/Core', 5, 'cable-crunch', 'core', 2, 10, 15, 2, 60)
) v(day_position, day_name, slot_position, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir, rest_seconds);
insert into public.program_day (user_id, program_id, position, name)
select f.user_id, f.id, v.day_position, v.day_name from fixture_program f
cross join (select distinct day_position, day_name from old_slots) v;
insert into public.program_slot (user_id, program_day_id, position, exercise_id, pattern, target_sets, rep_min, rep_max, target_rir, rest_seconds)
select d.user_id, d.id, v.slot_position, v.exercise_id, v.pattern, v.target_sets, v.rep_min, v.rep_max, v.target_rir, v.rest_seconds
from public.program_day d join fixture_program f on f.id=d.program_id
join old_slots v on v.day_position=d.position;
-- A selected machine variant must migrate just like the generic exercise.
insert into public.exercise (id,user_id,name,pattern,equipment,base_exercise_id,brand)
select 'test-variety-' || id, user_id, 'Test leg press', 'squat', 'machine', 'leg-press', 'Test-' || id
from fixture_program where kind='normal';
update public.program_slot s set exercise_id='test-variety-' || f.id
from public.program_day d, fixture_program f
where d.program_id=f.id and f.kind='normal' and d.position=1 and s.program_day_id=d.id and s.position=1;
-- Preserve custom prescriptions and a substitution outside the original family.
update public.program_slot s set target_sets=3
from public.program_day d, fixture_program f
where d.program_id=f.id and f.kind='custom' and d.position=1 and s.program_day_id=d.id and s.position=1;
update public.program_slot s set exercise_id='db-bench'
from public.program_day d, fixture_program f
where d.program_id=f.id and f.kind='custom' and d.position=2 and s.program_day_id=d.id and s.position=3;
create temp table before_slots on commit drop as select * from public.program_slot;
create temp table before_history on commit drop as
select 'sets' as kind, md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) as digest from public.set_log t
union all select 'sessions', md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.workout_session t
union all select 'phases', md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.program_phase t;
\ir ../migrations/20260914224239_strong_foundations_variety.sql

do $$
begin
  if (select count(*) from public.program_slot s join public.program_day d on d.id=s.program_day_id
    join fixture_program f on f.id=d.program_id where f.kind='normal' and
    ((d.position=1 and s.position=1 and s.exercise_id='hack-squat') or
     (d.position=2 and s.position=1 and s.exercise_id='db-split-squat' and s.pattern='lunge' and s.rep_min=8 and s.rep_max=10) or
     (d.position=2 and s.position=3 and s.exercise_id='db-incline-bench') or
     (d.position=2 and s.position=4 and s.exercise_id='machine-row'))) <> 4 then
    raise exception 'Expected all four replacements including machine variant';
  end if;
  if exists (select 1 from before_slots b full join public.program_slot s using(id)
    where b.id is null or s.id is null) then raise exception 'Slot IDs changed'; end if;
  if exists (select 1 from public.program_slot s join before_slots b using(id)
    join public.program_day d on d.id=s.program_day_id join fixture_program f on f.id=d.program_id
    where (f.kind='unrelated' or (f.kind='custom' and ((d.position=1 and s.position=1) or (d.position=2 and s.position=3))))
    and to_jsonb(s)<>to_jsonb(b)) then raise exception 'Customization or unrelated program changed'; end if;
  if exists (select * from before_history except
    (select 'sets', md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.set_log t
     union all select 'sessions', md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.workout_session t
     union all select 'phases', md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) from public.program_phase t))
    then raise exception 'History or phases changed'; end if;
end $$;
create temp table after_first on commit drop as
select 'program' as kind, md5(jsonb_agg(to_jsonb(t) order by id)::text) as digest from public.program t
union all select 'day', md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.program_day t
union all select 'slot', md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.program_slot t;
\ir ../migrations/20260914224239_strong_foundations_variety.sql

do $$ begin
  if exists (select * from after_first except
    (select 'program', md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.program t
     union all select 'day', md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.program_day t
     union all select 'slot', md5(jsonb_agg(to_jsonb(t) order by id)::text) from public.program_slot t))
  then raise exception 'Migration is not idempotent'; end if;
end $$;
rollback;
