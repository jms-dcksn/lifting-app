-- Add idempotency_key to set_log for safe retries (#52).
-- Client generates one UUID per log intent; retries reuse the same key.
-- Server returns existing row on unique conflict instead of inserting duplicate.

alter table public.set_log
  add column idempotency_key uuid;

-- Partial unique index: one insert per (session, idempotency_key) when key is present.
-- Old sets without keys remain unaffected; new writes with keys prevent duplicates.
create unique index set_log_session_idempotency_key_idx
  on public.set_log (session_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.set_log.idempotency_key is 'Optional client-generated UUID for safe retries. Same key prevents duplicate inserts within a session.';
