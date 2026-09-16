-- In-app rest-complete tone preference. Default on; vibration is independent.
-- No browser Notification API / permission is involved.
alter table public.profile
  add column rest_tone_enabled boolean not null default true;

comment on column public.profile.rest_tone_enabled is
  'Play an in-app Web Audio tone when the rest timer completes. Vibration is not gated by this flag.';
