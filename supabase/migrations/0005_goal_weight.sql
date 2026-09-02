-- Add goal weight to profile.
alter table public.profile
  add column if not exists goal_weight numeric;
