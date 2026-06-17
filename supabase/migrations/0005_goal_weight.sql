-- Add goal weight to profile.
alter table public.profile
  add column goal_weight numeric;
