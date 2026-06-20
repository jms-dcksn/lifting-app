-- Program metadata: reuse the unused `notes` column as a description, add free-text tags.
alter table public.program rename column notes to description;
alter table public.program add column tags text[] not null default '{}';
