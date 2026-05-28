-- Data retention
--
-- Raw walks are kept for 90 days, then deleted (their effects on
-- user_street_progress have long since been computed). ingest_batches is
-- kept for 7 days — long enough for any reasonable client retry.
--
-- We expose these as functions and let the operator wire them to pg_cron
-- (a Supabase add-on) or call them manually. Doing the schedule in SQL
-- ties the policy to the migration history.

create or replace function purge_old_walks()
returns table(deleted_sessions bigint, deleted_batches bigint, deleted_rpc_log bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessions bigint;
  v_batches  bigint;
  v_rpc      bigint;
begin
  with d as (delete from walk_sessions
             where created_at < now() - interval '90 days' returning 1)
    select count(*) into v_sessions from d;
  with d as (delete from ingest_batches
             where created_at < now() - interval '7 days' returning 1)
    select count(*) into v_batches from d;
  with d as (delete from rpc_calls
             where called_at < now() - interval '1 day' returning 1)
    select count(*) into v_rpc from d;
  return query select v_sessions, v_batches, v_rpc;
end;
$$;

revoke all on function purge_old_walks() from public;
-- Not granted to authenticated; only the operator (postgres / pg_cron) runs it.

-- Example: schedule with pg_cron (enable the extension in the Supabase
-- Dashboard first, then run manually):
--
--   select cron.schedule('walk-with-me-retention', '17 3 * * *',
--                        $$select purge_old_walks();$$);
