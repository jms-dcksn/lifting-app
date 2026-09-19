-- Date-keyed tape observations. One row is one site on one date.
create table public.body_measurement_log (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users on delete cascade,
  logged_on  date not null,
  site       text not null,
  inches     numeric(4, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint body_measurement_log_site_check check (site in ('waist', 'neck', 'arm', 'thigh', 'chest')),
  constraint body_measurement_log_inches_check check (inches > 0 and inches <= 80),
  constraint body_measurement_log_not_future_check check (logged_on <= current_date),
  constraint body_measurement_log_user_date_site_key unique (user_id, logged_on, site)
);

alter table public.body_measurement_log enable row level security;

create policy "users manage own body measurements"
on public.body_measurement_log
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.body_measurement_log to authenticated;
