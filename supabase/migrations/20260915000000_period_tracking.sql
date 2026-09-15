-- Female-only opt-in period tracking: profile fields, observations table, and RLS.
-- V1: observed bleeding days only; no predictions, no external sharing, no training automation.

-- Add sex and period tracking consent fields to profile
alter table public.profile
  add column sex text not null default 'unspecified',
  add column period_tracking_enabled boolean not null default false,
  add column period_consent_version text,
  add column period_consent_granted_at timestamptz;

-- Constrain sex field to known values for data integrity
alter table public.profile
  add constraint profile_sex_check check (sex in ('unspecified', 'male', 'female'));

comment on column public.profile.sex is 'Optional sex disclosure for period tracking eligibility. Default unspecified.';
comment on column public.profile.period_tracking_enabled is 'Whether user has consented to period tracking. Requires sex = female.';
comment on column public.profile.period_consent_version is 'Consent version granted (e.g. "v1"). Null when tracking disabled or never enabled.';
comment on column public.profile.period_consent_granted_at is 'When consent was first granted. Retained on disable if history kept.';

-- Date-only period observations. One row per observed menstrual bleeding day.
-- Aligned with America/Chicago timezone (same as bodyweight_log).
create table public.period_observation (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  observed_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint period_observation_user_date_key unique (user_id, observed_on),
  constraint period_observation_not_future_check check (observed_on <= current_date)
);

create index idx_period_observation_user_date on public.period_observation (user_id, observed_on);

alter table public.period_observation enable row level security;

-- Owner-scoped access. Application-level queries enforce period_tracking_enabled check.
create policy "users manage own period observations"
on public.period_observation
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.period_observation to authenticated;

comment on table public.period_observation is 'Daily menstrual period observations. Only visible when profile.sex = female AND period_tracking_enabled = true.';
