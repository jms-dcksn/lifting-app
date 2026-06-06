-- A session is in-progress until finished. `finished_at` distinguishes completed sessions
-- (which drive block position / "next workout") from one currently being logged or abandoned.
alter table public.workout_session
  add column if not exists finished_at timestamptz;
