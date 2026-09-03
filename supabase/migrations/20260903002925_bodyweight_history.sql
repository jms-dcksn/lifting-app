-- Date-keyed bodyweight observations. profile.bodyweight remains the immutable fallback
-- for accounts that have not logged history; application reads prefer the newest row here.
create table public.bodyweight_log (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users on delete cascade,
  logged_on  date not null,
  weight     numeric(6, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bodyweight_log_weight_check check (weight > 0 and weight <= 1500),
  constraint bodyweight_log_not_future_check check (logged_on <= current_date),
  constraint bodyweight_log_user_date_key unique (user_id, logged_on)
);

alter table public.bodyweight_log enable row level security;

create policy "users manage own bodyweight history"
on public.bodyweight_log
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.bodyweight_log to authenticated;
