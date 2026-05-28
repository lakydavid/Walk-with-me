-- Account deletion
--
-- Play Store policy (since 2024) requires apps that maintain accounts to
-- offer in-app account deletion. delete_my_account() removes the caller's
-- auth user; all per-user tables cascade-delete via their foreign keys.
--
-- The function runs as SECURITY DEFINER (owned by postgres) because regular
-- authenticated users have no rights on the auth.users table. It checks
-- auth.uid() so a user can only delete themselves.

create or replace function delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Explicit deletes first (in case any future table forgets ON DELETE
  -- CASCADE). Order doesn't matter because each table references auth.users.
  delete from user_street_progress where user_id = v_user;
  delete from walk_sessions         where user_id = v_user;
  delete from ingest_batches        where user_id = v_user;
  delete from rpc_calls             where user_id = v_user;

  -- Finally, delete the auth user. Supabase's auth.users.id is referenced
  -- by all our per-user tables with ON DELETE CASCADE as a safety net.
  delete from auth.users where id = v_user;
end;
$$;

revoke all on function delete_my_account() from public;
grant execute on function delete_my_account() to authenticated;
