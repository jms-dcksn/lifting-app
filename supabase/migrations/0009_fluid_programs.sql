-- Fluid (adaptive) program style: per-movement plateau detection drives rep-range
-- changes then exercise swaps. movement_adaptation is an append-only INTENT log (what the
-- engine recommended and the user accepted/dismissed) — not a cache of set_log.

alter table program add column style text not null default 'classic';        -- 'classic' | 'fluid'
alter table program_slot add column plateau_patience smallint;               -- null = auto by movement type

create table movement_adaptation (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  program_slot_id  uuid not null references program_slot(id) on delete cascade,
  exercise_id      text not null,                  -- the exercise this event acted on
  action           text not null,                  -- 'rep_change' | 'swap' | 'dismiss'
  new_exercise_id  text,                           -- swap only
  new_rep_min      smallint,                       -- rep_change only
  new_rep_max      smallint,                       -- rep_change only
  ladder_step      smallint not null default 0,    -- the resulting ladder step this event produced
  created_at       timestamptz not null default now()
);

create index movement_adaptation_slot_idx
  on movement_adaptation (user_id, program_slot_id, created_at);

alter table movement_adaptation enable row level security;

create policy "own movement_adaptation" on movement_adaptation
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on column program.style is 'classic | fluid';
comment on column program_slot.plateau_patience is 'stalled-exposure window before plateau; null = auto by movement type';
comment on column movement_adaptation.action is 'rep_change | swap | dismiss';
