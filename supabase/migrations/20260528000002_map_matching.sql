-- Map matching + progress update
--
-- ingest_walk(session_id, points) is called by the mobile app after each walk
-- (or in batches during a long walk). It:
--   1. Snaps each GPS point to the nearest street segment within 25 m.
--   2. Builds the per-street walked sub-line.
--   3. Unions it with the existing walked_geom for that user/street.
--   4. Recomputes covered length and flips `completed` once coverage >= 0.75.
--
-- The algorithm is intentionally simple ("nearest segment") — good enough for
-- foot traffic on dense urban grids. We can swap in an HMM matcher later
-- without changing the contract.

create or replace function ingest_walk(
  p_session_id uuid,
  p_points jsonb        -- array of {lat, lng, ts}
)
returns table (
  street_id bigint,
  added_length_m double precision,
  coverage_ratio double precision,
  newly_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_match_radius_m constant double precision := 25.0;
  v_completion_threshold constant double precision := 0.75;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  -- 1. Persist the raw path for this session (idempotent upsert by id).
  insert into walk_sessions(id, user_id, started_at, path, point_count, raw_length_m)
  select
    p_session_id,
    v_user,
    (p_points -> 0 ->> 'ts')::timestamptz,
    ST_MakeLine(arr.geom order by arr.idx),
    jsonb_array_length(p_points),
    ST_Length(ST_MakeLine(arr.geom order by arr.idx)::geography)
  from (
    select
      ordinality - 1 as idx,
      ST_SetSRID(ST_MakePoint((pt ->> 'lng')::float, (pt ->> 'lat')::float), 4326) as geom
    from jsonb_array_elements(p_points) with ordinality as t(pt, ordinality)
  ) arr
  on conflict (id) do update set
    path = excluded.path,
    point_count = excluded.point_count,
    raw_length_m = excluded.raw_length_m;

  -- 2. Snap every point to its nearest street within v_match_radius_m.
  --    We project the point onto the street as a fraction (0..1) along the
  --    LineString. Consecutive snapped points on the same street become a
  --    sub-line via ST_LineSubstring.
  return query
  with points as (
    select
      ordinality - 1 as idx,
      ST_SetSRID(ST_MakePoint((pt ->> 'lng')::float, (pt ->> 'lat')::float), 4326) as g
    from jsonb_array_elements(p_points) with ordinality as t(pt, ordinality)
  ),
  snapped as (
    select
      p.idx,
      s.id as street_id,
      s.geom as street_geom,
      s.length_m as street_length_m,
      ST_LineLocatePoint(s.geom, p.g) as frac
    from points p
    cross join lateral (
      select s.id, s.geom, s.length_m
      from streets s
      where ST_DWithin(s.geom::geography, p.g::geography, v_match_radius_m)
      order by s.geom <-> p.g
      limit 1
    ) s
  ),
  -- 3. Group consecutive points snapped to the same street and take the
  --    [min(frac), max(frac)] interval as the walked sub-segment.
  runs as (
    select
      street_id,
      street_geom,
      street_length_m,
      grp,
      min(frac) as f0,
      max(frac) as f1
    from (
      select
        *,
        sum(case when prev_street is distinct from street_id then 1 else 0 end)
          over (order by idx) as grp
      from (
        select
          idx, street_id, street_geom, street_length_m, frac,
          lag(street_id) over (order by idx) as prev_street
        from snapped
      ) s
    ) g
    group by street_id, street_geom, street_length_m, grp
    having max(frac) - min(frac) > 1e-6
  ),
  sub_lines as (
    select
      street_id,
      street_geom,
      street_length_m,
      ST_LineSubstring(street_geom, f0, f1) as walked
    from runs
  ),
  -- 4. Merge per-street so that each street appears once in this batch.
  per_street as (
    select
      street_id,
      street_length_m,
      ST_Multi(ST_LineMerge(ST_Collect(walked))) as added_geom
    from sub_lines
    group by street_id, street_length_m
  ),
  -- 5. Union with existing walked_geom and recompute coverage.
  upserts as (
    insert into user_street_progress as usp (
      user_id, street_id, walked_geom, walked_length_m, completed, completed_at, updated_at
    )
    select
      v_user,
      ps.street_id,
      ST_Multi(ps.added_geom),
      ST_Length(ps.added_geom::geography),
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
      walked_geom = ST_Multi(ST_LineMerge(ST_Union(usp.walked_geom, excluded.walked_geom))),
      walked_length_m = ST_Length(
        ST_LineMerge(ST_Union(usp.walked_geom, excluded.walked_geom))::geography
      ),
      completed = (
        ST_Length(
          ST_LineMerge(ST_Union(usp.walked_geom, excluded.walked_geom))::geography
        ) / (select length_m from streets where id = usp.street_id)
      ) >= v_completion_threshold,
      completed_at = case
        when usp.completed then usp.completed_at
        when (
          ST_Length(
            ST_LineMerge(ST_Union(usp.walked_geom, excluded.walked_geom))::geography
          ) / (select length_m from streets where id = usp.street_id)
        ) >= v_completion_threshold then now()
        else null
      end,
      updated_at = now()
    returning
      usp.street_id,
      usp.walked_length_m,
      usp.coverage_ratio,
      usp.completed and usp.completed_at >= now() - interval '1 second' as newly_completed
  )
  select * from upserts;

  -- Mark the session as processed.
  update walk_sessions set processed = true where id = p_session_id;
end;
$$;

revoke all on function ingest_walk(uuid, jsonb) from public;
grant execute on function ingest_walk(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- AREA PROGRESS VIEW
-- ---------------------------------------------------------------------------
-- Cheap-to-query summary: per user and per area, how many streets done and
-- what fraction of the area's total street length the user has walked.

create or replace view user_area_progress as
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
