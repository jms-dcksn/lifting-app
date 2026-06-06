-- Program builder: a program has ordered days, each day has ordered slots.
-- Slots prescribe structure (sets x rep-range @ RIR); the bound exercise is concrete but
-- pattern-tagged so a swap re-derives weight. Block position is derived from completed
-- sessions, not stored. set_log gains program_slot_id so a set ties back to its slot after a swap.

alter table program
  add column weeks     int,
  add column is_active boolean not null default false;

-- At most one active program per user.
create unique index program_one_active_per_user
  on program (user_id) where is_active;

alter table profile
  add column bodyweight numeric;

-- Ordered named days within a program.
create table program_day (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users on delete cascade,
  program_id uuid not null references program(id) on delete cascade,
  position   int not null,
  name       text not null,
  created_at timestamptz not null default now()
);

-- Ordered slots within a day. exercise_id is a text slug (see set_log / coefficients.ts),
-- intentionally not FK'd. pattern lets swap filter to same-pattern variants first.
create table program_slot (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users on delete cascade,
  program_day_id uuid not null references program_day(id) on delete cascade,
  position       int not null,
  exercise_id    text not null,
  pattern        text not null,
  target_sets    int not null,
  rep_min        int not null,
  rep_max        int not null,
  target_rir     numeric not null,
  created_at     timestamptz not null default now()
);

-- Which program day a session instantiates.
alter table workout_session
  add column program_day_id uuid references program_day(id) on delete set null;

-- Ties a logged set back to its slot even after a swap; null for ad-hoc sets.
alter table set_log
  add column program_slot_id uuid references program_slot(id) on delete set null;

create index on program_day (user_id, program_id, position);
create index on program_slot (user_id, program_day_id, position);

alter table program_day  enable row level security;
alter table program_slot enable row level security;

create policy "own rows" on program_day
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on program_slot
  using (user_id = auth.uid()) with check (user_id = auth.uid());
