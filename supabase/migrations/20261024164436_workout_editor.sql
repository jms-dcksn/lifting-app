-- Full occurrence plans and captured prescriptions. Never rewrite historical set_log.
alter table public.program_slot add column retired_at timestamptz,
  add column set_prescriptions jsonb;
alter table public.workout_session add column plan_snapshot jsonb;
alter table public.set_log add column planned_slot_id uuid, add column planned_set_id uuid;
create index set_log_planned_row on public.set_log(user_id, planned_set_id, created_at)
  where planned_set_id is not null;

-- A non-login, non-bypass executor exposes only validated operations, not direct writes.
do $$ begin
  create role workout_editor_executor nologin nosuperuser nobypassrls;
  execute format('grant workout_editor_executor to %I with inherit false', current_user);
end $$;
grant usage on schema public, private to workout_editor_executor;
grant create on schema private to workout_editor_executor;
create policy editor_read_revision on public.coach_refresh_state for select to workout_editor_executor using(user_id=(select private.coach_auth_uid()));
grant execute on function private.coach_auth_uid(), private.lock_coach_source() to workout_editor_executor;
grant select, insert, update on public.program_slot, public.workout_session,
  public.movement_adaptation, public.exercise to workout_editor_executor;
grant select on public.program, public.program_day, public.program_phase,
  public.set_log, public.equipment_instance, public.coach_refresh_state to workout_editor_executor;

create table public.workout_plan (
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.program(id) on delete cascade,
  program_day_id uuid not null references public.program_day(id) on delete cascade,
  completed_count integer not null check(completed_count>=0), revision bigint not null,
  source_revision bigint not null, day_version text not null, plan jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(user_id, program_id, program_day_id, completed_count)
);
alter table public.workout_plan enable row level security;
create policy workout_plan_read on public.workout_plan for select to authenticated
  using(user_id=(select auth.uid()));
create policy workout_plan_executor on public.workout_plan to workout_editor_executor
  using(user_id=(select private.coach_auth_uid())) with check(user_id=(select private.coach_auth_uid()));
revoke all on public.workout_plan from public, anon, authenticated;
grant select on public.workout_plan to authenticated;
grant select, insert, update, delete on public.workout_plan to workout_editor_executor;
create trigger coach_source_lock before insert or update or delete on public.workout_plan
  for each statement execute function private.coach_source_statement();
create trigger coach_source_revision after insert or update or delete on public.workout_plan
  for each row execute function private.coach_source_row();

create table private.workout_editor_receipt (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, intent jsonb not null, result jsonb not null,
  primary key(user_id,request_id)
);
alter table private.workout_editor_receipt enable row level security;
create policy own_editor_receipt on private.workout_editor_receipt to workout_editor_executor
  using(user_id=(select private.coach_auth_uid())) with check(user_id=(select private.coach_auth_uid()));
grant select,insert on private.workout_editor_receipt to workout_editor_executor;

-- Versioned seed identity metadata enforces station/load validation even for direct RPCs.
-- Refresh this snapshot when the seeded catalog's identity/load-mode contract changes.
create table private.workout_editor_catalog (id text primary key, def jsonb not null);
grant select on private.workout_editor_catalog to workout_editor_executor;
insert into private.workout_editor_catalog select value->>'id',value from jsonb_array_elements($catalog$[{"id":"bb-bench","name":"Barbell Bench Press","pattern":"horizontal_press","equipment":"barbell","coefficient":1,"isReference":true,"increment":5,"stationProfile":"bench"},{"id":"bb-incline-bench","name":"Barbell Incline Bench","pattern":"horizontal_press","equipment":"barbell","coefficient":0.82,"increment":5,"stationProfile":"bench"},{"id":"db-bench","name":"Dumbbell Bench Press","pattern":"horizontal_press","equipment":"dumbbell","coefficient":0.42,"increment":5,"stationProfile":"none"},{"id":"db-incline-bench","name":"Dumbbell Incline Bench","pattern":"horizontal_press","equipment":"dumbbell","coefficient":0.36,"increment":5,"stationProfile":"none"},{"id":"weighted-dip","name":"Weighted Dip","pattern":"horizontal_press","equipment":"bodyweight","coefficient":1.05,"increment":5,"stationProfile":"none"},{"id":"machine-chest-press","name":"Machine Chest Press","pattern":"horizontal_press","equipment":"machine","coefficient":0.9,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"machine-incline-chest-press","name":"Machine Incline Chest Press","pattern":"horizontal_press","equipment":"machine","coefficient":0.82,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"machine-decline-chest-press","name":"Machine Decline Chest Press","pattern":"horizontal_press","equipment":"machine","coefficient":0.9,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"machine-seated-dip","name":"Machine Seated Dip / Triceps Press","pattern":"horizontal_press","equipment":"machine","coefficient":0.9,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"pec-deck","name":"Pec Deck / Chest Fly","pattern":"horizontal_press","equipment":"machine","coefficient":0.5,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"bb-ohp","name":"Barbell Overhead Press","pattern":"vertical_press","equipment":"barbell","coefficient":1,"isReference":true,"increment":5,"stationProfile":"rack"},{"id":"db-shoulder-press","name":"Dumbbell Shoulder Press","pattern":"vertical_press","equipment":"dumbbell","coefficient":0.42,"increment":5,"stationProfile":"none"},{"id":"machine-shoulder-press","name":"Machine Shoulder Press","pattern":"vertical_press","equipment":"machine","coefficient":0.95,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"bb-row","name":"Barbell Row","pattern":"horizontal_pull","equipment":"barbell","coefficient":1,"isReference":true,"increment":5,"stationProfile":"none"},{"id":"db-row","name":"Dumbbell Row","pattern":"horizontal_pull","equipment":"dumbbell","coefficient":0.45,"increment":5,"stationProfile":"none"},{"id":"machine-row","name":"Machine Horizontal Row (ISO-Lateral)","pattern":"horizontal_pull","equipment":"machine","coefficient":0.9,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"machine-low-row","name":"Machine Low Row","pattern":"horizontal_pull","equipment":"machine","coefficient":0.9,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"seated-cable-row","name":"Seated Cable Row","pattern":"horizontal_pull","equipment":"cable","coefficient":0.85,"needsCalibration":true,"increment":10,"stationProfile":"cable"},{"id":"lat-pulldown","name":"Lat Pulldown (Cable)","pattern":"vertical_pull","equipment":"cable","coefficient":1,"isReference":true,"needsCalibration":true,"increment":10,"stationProfile":"cable"},{"id":"machine-lat-pulldown","name":"Machine Lat Pulldown","pattern":"vertical_pull","equipment":"machine","coefficient":1,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"machine-pullover","name":"Machine Pullover","pattern":"vertical_pull","equipment":"machine","coefficient":0.7,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"weighted-pullup","name":"Weighted Pull-up","pattern":"vertical_pull","equipment":"bodyweight","coefficient":1.3,"increment":5,"stationProfile":"none"},{"id":"high-row","name":"High Row","pattern":"vertical_pull","equipment":"machine","coefficient":1.1,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"bb-back-squat","name":"Barbell Back Squat","pattern":"squat","equipment":"barbell","coefficient":1,"isReference":true,"increment":5,"stationProfile":"rack"},{"id":"bb-front-squat","name":"Barbell Front Squat","pattern":"squat","equipment":"barbell","coefficient":0.82,"increment":5,"stationProfile":"rack"},{"id":"hack-squat","name":"Hack Squat","pattern":"squat","equipment":"machine","coefficient":1.1,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"leg-press","name":"Leg Press","pattern":"squat","equipment":"machine","coefficient":2.5,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"bb-deadlift","name":"Barbell Deadlift","pattern":"hinge","equipment":"barbell","coefficient":1,"isReference":true,"increment":5,"stationProfile":"platform"},{"id":"bb-rdl","name":"Romanian Deadlift","pattern":"hinge","equipment":"barbell","coefficient":0.85,"increment":5,"stationProfile":"platform"},{"id":"back-extension","name":"Back Extension","pattern":"hinge","equipment":"machine","coefficient":0.4,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"db-split-squat","name":"Bulgarian Split Squat","pattern":"lunge","equipment":"dumbbell","coefficient":1,"isReference":true,"increment":5,"stationProfile":"none"},{"id":"db-step-up","name":"Dumbbell Step-Up","pattern":"lunge","equipment":"dumbbell","coefficient":0.9,"increment":5,"stationProfile":"none"},{"id":"bb-reverse-lunge","name":"Barbell Reverse Lunges","pattern":"lunge","equipment":"barbell","coefficient":1,"increment":5,"stationProfile":"none"},{"id":"bb-hip-thrust","name":"Barbell Hip Thrust","pattern":"hip_thrust","equipment":"barbell","coefficient":1,"isReference":true,"increment":5,"stationProfile":"bench"},{"id":"glute-drive","name":"Glute Drive","pattern":"hip_thrust","equipment":"machine","coefficient":0.9,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"seated-hip-abduction","name":"Seated Hip Abduction","pattern":"hip_thrust","equipment":"machine","coefficient":1,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"leg-extension","name":"Leg Extension","pattern":"knee_extension","equipment":"machine","coefficient":1,"isReference":true,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"seated-leg-curl","name":"Seated Leg Curl","pattern":"knee_flexion","equipment":"machine","coefficient":1,"isReference":true,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"lying-leg-curl","name":"Lying Leg Curl","pattern":"knee_flexion","equipment":"machine","coefficient":1,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"kneeling-leg-curl","name":"Kneeling Leg Curl","pattern":"knee_flexion","equipment":"machine","coefficient":0.5,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"standing-calf-raise","name":"Standing Calf Raise","pattern":"calf","equipment":"machine","coefficient":1,"isReference":true,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"seated-calf-raise","name":"Seated Calf Raise","pattern":"calf","equipment":"machine","coefficient":0.6,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"machine-calf-extension","name":"Machine Calf Extension / Calf Press","pattern":"calf","equipment":"machine","coefficient":1,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"bb-shrug","name":"Barbell Shrug","pattern":"traps","equipment":"barbell","coefficient":1,"isReference":true,"increment":5,"stationProfile":"none"},{"id":"cable-shrug","name":"Cable Shrug","pattern":"traps","equipment":"cable","coefficient":0.6,"needsCalibration":true,"increment":10,"stationProfile":"cable"},{"id":"bb-curl","name":"Barbell Curl","pattern":"elbow_flexion","equipment":"barbell","coefficient":1,"isReference":true,"increment":5,"stationProfile":"none"},{"id":"db-curl","name":"Dumbbell Curl","pattern":"elbow_flexion","equipment":"dumbbell","coefficient":0.45,"increment":5,"stationProfile":"none"},{"id":"cable-curl","name":"Cable Curl","pattern":"elbow_flexion","equipment":"cable","coefficient":0.9,"needsCalibration":true,"increment":10,"stationProfile":"cable"},{"id":"machine-preacher-curl","name":"Machine Preacher Curl","pattern":"elbow_flexion","equipment":"machine","coefficient":0.9,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"hammer-rope-curl","name":"Hammer Rope Curls","pattern":"elbow_flexion","equipment":"cable","coefficient":1,"needsCalibration":true,"increment":10,"stationProfile":"cable"},{"id":"cable-pushdown","name":"Cable Triceps Pushdown","pattern":"elbow_extension","equipment":"cable","coefficient":1,"isReference":true,"needsCalibration":true,"increment":10,"stationProfile":"cable"},{"id":"machine-triceps-extension","name":"Machine Triceps Extension (Preacher Pad)","pattern":"elbow_extension","equipment":"machine","coefficient":1,"needsCalibration":true,"increment":5,"stationProfile":"machine","machineTemplate":true},{"id":"db-skullcrusher","name":"Dumbbell Skullcrusher","pattern":"elbow_extension","equipment":"dumbbell","coefficient":0.5,"increment":5,"stationProfile":"none"},{"id":"db-lateral-raise","name":"Dumbbell Lateral Raise","pattern":"lateral_raise","equipment":"dumbbell","coefficient":1,"isReference":true,"increment":5,"stationProfile":"none"},{"id":"cable-lateral-raise","name":"Cable Lateral Raise","pattern":"lateral_raise","equipment":"cable","coefficient":0.9,"needsCalibration":true,"increment":5,"stationProfile":"cable"},{"id":"machine-lateral-raise","name":"Machine Lateral Raise","pattern":"lateral_raise","equipment":"machine","coefficient":1,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"reverse-pec-deck","name":"Reverse Pec Deck (Rear Delt)","pattern":"rear_delt","equipment":"machine","coefficient":1,"isReference":true,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"cable-crunch","name":"Cable Crunch","pattern":"core","equipment":"cable","coefficient":1,"isReference":true,"needsCalibration":true,"increment":10,"stationProfile":"cable"},{"id":"machine-ab-crunch","name":"Machine Ab Crunch","pattern":"core","equipment":"machine","coefficient":1,"needsCalibration":true,"increment":10,"stationProfile":"machine","machineTemplate":true},{"id":"hanging-knee-raise","name":"Hanging Knee Raises","pattern":"core","equipment":"bodyweight","coefficient":1,"increment":10,"stationProfile":"none"},{"id":"machine-single-arm-chest-fly","name":"Single Arm Machine Chest Fly","pattern":"chest_fly","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"neutral-grip-pulldown","name":"Neutral Grip Pulldown","pattern":"vertical_pull","equipment":"cable","coefficient":1,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"cable-skullcrusher-daisy-chains","name":"Cable Skullcrusher (Daisy Chains)","pattern":"elbow_extension","equipment":"cable","coefficient":0.85,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"db-lean-back-preacher-curl","name":"Lean Back DB Preacher Curls","pattern":"elbow_flexion","equipment":"dumbbell","coefficient":0.4,"stationProfile":"none","increment":2.5},{"id":"cable-boxy-face-pull","name":"Boxy Face Pull","pattern":"lateral_raise","equipment":"cable","coefficient":0.9,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"smith-ogus-45-back-extension","name":"Ogus 45 - Smith Machine 45 Degree Back Extension","pattern":"hinge","equipment":"machine","coefficient":0.4,"stationProfile":"machine","increment":5,"needsCalibration":true,"allowedMachineTypes":["plate_loaded"],"machineTemplate":true},{"id":"straight-leg-machine-adductor","name":"Straight Leg Machine Adductor","pattern":"hip_adduction","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"good-boy-external-rotation","name":"Good Boy External Rotation (on Adductor Machine)","pattern":"hip_thrust","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"weighted-hanging-leg-raise","name":"Weighted Hanging Leg Raise","pattern":"core","equipment":"bodyweight","coefficient":1,"stationProfile":"none","increment":5},{"id":"db-spider-curl","name":"Dumbbell Spider Curl","pattern":"elbow_flexion","equipment":"dumbbell","coefficient":0.4,"stationProfile":"none","increment":2.5},{"id":"ez-spider-curl","name":"EZ-Bar Spider Curl","pattern":"elbow_flexion","equipment":"barbell","coefficient":0.8,"stationProfile":"none","increment":5},{"id":"db-incline-curl","name":"Incline Dumbbell Curl","pattern":"elbow_flexion","equipment":"dumbbell","coefficient":0.4,"stationProfile":"none","increment":2.5},{"id":"db-concentration-curl","name":"Dumbbell Concentration Curl","pattern":"elbow_flexion","equipment":"dumbbell","coefficient":0.4,"stationProfile":"none","increment":2.5},{"id":"db-preacher-curl","name":"Dumbbell Preacher Curl","pattern":"elbow_flexion","equipment":"dumbbell","coefficient":0.4,"stationProfile":"none","increment":2.5},{"id":"ez-preacher-curl","name":"EZ-Bar Preacher Curl","pattern":"elbow_flexion","equipment":"barbell","coefficient":0.8,"stationProfile":"none","increment":5},{"id":"ez-curl","name":"EZ-Bar Curl","pattern":"elbow_flexion","equipment":"barbell","coefficient":1,"stationProfile":"none","increment":5},{"id":"db-hammer-curl","name":"Dumbbell Hammer Curl","pattern":"elbow_flexion","equipment":"dumbbell","coefficient":0.5,"stationProfile":"none","increment":2.5},{"id":"db-hammer-preacher-curl","name":"Dumbbell Hammer Preacher Curl","pattern":"elbow_flexion","equipment":"dumbbell","coefficient":0.4,"stationProfile":"none","increment":2.5},{"id":"cable-bayesian-curl","name":"Bayesian Cable Curl","pattern":"elbow_flexion","equipment":"cable","coefficient":0.45,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"cable-bayesian-hammer-curl","name":"Bayesian Cable Hammer Curl","pattern":"elbow_flexion","equipment":"cable","coefficient":0.45,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"cable-preacher-curl","name":"Cable Preacher Curl","pattern":"elbow_flexion","equipment":"cable","coefficient":0.8,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"cable-lying-low-curl","name":"Lying Cable Curl (Low Pulley)","pattern":"elbow_flexion","equipment":"cable","coefficient":0.8,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"cable-lying-high-curl","name":"Lying Cable Curl (High Pulley)","pattern":"elbow_flexion","equipment":"cable","coefficient":0.8,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"ez-reverse-curl","name":"Reverse EZ-Bar Curl","pattern":"elbow_flexion","equipment":"barbell","coefficient":0.6,"stationProfile":"none","increment":5},{"id":"db-incline-hammer-curl","name":"Incline Dumbbell Hammer Curl","pattern":"elbow_flexion","equipment":"dumbbell","coefficient":0.4,"stationProfile":"none","increment":2.5},{"id":"cable-high-curl","name":"High Cable Double-Biceps Curl","pattern":"elbow_flexion","equipment":"cable","coefficient":0.4,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"db-zottman-curl","name":"Dumbbell Zottman Curl","pattern":"elbow_flexion","equipment":"dumbbell","coefficient":0.35,"stationProfile":"none","increment":2.5},{"id":"db-lying-curl","name":"Lying Dumbbell Curl","pattern":"elbow_flexion","equipment":"dumbbell","coefficient":0.35,"stationProfile":"none","increment":2.5},{"id":"db-flat-fly","name":"Flat Dumbbell Fly","pattern":"chest_fly","equipment":"dumbbell","coefficient":1,"stationProfile":"none","increment":2.5,"isReference":true},{"id":"db-incline-fly","name":"Incline Dumbbell Fly","pattern":"chest_fly","equipment":"dumbbell","coefficient":1,"stationProfile":"none","increment":2.5,"isReference":false},{"id":"db-decline-fly","name":"Decline Dumbbell Fly","pattern":"chest_fly","equipment":"dumbbell","coefficient":1,"stationProfile":"none","increment":2.5,"isReference":false},{"id":"cable-mid-fly","name":"Standing Cable Fly (Mid-Height)","pattern":"chest_fly","equipment":"cable","coefficient":2,"stationProfile":"cable","increment":5,"needsCalibration":true,"isReference":false},{"id":"cable-low-high-fly","name":"Standing Cable Fly (Low-to-High)","pattern":"chest_fly","equipment":"cable","coefficient":2,"stationProfile":"cable","increment":5,"needsCalibration":true,"isReference":false},{"id":"cable-high-low-fly","name":"Standing Cable Fly (High-to-Low)","pattern":"chest_fly","equipment":"cable","coefficient":2,"stationProfile":"cable","increment":5,"needsCalibration":true,"isReference":false},{"id":"cable-flat-bench-fly","name":"Flat Bench Cable Fly","pattern":"chest_fly","equipment":"cable","coefficient":2,"stationProfile":"cable","increment":5,"needsCalibration":true,"isReference":false},{"id":"cable-incline-bench-fly","name":"Incline Bench Cable Fly","pattern":"chest_fly","equipment":"cable","coefficient":2,"stationProfile":"cable","increment":5,"needsCalibration":true,"isReference":false},{"id":"cable-decline-bench-fly","name":"Decline Bench Cable Fly","pattern":"chest_fly","equipment":"cable","coefficient":2,"stationProfile":"cable","increment":5,"needsCalibration":true,"isReference":false},{"id":"cable-seated-fly","name":"Seated Cable Fly","pattern":"chest_fly","equipment":"cable","coefficient":2,"stationProfile":"cable","increment":5,"needsCalibration":true,"isReference":false},{"id":"cable-press-around","name":"Single-Arm Cable Press-Around","pattern":"chest_fly","equipment":"cable","coefficient":2,"stationProfile":"cable","increment":5,"needsCalibration":true,"isReference":false},{"id":"smith-bench","name":"Smith Machine Flat Bench Press","pattern":"horizontal_press","equipment":"machine","coefficient":0.9,"stationProfile":"machine","increment":5,"needsCalibration":true,"allowedMachineTypes":["plate_loaded"],"machineTemplate":true},{"id":"smith-incline-bench","name":"Smith Machine Incline Bench Press","pattern":"horizontal_press","equipment":"machine","coefficient":0.8,"stationProfile":"machine","increment":5,"needsCalibration":true,"allowedMachineTypes":["plate_loaded"],"machineTemplate":true},{"id":"smith-decline-bench","name":"Smith Machine Decline Bench Press","pattern":"horizontal_press","equipment":"machine","coefficient":0.95,"stationProfile":"machine","increment":5,"needsCalibration":true,"allowedMachineTypes":["plate_loaded"],"machineTemplate":true},{"id":"bb-decline-bench","name":"Barbell Decline Bench Press","pattern":"horizontal_press","equipment":"barbell","coefficient":1.05,"stationProfile":"bench","increment":5},{"id":"db-decline-bench","name":"Dumbbell Decline Bench Press","pattern":"horizontal_press","equipment":"dumbbell","coefficient":0.45,"stationProfile":"none","increment":2.5},{"id":"cable-chest-press","name":"Cable Chest Press","pattern":"horizontal_press","equipment":"cable","coefficient":0.6,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"bb-seal-row","name":"Barbell Seal Row","pattern":"horizontal_pull","equipment":"barbell","coefficient":0.8,"stationProfile":"none","increment":5},{"id":"db-seal-row","name":"Dumbbell Seal Row","pattern":"horizontal_pull","equipment":"dumbbell","coefficient":0.35,"stationProfile":"none","increment":2.5},{"id":"db-chest-supported-row","name":"Incline Chest-Supported Dumbbell Row","pattern":"horizontal_pull","equipment":"dumbbell","coefficient":0.35,"stationProfile":"none","increment":2.5},{"id":"bb-pendlay-row","name":"Pendlay Row","pattern":"horizontal_pull","equipment":"barbell","coefficient":0.85,"stationProfile":"none","increment":5},{"id":"bb-underhand-row","name":"Underhand Barbell Row / Yates Row","pattern":"horizontal_pull","equipment":"barbell","coefficient":0.95,"stationProfile":"none","increment":5},{"id":"db-bent-over-row","name":"Bent-Over Dumbbell Row","pattern":"horizontal_pull","equipment":"dumbbell","coefficient":0.4,"stationProfile":"none","increment":2.5},{"id":"landmine-t-bar-row","name":"Landmine T-Bar Row","pattern":"horizontal_pull","equipment":"barbell","coefficient":0.8,"stationProfile":"none","increment":5},{"id":"machine-chest-supported-t-bar-row","name":"Chest-Supported T-Bar Row","pattern":"horizontal_pull","equipment":"machine","coefficient":0.85,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"machine-standing-t-bar-row","name":"Standing T-Bar Row Machine","pattern":"horizontal_pull","equipment":"machine","coefficient":0.9,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"landmine-meadows-row","name":"Meadows Row","pattern":"horizontal_pull","equipment":"barbell","coefficient":0.4,"stationProfile":"none","increment":5},{"id":"cable-single-arm-row","name":"Single-Arm Cable Row","pattern":"horizontal_pull","equipment":"cable","coefficient":0.4,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"cable-straight-arm-pulldown","name":"Straight-Arm Cable Pulldown","pattern":"vertical_pull","equipment":"cable","coefficient":0.45,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"db-pullover","name":"Dumbbell Pullover","pattern":"vertical_pull","equipment":"dumbbell","coefficient":0.35,"stationProfile":"none","increment":2.5},{"id":"weighted-chinup","name":"Weighted Chin-Up","pattern":"vertical_pull","equipment":"bodyweight","coefficient":1.35,"stationProfile":"none","increment":5},{"id":"cable-overhead-triceps","name":"Cable Overhead Triceps Extension","pattern":"elbow_extension","equipment":"cable","coefficient":0.85,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"db-overhead-triceps","name":"Dumbbell Overhead Triceps Extension","pattern":"elbow_extension","equipment":"dumbbell","coefficient":0.45,"stationProfile":"none","increment":2.5},{"id":"ez-skullcrusher","name":"EZ-Bar Skullcrusher","pattern":"elbow_extension","equipment":"barbell","coefficient":0.9,"stationProfile":"none","increment":5},{"id":"bb-close-grip-bench","name":"Close-Grip Barbell Bench Press","pattern":"horizontal_press","equipment":"barbell","coefficient":0.85,"stationProfile":"bench","increment":5},{"id":"cable-triceps-kickback","name":"Cable Triceps Kickback","pattern":"elbow_extension","equipment":"cable","coefficient":0.25,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"db-reverse-fly","name":"Dumbbell Reverse Fly","pattern":"rear_delt","equipment":"dumbbell","coefficient":0.25,"stationProfile":"none","increment":2.5},{"id":"db-incline-reverse-fly","name":"Incline-Supported Dumbbell Reverse Fly","pattern":"rear_delt","equipment":"dumbbell","coefficient":0.25,"stationProfile":"none","increment":2.5},{"id":"cable-reverse-fly","name":"Cable Reverse Fly","pattern":"rear_delt","equipment":"cable","coefficient":0.5,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"cable-face-pull","name":"Cable Face Pull","pattern":"rear_delt","equipment":"cable","coefficient":0.75,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"db-arnold-press","name":"Dumbbell Arnold Press","pattern":"vertical_press","equipment":"dumbbell","coefficient":0.35,"stationProfile":"none","increment":2.5},{"id":"db-shrug","name":"Dumbbell Shrug","pattern":"traps","equipment":"dumbbell","coefficient":0.45,"stationProfile":"none","increment":2.5},{"id":"db-goblet-squat","name":"Dumbbell Goblet Squat","pattern":"squat","equipment":"dumbbell","coefficient":0.3,"stationProfile":"none","increment":2.5},{"id":"db-rdl","name":"Dumbbell Romanian Deadlift","pattern":"hinge","equipment":"dumbbell","coefficient":0.4,"stationProfile":"none","increment":2.5},{"id":"db-reverse-lunge","name":"Dumbbell Reverse Lunge","pattern":"lunge","equipment":"dumbbell","coefficient":1,"stationProfile":"none","increment":2.5},{"id":"db-walking-lunge","name":"Walking Dumbbell Lunge","pattern":"lunge","equipment":"dumbbell","coefficient":0.9,"stationProfile":"none","increment":2.5},{"id":"bb-sumo-deadlift","name":"Sumo Deadlift","pattern":"hinge","equipment":"barbell","coefficient":1,"stationProfile":"platform","increment":5},{"id":"bb-stiff-leg-deadlift","name":"Stiff-Leg Deadlift","pattern":"hinge","equipment":"barbell","coefficient":0.75,"stationProfile":"platform","increment":5},{"id":"bb-good-morning","name":"Barbell Good Morning","pattern":"hinge","equipment":"barbell","coefficient":0.4,"stationProfile":"rack","increment":5},{"id":"smith-squat","name":"Smith Machine Squat","pattern":"squat","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"allowedMachineTypes":["plate_loaded"],"machineTemplate":true},{"id":"smith-rdl","name":"Smith Machine Romanian Deadlift","pattern":"hinge","equipment":"machine","coefficient":0.85,"stationProfile":"machine","increment":5,"needsCalibration":true,"allowedMachineTypes":["plate_loaded"],"machineTemplate":true},{"id":"smith-split-squat","name":"Smith Machine Bulgarian Split Squat","pattern":"lunge","equipment":"machine","coefficient":1.8,"stationProfile":"machine","increment":5,"needsCalibration":true,"allowedMachineTypes":["plate_loaded"],"machineTemplate":true},{"id":"smith-hip-thrust","name":"Smith Machine Hip Thrust","pattern":"hip_thrust","equipment":"machine","coefficient":0.9,"stationProfile":"machine","increment":5,"needsCalibration":true,"allowedMachineTypes":["plate_loaded"],"machineTemplate":true},{"id":"machine-lunge","name":"Machine Lunge / Split Squat","pattern":"lunge","equipment":"machine","coefficient":1.8,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"smith-shoulder-press","name":"Smith Machine Shoulder Press","pattern":"vertical_press","equipment":"machine","coefficient":0.9,"stationProfile":"machine","increment":5,"needsCalibration":true,"allowedMachineTypes":["plate_loaded"],"machineTemplate":true},{"id":"ab-wheel-rollout","name":"Ab Wheel Rollout","pattern":"core","equipment":"bodyweight","coefficient":1,"stationProfile":"none","increment":5,"loadMode":"reps_only"},{"id":"hanging-leg-raise","name":"Hanging Straight-Leg Raise","pattern":"core","equipment":"bodyweight","coefficient":1,"stationProfile":"none","increment":5,"loadMode":"reps_only"},{"id":"belt-squat","name":"Belt Squat","pattern":"squat","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"pendulum-squat","name":"Pendulum Squat","pattern":"squat","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"v-squat","name":"V-Squat","pattern":"squat","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"reverse-v-squat","name":"Reverse V-Squat","pattern":"squat","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"squat-press","name":"Machine Squat Press","pattern":"squat","equipment":"machine","coefficient":2.5,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"machine-shrug","name":"Machine Seated / Standing Shrug","pattern":"traps","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"machine-deadlift","name":"Machine Deadlift","pattern":"hinge","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"assisted-pullup","name":"Machine-Assisted Pull-Up","pattern":"vertical_pull","equipment":"bodyweight","coefficient":1.3,"stationProfile":"machine","increment":5,"needsCalibration":true,"loadMode":"assisted","allowedMachineTypes":["selectorized"],"machineTemplate":true},{"id":"assisted-chinup","name":"Machine-Assisted Chin-Up","pattern":"vertical_pull","equipment":"bodyweight","coefficient":1.35,"stationProfile":"machine","increment":5,"needsCalibration":true,"loadMode":"assisted","allowedMachineTypes":["selectorized"],"machineTemplate":true},{"id":"assisted-dip","name":"Machine-Assisted Dip","pattern":"horizontal_press","equipment":"bodyweight","coefficient":1.05,"stationProfile":"machine","increment":5,"needsCalibration":true,"loadMode":"assisted","allowedMachineTypes":["selectorized"],"machineTemplate":true},{"id":"hip-adduction","name":"Machine Hip Adduction","pattern":"hip_adduction","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"isReference":true,"machineTemplate":true},{"id":"machine-glute-kickback","name":"Machine Glute Kickback / Hip Extension","pattern":"hip_extension","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"isReference":true,"machineTemplate":true},{"id":"cable-glute-kickback","name":"Cable Glute Kickback","pattern":"hip_extension","equipment":"cable","coefficient":0.5,"stationProfile":"cable","increment":5,"needsCalibration":true},{"id":"machine-torso-rotation","name":"Machine Torso Rotation","pattern":"core_rotation","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"isReference":true,"machineTemplate":true},{"id":"machine-tibialis-raise","name":"Machine Tibialis Raise / Dorsi-Flexion","pattern":"ankle_dorsiflexion","equipment":"machine","coefficient":1,"stationProfile":"machine","increment":5,"needsCalibration":true,"isReference":true,"machineTemplate":true},{"id":"reverse-hyper","name":"Machine Reverse Hyperextension","pattern":"hinge","equipment":"machine","coefficient":0.4,"stationProfile":"machine","increment":5,"needsCalibration":true,"machineTemplate":true},{"id":"glute-ham-raise","name":"Glute-Ham Raise","pattern":"knee_flexion","equipment":"bodyweight","coefficient":1,"stationProfile":"none","increment":5,"loadMode":"reps_only"}]$catalog$::jsonb);

create function private.workout_day_version(p_program uuid,p_day uuid) returns text
language sql stable security invoker set search_path='' as $$
  select md5(jsonb_build_array(
    (select to_jsonb(p) from public.program p where id=p_program and user_id=private.coach_auth_uid()),
    (select jsonb_agg(to_jsonb(d) order by position,id) from public.program_day d where program_id=p_program and user_id=private.coach_auth_uid()),
    (select jsonb_agg(to_jsonb(s) order by position,id) from public.program_slot s where program_day_id=p_day and user_id=private.coach_auth_uid()),
    (select jsonb_agg(to_jsonb(p) order by position,id) from public.program_phase p where program_id=p_program and user_id=private.coach_auth_uid()),
    (select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from public.movement_adaptation a join public.program_slot s on s.id=a.program_slot_id where s.program_day_id=p_day and a.user_id=private.coach_auth_uid())
  )::text);
$$;
revoke all on function private.workout_day_version(uuid,uuid) from public,anon,authenticated;
grant execute on function private.workout_day_version(uuid,uuid) to workout_editor_executor;

create function private.validate_workout_editor(p_plan jsonb,p_day uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare s jsonb; r jsonb; d jsonb; v jsonb; b jsonb; ids text[]:='{}';
  g text; n integer; first_i integer; last_i integer;
begin
  if p_plan->'version' is distinct from '1'::jsonb or jsonb_typeof(p_plan->'slots') is distinct from 'array'
    or jsonb_array_length(p_plan->'slots') not between 1 and 100 then raise exception 'Add at least one exercise with a working set'; end if;
  if exists(select 1 from jsonb_object_keys(p_plan) k where k not in ('version','slots','variants','dayName','phase'))
    or (p_plan ? 'dayName' and jsonb_typeof(p_plan->'dayName')<>'string') then raise exception 'Unsupported workout plan format'; end if;
  if p_plan->'phase' is not null and p_plan->'phase'<>'null'::jsonb then
    if jsonb_typeof(p_plan->'phase')<>'object' or jsonb_typeof(p_plan->'phase'->'id') is distinct from 'string'
      or jsonb_typeof(p_plan->'phase'->'name') is distinct from 'string'
      or not (p_plan->'phase' ?& array['position','description','weekStart','weekEnd','targetRirMin','targetRirMax','setMultiplier']) then raise exception 'Invalid phase context'; end if;
  end if;
  -- Deferred station selections become owner catalog rows only inside this save/start.
  for v in select value from jsonb_array_elements(coalesce(p_plan->'variants','[]')) loop
    select def into b from private.workout_editor_catalog where id=v->>'baseExerciseId';
    if b is null or coalesce(b->>'stationProfile','none')='none'
      or v->>'machineType' not in ('selectorized','plate_loaded','bench','rack','platform')
      or (b->>'stationProfile'='machine' and v->>'machineType' not in ('selectorized','plate_loaded'))
      or (b->>'stationProfile'='cable' and v->>'machineType'<>'selectorized')
      or (b->>'stationProfile' in ('bench','rack','platform') and v->>'machineType'<>b->>'stationProfile')
      or (b->'allowedMachineTypes' is not null and not (b->'allowedMachineTypes' ? (v->>'machineType')))
      or (b->>'stationProfile'<>'machine' and coalesce(trim(v->>'brand'),'')='')
      or length(coalesce(v->>'brand',''))>100 or length(coalesce(v->>'stationModel',''))>150
      or coalesce(v->>'id','')='' then raise exception 'Choose a valid specific station'; end if;
    if exists(select 1 from public.exercise where id=v->>'id' and user_id<>private.coach_auth_uid())
      or exists(select 1 from private.workout_editor_catalog where id=v->>'id') then raise exception 'Station identity conflict'; end if;
    insert into public.exercise(id,user_id,name,pattern,equipment,brand,machine_type,station_model,
      base_exercise_id,coefficient,is_reference,needs_calibration,increment)
    values(v->>'id',private.coach_auth_uid(),(b->>'name')||' — '||coalesce(v->>'brand','')||' ('||(v->>'machineType')||')',
      b->>'pattern',b->>'equipment',nullif(v->>'brand',''),v->>'machineType',nullif(v->>'stationModel',''),
      b->>'id',(b->>'coefficient')::numeric,false,coalesce((b->>'needsCalibration')::boolean,false),(b->>'increment')::numeric)
    on conflict(id) do nothing;
    if not exists(select 1 from public.exercise where id=v->>'id' and user_id=private.coach_auth_uid()
      and base_exercise_id=v->>'baseExerciseId' and brand is not distinct from nullif(v->>'brand','')
      and machine_type=v->>'machineType' and station_model is not distinct from nullif(v->>'stationModel','')) then raise exception 'Station identity changed'; end if;
  end loop;
  for s in select value from jsonb_array_elements(p_plan->'slots') loop
    if s->>'id' is null or not (s ?& array['programSlotId','supersetGroup'])
      or exists(select 1 from jsonb_object_keys(s) k where k not in ('id','programSlotId','exerciseId','equipmentInstanceId','pattern','restSeconds','supersetGroup','sets','normalSets'))
      then raise exception 'Invalid exercise plan format'; end if;
    perform (s->>'id')::uuid;
    if s->>'id'=any(ids) then raise exception 'Duplicate exercise identity'; end if;
    ids:=array_append(ids,s->>'id');
    if s->>'programSlotId' is not null and not exists(select 1 from public.program_slot
      where id=(s->>'programSlotId')::uuid and program_day_id=p_day and user_id=private.coach_auth_uid() and retired_at is null)
      then raise exception 'Exercise slot changed. Reload your workout'; end if;
    if s->>'equipmentInstanceId' is not null and not exists(select 1 from public.equipment_instance where id=(s->>'equipmentInstanceId')::uuid and user_id=private.coach_auth_uid() and exercise_id=s->>'exerciseId') then raise exception 'Equipment identity unavailable'; end if;
    select def into d from private.workout_editor_catalog where id=s->>'exerciseId';
    if d is null then
      select jsonb_build_object('pattern',e.pattern,'equipment',e.equipment,
        'loadMode',coalesce(c.def->>'loadMode','external')) into d from public.exercise e
        left join private.workout_editor_catalog c on c.id=e.base_exercise_id
        where e.id=s->>'exerciseId' and e.user_id=private.coach_auth_uid();
    elsif coalesce(d->>'stationProfile','none')<>'none' then raise exception 'Choose a specific station';
    end if;
    if d is null or d->>'pattern' is distinct from s->>'pattern' then raise exception 'Exercise unavailable'; end if;
    if (s->>'restSeconds')::numeric not between 0 and 1800 or (s->>'restSeconds')::numeric<>trunc((s->>'restSeconds')::numeric)
      or s->>'restSeconds' is null then raise exception 'Rest must be 0–1800 seconds'; end if;
    if jsonb_typeof(s->'sets') is distinct from 'array' or jsonb_array_length(s->'sets') not between 1 and 30 then raise exception 'Add at least one working set'; end if;
    if s ? 'normalSets' and (jsonb_typeof(s->'normalSets')<>'array' or jsonb_array_length(s->'normalSets') not between 1 and 30) then raise exception 'Invalid normal-week sets'; end if;
    for r in select value from jsonb_array_elements(s->'sets') union all select value from jsonb_array_elements(coalesce(s->'normalSets','[]')) loop
      if not (r ?& array['id','repMin','repMax','rirMin','rirMax','repsEdited','rirEdited','weight','suggestedWeight','targetReps','seedAt'])
        or exists(select 1 from jsonb_object_keys(r) k where k not in ('id','repMin','repMax','rirMin','rirMax','repsEdited','rirEdited','weight','suggestedWeight','targetReps','seedAt','contextAt'))
        or jsonb_typeof(r->'weight') not in ('number','null') or jsonb_typeof(r->'suggestedWeight') not in ('number','null')
        then raise exception 'Invalid set plan format'; end if;
      perform (r->>'id')::uuid;
      if r->>'suggestedWeight' is not null and (r->>'suggestedWeight')::numeric not between -2000 and 2000 then raise exception 'Invalid suggested load'; end if;
      if (r->>'targetReps')::numeric<>trunc((r->>'targetReps')::numeric) then raise exception 'Reps must be whole numbers'; end if;
      if r->>'seedAt' is not null then
        if r->>'seedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$' then raise exception 'Invalid weight seed timestamp'; end if;
        perform (r->>'seedAt')::timestamptz;
      end if;
      if r->>'contextAt' is not null then
        if r->>'contextAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$' then raise exception 'Invalid prescription timestamp'; end if;
        perform (r->>'contextAt')::timestamptz;
      end if;
      if r->>'id' is null or r->>'repMin' is null or r->>'repMax' is null or r->>'rirMin' is null or r->>'rirMax' is null
        or (r->>'repMin')::numeric not between 1 and 100 or (r->>'repMax')::numeric not between 1 and 100
        or (r->>'repMin')::numeric<>trunc((r->>'repMin')::numeric) or (r->>'repMax')::numeric<>trunc((r->>'repMax')::numeric)
        or (r->>'repMin')::numeric>(r->>'repMax')::numeric
        or (r->>'rirMin')::numeric not between 0 and 5 or (r->>'rirMax')::numeric not between 0 and 5
        or (r->>'rirMin')::numeric>(r->>'rirMax')::numeric
        or jsonb_typeof(r->'repsEdited') is distinct from 'boolean' or jsonb_typeof(r->'rirEdited') is distinct from 'boolean'
        or (r->>'targetReps')::numeric not between (r->>'repMin')::numeric and (r->>'repMax')::numeric
        or r->>'targetReps' is null then raise exception 'Invalid reps or RIR'; end if;
      if r->>'weight' is not null and ((r->>'weight')::numeric not between -2000 and 2000
        or (d->>'loadMode'='reps_only' and (r->>'weight')::numeric<>0)
        or (d->>'loadMode'='assisted' and (r->>'weight')::numeric>0)
        or (coalesce(d->>'loadMode','external') not in ('reps_only','assisted') and d->>'equipment'<>'bodyweight' and (r->>'weight')::numeric<=0)) then raise exception 'Invalid equipment load'; end if;
    end loop;
    if exists(select 1 from jsonb_array_elements(s->'sets') entry group by entry.value->>'id' having count(*)>1)
      then raise exception 'Duplicate set identity'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_plan->'slots') slot_entry cross join lateral jsonb_array_elements(slot_entry.value->'sets') row_entry group by row_entry.value->>'id' having count(*)>1) then raise exception 'Set identities must be unique across exercises'; end if;
  if exists(select 1 from jsonb_array_elements(p_plan->'slots') slot_entry cross join lateral jsonb_array_elements(coalesce(slot_entry.value->'normalSets',slot_entry.value->'sets')) row_entry group by row_entry.value->>'id' having count(*)>1) then raise exception 'Normal set identities must be unique'; end if;
  for g in select distinct value->>'supersetGroup'   from jsonb_array_elements(p_plan->'slots') where value->>'supersetGroup' is not null loop
    select count(*),min(ordinality),max(ordinality) into n,first_i,last_i
      from jsonb_array_elements(p_plan->'slots') with ordinality where value->>'supersetGroup'=g;
    if g !~ '^[A-Za-z][A-Za-z0-9_-]{0,15}$' or n<2 or last_i-first_i+1<>n then raise exception 'Keep supersets together with at least two exercises'; end if;
  end loop;
end;
$$;
revoke all on function private.validate_workout_editor(jsonb,uuid) from public,anon,authenticated;
grant execute on function private.validate_workout_editor(jsonb,uuid) to workout_editor_executor;

create function private.require_workout_occurrence(p_program uuid,p_day uuid,p_completed integer,p_source bigint) returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer; days integer; day_id uuid; revision bigint;
begin
  if private.coach_auth_uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform private.lock_coach_source();
  select source_revision into revision from public.coach_refresh_state where user_id=private.coach_auth_uid();
  if revision is distinct from p_source then raise exception 'Your workout changed. Reload to review the latest plan' using errcode='40001'; end if;
  if not exists(select 1 from public.program where id=p_program and user_id=private.coach_auth_uid() and is_active) then raise exception 'Active program changed'; end if;
  select count(*) into n from public.workout_session where user_id=private.coach_auth_uid() and program_id=p_program and finished_at is not null;
  select count(*) into days from public.program_day where user_id=private.coach_auth_uid() and program_id=p_program;
  if days=0 then raise exception 'No program days'; end if;
  select id into day_id from public.program_day where user_id=private.coach_auth_uid() and program_id=p_program order by position,id limit 1 offset mod(n,days);
  if n<>p_completed or day_id is distinct from p_day then raise exception 'Your next workout changed. Return home and reopen it' using errcode='40001'; end if;
  return n/days+1;
end;
$$;
revoke all on function private.require_workout_occurrence(uuid,uuid,integer,bigint) from public,anon,authenticated;
grant execute on function private.require_workout_occurrence(uuid,uuid,integer,bigint) to workout_editor_executor;

create function private.save_workout_plan(p_program uuid,p_day uuid,p_completed integer,p_source bigint,p_revision bigint,p_scope text,p_plan jsonb,p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing public.workout_plan; s jsonb; old_slot public.program_slot; tree jsonb:=p_plan;
  slot_id uuid; position integer:=0; intent jsonb; receipt private.workout_editor_receipt; result jsonb; style text;
begin
  if private.coach_auth_uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform private.lock_coach_source();
  intent:=jsonb_build_array(p_program,p_day,p_completed,p_source,p_revision,p_scope,p_plan);
  select * into receipt from private.workout_editor_receipt where user_id=private.coach_auth_uid() and request_id=p_request;
  if found then
    if receipt.intent<>intent then raise exception 'This save request was already used for different changes'; end if;
    return receipt.result;
  end if;
  perform private.require_workout_occurrence(p_program,p_day,p_completed,p_source);
  if p_scope not in ('workout','program') or p_scope is null then raise exception 'Invalid save scope'; end if;
  if exists(select 1 from public.workout_session where user_id=private.coach_auth_uid() and program_id=p_program and finished_at is null and program_day_id is not null) then raise exception 'A workout is already open. Resume it'; end if;
  select * into existing from public.workout_plan where user_id=private.coach_auth_uid() and program_id=p_program and program_day_id=p_day and completed_count=p_completed for update;
  if coalesce(existing.revision,0)<>p_revision then raise exception 'A newer plan was saved. Reload before saving' using errcode='40001'; end if;
  perform private.validate_workout_editor(p_plan,p_day);
  if p_scope='program' then
    select p.style into style from public.program p where p.id=p_program and p.user_id=private.coach_auth_uid();
    update public.program_slot set retired_at=now() where program_day_id=p_day and user_id=private.coach_auth_uid() and retired_at is null
      and id not in(select (value->>'programSlotId')::uuid from jsonb_array_elements(p_plan->'slots') where value->>'programSlotId' is not null);
    for s in select value from jsonb_array_elements(p_plan->'slots') loop
      slot_id:=coalesce((s->>'programSlotId')::uuid,(s->>'id')::uuid);
      select * into old_slot from public.program_slot where id=slot_id and user_id=private.coach_auth_uid();
      if (not found and exists(select 1 from public.program_slot where id=slot_id)) or (old_slot.id is not null and old_slot.program_day_id<>p_day) then raise exception 'Exercise identity conflict'; end if;
      insert into public.program_slot(id,user_id,program_day_id,position,exercise_id,pattern,target_sets,rep_min,rep_max,target_rir,rest_seconds,superset_group,set_prescriptions)
      values(slot_id,private.coach_auth_uid(),p_day,position,s->>'exerciseId',s->>'pattern',jsonb_array_length(coalesce(s->'normalSets',s->'sets')),
        (s->'sets'->0->>'repMin')::integer,(s->'sets'->0->>'repMax')::integer,(s->'sets'->0->>'rirMax')::numeric,
        (s->>'restSeconds')::integer,s->>'supersetGroup',coalesce(s->'normalSets',s->'sets'))
      on conflict(id) do update set position=excluded.position,exercise_id=excluded.exercise_id,pattern=excluded.pattern,
        target_sets=excluded.target_sets,rest_seconds=excluded.rest_seconds,superset_group=excluded.superset_group,
        set_prescriptions=excluded.set_prescriptions,retired_at=null;
      if style='fluid' and old_slot.id is not null and old_slot.exercise_id<>s->>'exerciseId' then
        insert into public.movement_adaptation(user_id,program_slot_id,exercise_id,action,new_exercise_id,ladder_step)
        values(private.coach_auth_uid(),slot_id,old_slot.exercise_id,'manual_swap',s->>'exerciseId',0);
      end if;
      tree:=jsonb_set(tree,array['slots',position::text,'programSlotId'],to_jsonb(slot_id::text));
      position:=position+1;
    end loop;
    delete from public.workout_plan where user_id=private.coach_auth_uid() and program_id=p_program and program_day_id=p_day;
  end if;
  delete from public.workout_plan where user_id=private.coach_auth_uid() and (updated_at<now()-interval '30 days'
    or (program_id=p_program and completed_count<>p_completed));
  insert into public.workout_plan(user_id,program_id,program_day_id,completed_count,revision,source_revision,day_version,plan)
    values(private.coach_auth_uid(),p_program,p_day,p_completed,p_revision+1,p_source,private.workout_day_version(p_program,p_day),tree)
    on conflict(user_id,program_id,program_day_id,completed_count) do update set revision=p_revision+1,
      source_revision=p_source,day_version=excluded.day_version,plan=excluded.plan,updated_at=now();
  result:=jsonb_build_object('revision',p_revision+1,'plan',tree);
  insert into private.workout_editor_receipt values(private.coach_auth_uid(),p_request,intent,result);
  return result;
end;
$$;
alter function private.save_workout_plan(uuid,uuid,integer,bigint,bigint,text,jsonb,uuid) owner to workout_editor_executor;
revoke all on function private.save_workout_plan(uuid,uuid,integer,bigint,bigint,text,jsonb,uuid) from public,anon;
grant execute on function private.save_workout_plan(uuid,uuid,integer,bigint,bigint,text,jsonb,uuid) to authenticated;
create function public.save_workout_plan(p_program uuid,p_day uuid,p_completed integer,p_source bigint,p_revision bigint,p_scope text,p_plan jsonb,p_request uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.save_workout_plan(p_program,p_day,p_completed,p_source,p_revision,p_scope,p_plan,p_request); $$;
revoke all on function public.save_workout_plan(uuid,uuid,integer,bigint,bigint,text,jsonb,uuid) from public,anon;
grant execute on function public.save_workout_plan(uuid,uuid,integer,bigint,bigint,text,jsonb,uuid) to authenticated;

create function private.start_workout_plan(p_program uuid,p_day uuid,p_completed integer,p_source bigint,p_revision bigint,p_plan jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved public.workout_plan; session_id uuid; week integer; tree jsonb; swaps jsonb;
begin
  if private.coach_auth_uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  perform private.lock_coach_source();
  -- Resume always wins, including a retry after a lost successful response.
  select id into session_id from public.workout_session where user_id=private.coach_auth_uid() and program_id=p_program
    and program_day_id is not null and finished_at is null order by performed_at desc limit 1;
  if found then return session_id; end if;
  week:=private.require_workout_occurrence(p_program,p_day,p_completed,p_source);
  select * into saved from public.workout_plan where user_id=private.coach_auth_uid() and program_id=p_program and program_day_id=p_day and completed_count=p_completed for update;
  if coalesce(saved.revision,0)<>p_revision then raise exception 'A newer plan was saved. Reload before starting' using errcode='40001'; end if;
  if saved.user_id is not null and (saved.updated_at<now()-interval '30 days' or saved.day_version<>private.workout_day_version(p_program,p_day)) then raise exception 'Your saved plan needs review because the program changed. Reopen and save it again' using errcode='40001'; end if;
  tree:=coalesce(saved.plan,p_plan);
  perform private.validate_workout_editor(tree,p_day);
  select jsonb_object_agg(value->>'id',value->>'exerciseId') into swaps from jsonb_array_elements(tree->'slots');
  insert into public.workout_session(user_id,program_id,program_day_id,week_index,exercise_swaps,plan_snapshot)
    values(private.coach_auth_uid(),p_program,p_day,week,swaps,tree) returning id into session_id;
  delete from public.workout_plan where user_id=private.coach_auth_uid() and program_id=p_program and program_day_id=p_day and completed_count=p_completed;
  return session_id;
end;
$$;
alter function private.start_workout_plan(uuid,uuid,integer,bigint,bigint,jsonb) owner to workout_editor_executor;
revoke all on function private.start_workout_plan(uuid,uuid,integer,bigint,bigint,jsonb) from public,anon;
grant execute on function private.start_workout_plan(uuid,uuid,integer,bigint,bigint,jsonb) to authenticated;
create function public.start_workout_plan(p_program uuid,p_day uuid,p_completed integer,p_source bigint,p_revision bigint,p_plan jsonb) returns uuid
language sql security invoker set search_path='' as $$ select private.start_workout_plan(p_program,p_day,p_completed,p_source,p_revision,p_plan); $$;
revoke all on function public.start_workout_plan(uuid,uuid,integer,bigint,bigint,jsonb) from public,anon;
grant execute on function public.start_workout_plan(uuid,uuid,integer,bigint,bigint,jsonb) to authenticated;

-- Prevent client writes from replacing an existing capture. Ordinary legacy swaps remain
-- in exercise_swaps; the snapshot loader overlays that explicitly selected identity only.
create function private.protect_workout_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
  if current_user not in ('workout_editor_executor','postgres','supabase_admin') and
    ((tg_op='INSERT' and new.plan_snapshot is not null) or (tg_op='UPDATE' and new.plan_snapshot is distinct from old.plan_snapshot))
    then raise exception 'Workout snapshots are written only by the validated start operation' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function private.protect_workout_snapshot() from public,anon,authenticated;
create trigger protect_workout_snapshot before insert or update on public.workout_session for each row execute function private.protect_workout_snapshot();

-- Builder removal retires slots, preserving set_log FKs and adaptation history. Reactivate
-- explicitly retained IDs on builder upsert. Do not convert recovery counts into normal intent.
do $$ declare body text; begin
  body:=pg_get_functiondef('public.save_program(jsonb)'::regprocedure);
  body:=replace(body,'superset_group = excluded.superset_group;','superset_group = excluded.superset_group, retired_at = null;');
  body:=replace(body,'delete from public.program_slot'||chr(10)||'      where program_day_id',
    'update public.program_slot set retired_at = now()'||chr(10)||'      where program_day_id');
  execute body;
end $$;

revoke create on schema private from workout_editor_executor;

create function private.validate_planned_log() returns trigger language plpgsql set search_path='' as $$
declare snapshot jsonb; selected jsonb; slot jsonb; r jsonb;
begin
  select plan_snapshot,exercise_swaps into snapshot,selected from public.workout_session
    where id=new.session_id and user_id=auth.uid();
  if tg_op='UPDATE' and new.session_id=old.session_id and new.exercise_id=old.exercise_id
    and new.program_slot_id is not distinct from old.program_slot_id
    and new.planned_slot_id is not distinct from old.planned_slot_id and new.planned_set_id is not distinct from old.planned_set_id then return new; end if;
  if snapshot is not null and exists(select 1 from public.workout_session where id=new.session_id and finished_at is not null) then raise exception 'Workout is already finished'; end if;
  if snapshot is null then
    if new.planned_slot_id is not null or new.planned_set_id is not null then raise exception 'Planned set requires an owned open workout snapshot'; end if;
    return new;
  end if;
  if new.planned_slot_id is null then raise exception 'Choose an exercise from this workout'; end if;
  select value into slot from jsonb_array_elements(snapshot->'slots') where value->>'id'=new.planned_slot_id::text;
  if slot is null or new.program_slot_id is distinct from (slot->>'programSlotId')::uuid
    or new.exercise_id<>coalesce(selected->>(slot->>'id'),slot->>'exerciseId') then raise exception 'Exercise does not match the saved workout'; end if;
  if new.equipment_instance_id is distinct from (case when new.exercise_id=slot->>'exerciseId' then (slot->>'equipmentInstanceId')::uuid else null end) then raise exception 'Equipment does not match the saved workout'; end if;
  if new.planned_set_id is not null then
    select value into r from jsonb_array_elements(slot->'sets') where value->>'id'=new.planned_set_id::text;
    if r is null then raise exception 'Set does not belong to this workout'; end if;
    if exists(select 1 from public.set_log where session_id=new.session_id and planned_set_id=new.planned_set_id and id<>new.id)
      then raise exception 'This planned set is already logged' using errcode='23505'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_planned_log() from public,anon,authenticated;
create trigger validate_planned_log before insert or update on public.set_log for each row execute function private.validate_planned_log();
create unique index set_log_one_planned_row on public.set_log(session_id,planned_set_id) where planned_set_id is not null;

-- Per-set prescription storage is writable only through validated editor operations.
create function private.protect_set_prescriptions() returns trigger language plpgsql set search_path='' as $$
begin
  if current_user not in ('workout_editor_executor','postgres','supabase_admin') then
    if (tg_op='INSERT' and new.set_prescriptions is not null) or
      (tg_op='UPDATE' and new.set_prescriptions is distinct from old.set_prescriptions) then
      raise exception 'Save per-set prescriptions through the workout editor' using errcode='42501';
    end if;
  end if;
  if tg_op='UPDATE' and new.set_prescriptions is not null and new.set_prescriptions is not distinct from old.set_prescriptions then
    -- The full program builder still authors uniform scalar fields. Preserve untouched
    -- per-set intent, but apply an explicit builder count/range/effort edit coherently.
    if new.target_sets<>old.target_sets then
      select jsonb_agg(case when i>=jsonb_array_length(old.set_prescriptions)
        then old.set_prescriptions->(jsonb_array_length(old.set_prescriptions)-1)||jsonb_build_object('id',gen_random_uuid()::text)
        else old.set_prescriptions->i end order by i) into new.set_prescriptions
        from generate_series(0,new.target_sets-1) i;
    end if;
    if new.rep_min<>old.rep_min or new.rep_max<>old.rep_max then
      select jsonb_agg(value||jsonb_build_object('repMin',new.rep_min,'repMax',new.rep_max,
        'targetReps',new.rep_min,'repsEdited',true,'contextAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by ordinality)
        into new.set_prescriptions from jsonb_array_elements(new.set_prescriptions) with ordinality;
    end if;
    if new.target_rir<>old.target_rir then
      select jsonb_agg(value||jsonb_build_object('rirMin',new.target_rir,'rirMax',new.target_rir,
        'rirEdited',true,'contextAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by ordinality)
        into new.set_prescriptions from jsonb_array_elements(new.set_prescriptions) with ordinality;
    end if;
    if new.exercise_id<>old.exercise_id then
      select jsonb_agg(value||'{"weight":null,"suggestedWeight":null,"seedAt":null}'::jsonb order by ordinality)
        into new.set_prescriptions from jsonb_array_elements(new.set_prescriptions) with ordinality;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_set_prescriptions() from public,anon,authenticated;
create trigger protect_set_prescriptions before insert or update on public.program_slot for each row execute function private.protect_set_prescriptions();

-- Snapshot-only additions have no program-slot FK; preserve ordinary in-session swaps.
do $$ declare body text; begin
  body:=pg_get_functiondef('public.swap_session_exercise(uuid,uuid,text,text,text)'::regprocedure);
  body:=replace(body,'  select * into v_slot from public.program_slot',
    '  if v_session.plan_snapshot is not null and exists(select 1 from jsonb_array_elements(v_session.plan_snapshot->''slots'') s where s->>''id''=p_slot_id::text and s->>''programSlotId'' is null) then
      if p_scope<>''workout'' then raise exception ''This added exercise belongs only to this workout''; end if;
      update public.workout_session set exercise_swaps=jsonb_set(exercise_swaps,array[p_slot_id::text],to_jsonb(p_exercise_id)) where id=p_session_id and user_id=v_user;
      return;
    end if;
  select * into v_slot from public.program_slot');
  execute body;
end $$;
