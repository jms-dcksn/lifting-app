-- Display preference for Board tiles. Defaults are not rows until unpinned.
-- Extra lifts become rows when pinned. Hidden defaults are rows whose
-- exercise_id matches a Board compound. Cap 8 is enforced in the application.
create table public.user_exercise_pin (
  user_id     uuid not null references auth.users on delete cascade,
  exercise_id text not null,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, exercise_id),
  constraint user_exercise_pin_exercise_id_check check (char_length(exercise_id) between 1 and 80),
  constraint user_exercise_pin_position_check check (position >= 0)
);

alter table public.user_exercise_pin enable row level security;

create policy "users manage own exercise pins"
on public.user_exercise_pin
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.user_exercise_pin to authenticated;
