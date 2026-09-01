-- Reusable week-specific prescriptions for classic programs. A phase can override the
-- displayed RIR range, working-set count, or both for a contiguous range of weeks.

create table program_phase (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users on delete cascade,
  program_id     uuid not null references program(id) on delete cascade,
  position       int not null,
  name           text not null,
  description    text,
  week_start     int not null,
  week_end       int not null,
  target_rir_min numeric,
  target_rir_max numeric,
  set_multiplier numeric,
  created_at     timestamptz not null default now(),

  constraint program_phase_week_range check (
    week_start >= 1 and week_end >= week_start and week_end <= 52
  ),
  constraint program_phase_rir_pair check (
    (target_rir_min is null and target_rir_max is null)
    or
    (target_rir_min is not null and target_rir_max is not null
      and target_rir_min >= 0 and target_rir_max <= 10
      and target_rir_min <= target_rir_max)
  ),
  constraint program_phase_set_multiplier check (
    set_multiplier is null or (set_multiplier > 0 and set_multiplier <= 2)
  ),
  constraint program_phase_has_override check (
    target_rir_min is not null or set_multiplier is not null
  ),
  unique (program_id, position)
);

create index on program_phase (user_id, program_id, position);

alter table program_phase enable row level security;

create policy "own rows" on program_phase
  using (user_id = auth.uid()) with check (user_id = auth.uid());
