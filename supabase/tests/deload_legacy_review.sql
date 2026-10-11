-- Read-only review after migration: never infer recovery from actual load or effort.
select s.id as session_id, s.user_id, s.program_id, s.week_index,
  case when s.program_id is null then 'Program unavailable'
       when s.week_index is null then 'Week unavailable'
       else 'Legacy phase needs review' end as reason
from public.workout_session s
where not s.is_deload and (
  s.program_id is null or s.week_index is null or exists (
    select 1 from public.program_phase ph
    where ph.program_id=s.program_id and ph.user_id=s.user_id
      and s.week_index between ph.week_start and ph.week_end and not ph.is_deload
      and (ph.set_multiplier < 1 or lower(ph.name || ' ' || coalesce(ph.description,'')) like '%deload%')
  )
)
order by s.user_id, s.performed_at;
