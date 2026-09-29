# Files

- [Data model and ownership boundaries](data-model.md) - Explains the Postgres schema in supabase/migrations — core lifting and program tables, shipped owner-scoped agent threads, the RLS pattern, additive migrations, and the atomic-write RPCs that guard multi-table invariants.
- [System overview and request path](overview.md) - Explains lifting-app's three-layer architecture, the proxy/layout/action auth split, request memoization, set_log mutation revalidation, and why derived caches sit beside the ledger.
