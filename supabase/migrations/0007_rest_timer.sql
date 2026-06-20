-- Rest timer: a per-user default rest plus an optional per-slot override.
-- Null rest_seconds on a slot means "use the profile default".
alter table public.profile add column default_rest_seconds int not null default 120;
alter table public.program_slot add column rest_seconds int;
