-- One-time revision of recognizable original copies, active or inactive.
-- Preserve program/day/slot IDs, phases, progress, custom prescriptions and set_log.
-- Machine variants of a replaced exercise are eligible; never transfer their load.
set local lock_timeout = '5s';
lock table public.workout_session, public.program, public.program_day, public.program_slot
  in share row exclusive mode;

do $$
declare
  p record;
  changed integer;
begin
  for p in
    select id, user_id from public.program
    where name = 'Strong Foundations · Women''s Glutes & Legs'
      and style = 'classic' and weeks = 12
      and description like 'A 12-week beginner/intermediate strength and muscle-building plan for women,%'
      and (select count(*) from public.program_day d where d.program_id = program.id) = 3
  loop
    -- Abort atomically rather than changing prescriptions underneath an open workout.
    if exists (select 1 from public.workout_session w
      where w.program_id = p.id and w.finished_at is null) then
      raise exception 'Finish open Strong Foundations workouts before applying the revision';
    end if;

    update public.program_slot s
    set exercise_id = v.new_exercise, pattern = v.new_pattern,
        rep_min = v.new_min, rep_max = v.new_max
    from public.program_day d,
      (values
        (1, 'B · Posterior Chain & Quads + Shoulders/Back', 1, 'leg-press', 'squat', 8, 12, 120, 'hack-squat', 'squat', 8, 12),
        (2, 'C · Glute Strength & Legs + Push/Pull/Core', 1, 'leg-press', 'squat', 10, 15, 120, 'db-split-squat', 'lunge', 8, 10),
        (2, 'C · Glute Strength & Legs + Push/Pull/Core', 3, 'machine-chest-press', 'horizontal_press', 8, 12, 90, 'db-incline-bench', 'horizontal_press', 8, 12),
        (2, 'C · Glute Strength & Legs + Push/Pull/Core', 4, 'seated-cable-row', 'horizontal_pull', 8, 12, 90, 'machine-row', 'horizontal_pull', 8, 12)
      ) v(day_position, day_name, slot_position, old_exercise, old_pattern, old_min, old_max, rest, new_exercise, new_pattern, new_min, new_max)
    where d.program_id = p.id and d.user_id = p.user_id
      and d.position = v.day_position and d.name = v.day_name
      and (select count(*) from public.program_slot ds where ds.program_day_id = d.id) = 6
      and s.program_day_id = d.id and s.user_id = p.user_id and s.position = v.slot_position
      and s.pattern = v.old_pattern and s.target_sets = 2 and s.target_rir = 2
      and s.rep_min = v.old_min and s.rep_max = v.old_max and s.rest_seconds = v.rest
      and s.plateau_patience is null
      and (s.exercise_id = v.old_exercise or exists (
        select 1 from public.exercise e where e.id = s.exercise_id
          and e.user_id = p.user_id and e.base_exercise_id = v.old_exercise
      ));
    get diagnostics changed = row_count;

    -- Rename only when the single-leg substitution actually happened.
    update public.program_day d
    set name = 'C · Glute Strength & Single-Leg + Push/Pull/Core'
    where d.program_id = p.id and d.user_id = p.user_id and d.position = 2
      and d.name = 'C · Glute Strength & Legs + Push/Pull/Core'
      and exists (select 1 from public.program_slot s where s.program_day_id = d.id
        and s.user_id = p.user_id and s.position = 1 and s.exercise_id = 'db-split-squat');

    if changed > 0 then
      update public.program
      set description = description || ' Variety revision: day B uses hack squat; day C uses Bulgarian split squat, dumbbell incline bench and machine row where the original prescriptions were unchanged. Bulgarian split squats are 8-10 reps per leg: complete both legs before resting 120 seconds, then log one set using the weaker leg''s reps/RIR and the weight of one dumbbell. Start light and use support for balance; swap to leg press if not yet comfortable. Allow extra time for both legs and keep the minute-40 cutoff. Calibrate new exercises independently. Keep the revised exercises consistent week to week.'
      where id = p.id and user_id = p.user_id
        and description not like '%Variety revision:%';
    end if;
  end loop;
end $$;
