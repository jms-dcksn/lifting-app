-- Machine variants & custom exercises: activate the dormant `exercise` table.
-- machine_type is an identity attribute (selectorized | plate_loaded), not engine math.
-- base_exercise_id is the seeded template a variant derives from; null for fully custom.

alter table exercise add column machine_type text;
alter table exercise add column base_exercise_id text;

-- One variant per (user, template, brand, type). Coalesce so nulls collapse (Postgres
-- treats NULLs as distinct, which would otherwise allow duplicates).
create unique index exercise_variant_unique on exercise (
  user_id, base_exercise_id, coalesce(brand, ''), coalesce(machine_type, '')
) where base_exercise_id is not null;

comment on column exercise.equipment is 'barbell|dumbbell|cable|machine|bodyweight';
comment on column exercise.machine_type is 'selectorized|plate_loaded|null';
comment on column exercise.base_exercise_id is 'seeded template id, or null for fully custom';
