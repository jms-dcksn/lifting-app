-- Optional model identity. Legacy rows remain the unknown-model station and keep IDs.
alter table public.exercise add column station_model text;
alter table public.exercise add constraint exercise_station_model_normalized check (
  station_model is null or (
    length(station_model) between 1 and 100
    and station_model = lower(btrim(regexp_replace(station_model, '\s+', ' ', 'g')))
  )
);

drop index public.exercise_variant_unique;
create unique index exercise_variant_unique on public.exercise (
  user_id, base_exercise_id, coalesce(brand, ''), coalesce(machine_type, ''), coalesce(station_model, '')
) where base_exercise_id is not null;

comment on column public.exercise.station_model is
  'Optional normalized model key/name; null preserves the legacy unknown-model station. Models never merge load histories.';
