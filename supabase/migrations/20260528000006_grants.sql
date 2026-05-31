-- Table-level grants for the Data API (PostgREST)
--
-- RLS policies gate *which rows* a role can see, but PostgREST also needs
-- table-level GRANTs for the role to touch the table at all. Supabase
-- normally auto-grants these to anon/authenticated for new public tables,
-- but a `drop schema public cascade` (used to reset during setup) removes
-- the default-privilege wiring, so we grant explicitly here. This migration
-- is idempotent and safe to re-run.

-- Public reference data: readable by everyone (it's public OSM data).
grant select on areas   to anon, authenticated;
grant select on streets to anon, authenticated;

-- Per-user data: authenticated may read and delete their own rows (RLS
-- restricts to auth.uid() = user_id). Writes go only through the
-- SECURITY DEFINER ingest_walk RPC, so we deliberately do NOT grant
-- INSERT/UPDATE here.
grant select, delete on user_street_progress to authenticated;
grant select, delete on walk_sessions        to authenticated;

-- Aggregate view.
grant select on user_area_progress to authenticated;

-- ingest_batches and rpc_calls stay ungranted: only SECURITY DEFINER
-- functions touch them.

-- Make future objects in this schema readable too, so a later reset or new
-- reference table doesn't silently 401. (Mirrors Supabase's own defaults.)
alter default privileges in schema public grant select on tables to anon, authenticated;
