-- Lifting app schema. set_log is the source of truth; everything else derives from it.
-- exercise_id is a text slug (from src/lib/strength/coefficients.ts) or a custom exercise id.
-- We intentionally do not FK exercise_id so the seeded catalog can live in app code.

create extension if not exists "uuid-ossp";

-- Mirror of auth.users for app-level profile data.
create table profile (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- User-created exercises only. Seeded movements live in coefficients.ts.
create table exercise (
  id                text primary key,
  user_id           uuid not null references auth.users on delete cascade,
  name              text not null,
  pattern           text not null,
  equipment         text not null,   -- barbell|dumbbell|cable|machine_plate|machine_pin|bodyweight
  brand             text,
  coefficient       numeric not null default 1,
  is_reference      boolean not null default false,
  needs_calibration boolean not null default false,
  increment         numeric not null default 5,
  created_at        timestamptz not null default now()
);

-- A specific machine at a specific gym (loading differs by brand/unit).
create table equipment_instance (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users on delete cascade,
  exercise_id text not null,
  gym         text,
  label       text,
  created_at  timestamptz not null default now()
);

create table program (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users on delete cascade,
  name       text not null,
  notes      text,
  created_at timestamptz not null default now()
);

create table workout_session (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users on delete cascade,
  program_id   uuid references program(id) on delete set null,
  performed_at timestamptz not null default now(),
  week_index   int,
  notes        text
);

-- Atomic truth. e1rm is cached from (weight, reps, rir).
create table set_log (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users on delete cascade,
  session_id            uuid not null references workout_session(id) on delete cascade,
  exercise_id           text not null,
  equipment_instance_id uuid references equipment_instance(id) on delete set null,
  set_index             int not null,
  weight                numeric not null,
  reps                  int not null,
  rir                   numeric,
  is_warmup             boolean not null default false,
  is_calibration        boolean not null default false,
  e1rm                  numeric,
  created_at            timestamptz not null default now()
);

-- Derived per-user strength cache. Rebuildable from set_log at any time.
create table user_exercise_stat (
  user_id             uuid not null references auth.users on delete cascade,
  exercise_id         text not null,
  current_e1rm        numeric,
  personal_coefficient numeric,
  coeff_confidence_n  int not null default 0,
  last_updated        timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create index on set_log (user_id, exercise_id, created_at desc);
create index on workout_session (user_id, performed_at desc);

-- Row-level security: every row is owned by its user.
alter table profile             enable row level security;
alter table exercise            enable row level security;
alter table equipment_instance  enable row level security;
alter table program             enable row level security;
alter table workout_session     enable row level security;
alter table set_log             enable row level security;
alter table user_exercise_stat  enable row level security;

create policy "own profile" on profile
  using (id = auth.uid()) with check (id = auth.uid());

-- Same own-rows policy shape for every user-scoped table.
create policy "own rows" on exercise
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on equipment_instance
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on program
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on workout_session
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on set_log
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on user_exercise_stat
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Create a profile row automatically on signup.
create function handle_new_user() returns trigger as $$
begin
  insert into profile (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
