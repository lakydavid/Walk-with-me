-- Map matching + progress update (hardened)
--
-- ingest_walk(batch_id, session_id, points) is called by the mobile app
-- after each walk (or in batches during a long walk). It:
--   0. Validates the batch (size, rate limit, idempotency, coords, times).
--   1. Drops point pairs that imply > 12 km/h ground speed (anti-cheat /
--      vehicle filter), and points with timestamps in the future or in the
--      far past.
--   2. Snaps each remaining GPS point to the nearest street within 25 m.
--   3. Builds the per-street walked sub-line.
--   4. Unions it with the existing walked_geom for that user/street.
--   5. Recomputes covered length and flips `completed` once coverage >= 0.75.
--
-- Returns one row per affected street, including a reliable
-- newly_completed flag.

create or replace function ingest_walk(
  p_batch_id uuid,
  p_session_id uuid,
  p_points jsonb        -- array of {lat, lng, ts}
)
returns table (
  street_id bigint,
  coverage_ratio double precision,
  completed boolean,
  newly_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_match_radius_m       constant double precision := 25.0;
  v_completion_threshold constant double precision := 0.75;
  v_max_speed_mps        constant double precision := 3.333;  -- 12 km/h
  v_max_points           constant int              := 500;
  v_rate_limit_per_min   constant int              := 60;
  v_point_count int;
  v_recent_calls int;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- ------------------------------------------------------------------ 0a
  -- Input validation: shape + size.
  if p_batch_id is null or p_session_id is null or p_points is null then
    raise exception 'batch_id, session_id and points are required'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_points) <> 'array' then
    raise exception 'points must be a JSON array' using errcode = '22023';
  end if;
  v_point_count := jsonb_array_length(p_points);
  if v_point_count = 0 then
    return;
  end if;
  if v_point_count > v_max_points then
    raise exception 'batch too large: % > %', v_point_count, v_max_points
      using errcode = '22023';
  end if;

  -- ------------------------------------------------------------------ 0b
  -- Rate limit: count this user's calls in the last 60 seconds.
  select count(*) into v_recent_calls
  from rpc_calls
  where user_id = v_user
    and rpc_name = 'ingest_walk'
    and called_at > now() - interval '1 minute';
  if v_recent_calls >= v_rate_limit_per_min then
    raise exception 'rate limit exceeded' using errcode = '53400';
  end if;
  insert into rpc_calls(user_id, rpc_name) values (v_user, 'ingest_walk');
  -- Opportunistic cleanup so the table doesn't grow unbounded.
  delete from rpc_calls
  where user_id = v_user
    and called_at < now() - interval '5 minutes';

  -- ------------------------------------------------------------------ 0c
  -- Idempotency: if this batch was already processed, return empty.
  if exists (select 1 from ingest_batches where batch_id = p_batch_id) then
    return;
  end if;
  insert into ingest_batches(batch_id, user_id, session_id)
  values (p_batch_id, v_user, p_session_id);

  -- ------------------------------------------------------------------ 1
  -- Persist the raw path (upsert by session_id, preserve started_at).
  insert into walk_sessions(id, user_id, started_at, path, point_count, raw_length_m)
  select
    p_session_id, v_user,
    (p_points -> 0 ->> 'ts')::timestamptz,
    ST_MakeLine(arr.geom order by arr.idx),
    v_point_count,
    ST_Length(ST_MakeLine(arr.geom order by arr.idx)::geography)
  from (
    select
      ordinality - 1 as idx,
      ST_SetSRID(ST_MakePoint((pt ->> 'lng')::float, (pt ->> 'lat')::float), 4326) as geom
    from jsonb_array_elements(p_points) with ordinality as t(pt, ordinality)
  ) arr
  on conflict (id) do update set
    -- append, don't replace
    path = ST_MakeLine(walk_sessions.path, excluded.path),
    point_count = walk_sessions.point_count + excluded.point_count,
    raw_length_m = walk_sessions.raw_length_m + excluded.raw_length_m,
    ended_at = now();

  -- ------------------------------------------------------------------ 2
  -- Build a cleaned point set with validation + speed filter.
  return query
  with raw_points as (
    select
      ordinality - 1 as idx,
      (pt ->> 'ts')::timestamptz as ts,
      (pt ->> 'lat')::float as lat,
      (pt ->> 'lng')::float as lng
    from jsonb_array_elements(p_points) with ordinality as t(pt, ordinality)
  ),
  -- Drop coords outside the WGS84 envelope, timestamps in the future or
  -- older than 30 days (likely tampered), and any point whose distance
  -- from the previous accepted point implies > 12 km/h ground speed.
  validated as (
    select
      idx, ts,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326) as g
    from raw_points
    where lat between -90 and 90
      and lng between -180 and 180
      and ts <= now() + interval '5 minutes'
      and ts >= now() - interval '30 days'
  ),
  speed_filtered as (
    select idx, ts, g,
           lag(g)  over (order by idx) as prev_g,
           lag(ts) over (order by idx) as prev_ts
    from validated
  ),
  accepted as (
    select idx, ts, g
    from speed_filtered
    where prev_g is null
       or extract(epoch from (ts - prev_ts)) <= 0
       or ST_Distance(g::geography, prev_g::geography)
            / nullif(extract(epoch from (ts - prev_ts)), 0)
          <= v_max_speed_mps
  ),
  -- ----------------------------------------------------------------- 3
  -- Snap each accepted point to the nearest street within 25 m.
  snapped as (
    select
      p.idx, p.ts, s.id as street_id,
      s.geom as street_geom,
      s.length_m as street_length_m,
      ST_LineLocatePoint(s.geom, p.g) as frac
    from accepted p
    cross join lateral (
      select s.id, s.geom, s.length_m
      from streets s
      where ST_DWithin(s.geom::geography, p.g::geography, v_match_radius_m)
      order by s.geom <-> p.g
      limit 1
    ) s
  ),
  -- Group consecutive points snapped to the same street; take the
  -- [min(frac), max(frac)] span as the walked sub-segment.
  runs as (
    select
      street_id, street_geom, street_length_m, grp,
      min(frac) as f0, max(frac) as f1
    from (
      select *,
             sum(case when prev_street is distinct from street_id then 1 else 0 end)
               over (order by idx) as grp
      from (
        select idx, street_id, street_geom, street_length_m, frac,
               lag(street_id) over (order by idx) as prev_street
        from snapped
      ) s
    ) g
    group by street_id, street_geom, street_length_m, grp
    having max(frac) - min(frac) > 1e-6
  ),
  sub_lines as (
    select street_id, street_geom, street_length_m,
           ST_LineSubstring(street_geom, f0, f1) as walked
    from runs
  ),
  per_street as (
    select street_id, street_length_m,
           ST_Multi(ST_LineMerge(ST_Collect(walked))) as added_geom
    from sub_lines
    group by street_id, street_length_m
  ),
  -- ----------------------------------------------------------------- 4
  -- Read the pre-existing state so we can compute newly_completed reliably.
  before as (
    select street_id, completed as was_completed
    from user_street_progress
    where user_id = v_user
      and street_id in (select street_id from per_street)
  ),
  -- ----------------------------------------------------------------- 5
  -- Union with existing walked_geom; recompute coverage; flip completed.
  upserts as (
    insert into user_street_progress as usp (
      user_id, street_id, walked_geom, walked_length_m,
      coverage_ratio, completed, completed_at, updated_at
    )
    select
      v_user,
      ps.street_id,
      ST_Multi(ps.added_geom),
      ST_Length(ps.added_geom::geography),
      least(1.0, ST_Length(ps.added_geom::geography) / ps.street_length_m),
      ST_Length(ps.added_geom::geography) / ps.street_length_m >= v_completion_threshold,
      case
        when ST_Length(ps.added_geom::geography) / ps.street_length_m >= v_completion_threshold
          then now()
        else null
      end,
      now()
    from per_street ps
    on conflict (user_id, street_id) do update
    set
      walked_geom = ST_Multi(ST_LineMerge(
                      ST_Union(usp.walked_geom, excluded.walked_geom))),
      walked_length_m = ST_Length(
                      ST_LineMerge(ST_Union(usp.walked_geom, excluded.walked_geom))::geography),
      coverage_ratio = least(1.0,
                      ST_Length(ST_LineMerge(ST_Union(usp.walked_geom, excluded.walked_geom))::geography)
                      / (select length_m from streets where id = usp.street_id)),
      completed = (
                      ST_Length(ST_LineMerge(ST_Union(usp.walked_geom, excluded.walked_geom))::geography)
                      / (select length_m from streets where id = usp.street_id)
                    ) >= v_completion_threshold,
      completed_at = case
        when usp.completed then usp.completed_at
        when (
          ST_Length(ST_LineMerge(ST_Union(usp.walked_geom, excluded.walked_geom))::geography)
          / (select length_m from streets where id = usp.street_id)
        ) >= v_completion_threshold then now()
        else null
      end,
      updated_at = now()
    returning usp.street_id, usp.coverage_ratio, usp.completed
  )
  select
    u.street_id,
    u.coverage_ratio,
    u.completed,
    u.completed and not coalesce(b.was_completed, false) as newly_completed
  from upserts u
  left join before b using (street_id);

  -- Mark the session as processed.
  update walk_sessions set processed = true where id = p_session_id;
end;
$$;

revoke all on function ingest_walk(uuid, uuid, jsonb) from public;
grant execute on function ingest_walk(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- AREA PROGRESS VIEW
-- ---------------------------------------------------------------------------
-- Cheap-to-query summary: per user and per area, how many streets done and
-- what fraction of the area's total street length the user has walked.

create or replace view user_area_progress
with (security_invoker = true) as
select
  usp.user_id,
  s.area_id,
  count(*) filter (where usp.completed) as streets_completed,
  count(*)                              as streets_started,
  coalesce(sum(usp.walked_length_m), 0) as walked_length_m,
  a.street_count                        as streets_total,
  a.total_street_length_m               as length_total_m,
  case when a.total_street_length_m > 0
       then coalesce(sum(usp.walked_length_m), 0) / a.total_street_length_m
       else 0
  end as area_coverage_ratio
from user_street_progress usp
join streets s on s.id = usp.street_id
join areas   a on a.id = s.area_id
group by usp.user_id, s.area_id, a.street_count, a.total_street_length_m;

grant select on user_area_progress to authenticated;
