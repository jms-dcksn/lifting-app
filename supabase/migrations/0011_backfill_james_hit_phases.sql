-- The personalized HIT program was available before program_phase existed. Backfill existing
-- copies so the currently active block gains the same rules as newly instantiated templates.

-- Positions are mutable ordering metadata. A uniqueness constraint makes a simple two-row
-- reorder fail transiently when the rows exchange positions during an upsert.
alter table program_phase
  drop constraint if exists program_phase_program_id_position_key;

insert into program_phase (
  user_id,
  program_id,
  position,
  name,
  description,
  week_start,
  week_end,
  target_rir_min,
  target_rir_max,
  set_multiplier
)
select
  p.user_id,
  p.id,
  phase.position,
  phase.name,
  phase.description,
  phase.week_start,
  phase.week_end,
  phase.target_rir_min,
  phase.target_rir_max,
  phase.set_multiplier
from program p
cross join (values
  (0, 'Calibration', 'Leave two clean reps in reserve while establishing repeatable loads and technique.', 1, 1, 2::numeric, 2::numeric, null::numeric),
  (1, 'Build', 'Push every working set to one rep in reserve without adding sets.', 2, 3, 1::numeric, 1::numeric, null::numeric),
  (2, 'Intensification', 'Work within zero to one RIR. Stop compound sets at technical failure and do not use forced reps.', 4, 5, 0::numeric, 1::numeric, null::numeric),
  (3, 'Deload', 'Perform half the normal working sets and keep three to four reps in reserve.', 6, 6, 3::numeric, 4::numeric, 0.5::numeric),
  (4, 'Recalibration', 'Re-establish repeatable loads after the deload with two reps in reserve.', 7, 7, 2::numeric, 2::numeric, null::numeric),
  (5, 'Build', 'Push every working set to one rep in reserve without adding sets.', 8, 9, 1::numeric, 1::numeric, null::numeric),
  (6, 'Intensification', 'Work within zero to one RIR. Stop compound sets at technical failure and do not use forced reps.', 10, 11, 0::numeric, 1::numeric, null::numeric),
  (7, 'Deload', 'Perform half the normal working sets and keep three to four reps in reserve.', 12, 12, 3::numeric, 4::numeric, 0.5::numeric)
) as phase(position, name, description, week_start, week_end, target_rir_min, target_rir_max, set_multiplier)
where p.name = 'James · HIT Upper / Lower'
  and p.weeks = 12
  and not exists (
    select 1 from program_phase existing where existing.program_id = p.id
  );
