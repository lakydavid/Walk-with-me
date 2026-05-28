-- streets_in_bbox(min_lng, min_lat, max_lng, max_lat)
--
-- Returns every street whose geometry intersects the given lat/lng box,
-- joined with the caller's progress. Output rows are shaped for direct
-- consumption by the mobile map view.

create or replace function streets_in_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision
)
returns table (
  id        bigint,
  name      text,
  geom      jsonb,
  coverage  double precision,
  completed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with bbox as (
    select ST_MakeEnvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326) as g
  )
  select
    s.id,
    s.name,
    ST_AsGeoJSON(s.geom)::jsonb as geom,
    coalesce(usp.coverage_ratio, 0)::double precision as coverage,
    coalesce(usp.completed, false) as completed
  from streets s
  join bbox b on s.geom && b.g
  left join user_street_progress usp
    on usp.street_id = s.id and usp.user_id = auth.uid()
  -- Cap so a huge bbox doesn't melt the client.
  limit 5000;
$$;

revoke all on function streets_in_bbox(double precision, double precision, double precision, double precision) from public;
grant execute on function streets_in_bbox(double precision, double precision, double precision, double precision) to authenticated;
