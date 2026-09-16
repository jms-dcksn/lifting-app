-- Local-only setup for the pgTAP suite under supabase/tests/.
-- Seeds run on `supabase start` and `supabase db reset`. They are never applied by
-- `supabase db push`, so this does not add pgtap to a deployed project.
create extension if not exists pgtap with schema extensions;
