-- Minimal subjective context belongs to the workout it describes. workout_session already
-- has user ownership, RLS, and an unused notes column, so keep the data atomic here.
alter table public.workout_session
  add column if not exists readiness smallint,
  add column if not exists joint_pain text;

alter table public.workout_session
  drop constraint if exists workout_session_readiness_check,
  add constraint workout_session_readiness_check
    check (readiness is null or readiness between 1 and 5),
  drop constraint if exists workout_session_joint_pain_check,
  add constraint workout_session_joint_pain_check
    check (joint_pain is null or joint_pain in ('none', 'mild', 'significant')),
  drop constraint if exists workout_session_notes_length_check,
  add constraint workout_session_notes_length_check
    check (notes is null or char_length(notes) <= 280);

comment on column public.workout_session.readiness is
  'Optional pre-workout readiness score from 1 (low) to 5 (high).';
comment on column public.workout_session.joint_pain is
  'Optional post-workout joint-pain signal: none, mild, or significant.';
comment on column public.workout_session.notes is
  'Optional plain-text post-workout note, capped at 280 characters.';
