# Copilot Instructions for Bidly

## Supabase Migration Push Workaround

There is a known issue with `supabase db push`: the local migrations directory contains two files with the `010` prefix:

- `010_league_started_at_and_xi_confirmed.sql` (tracked remotely)
- `010_private_league_host_delete.sql` (already applied remotely but not tracked in `schema_migrations`)

This causes `supabase db push` to fail with a duplicate key error on version `010`.

### Workaround

Temporarily rename the conflicting file before pushing, then restore it:

```bash
# 1. Rename to skip it (non-numeric prefix is ignored by supabase)
mv supabase/migrations/010_private_league_host_delete.sql supabase/migrations/010b_private_league_host_delete.sql

# 2. Push with --include-all (needed because 010b is out of order)
npx supabase db push --include-all

# 3. Restore the original filename
mv supabase/migrations/010b_private_league_host_delete.sql supabase/migrations/010_private_league_host_delete.sql
```

The proper long-term fix is to rename `010_private_league_host_delete.sql` to a unique timestamp-based prefix and repair the remote migration history, but this workaround is safe for now since the migration content (`DROP POLICY IF EXISTS` + `CREATE POLICY`) is idempotent.
