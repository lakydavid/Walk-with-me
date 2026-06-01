-- Assign "orphan" streets to the nearest district.
--
-- 99_postprocess.sql assigns each street to the district whose polygon
-- CONTAINS the street midpoint. A small number of streets (~0.35%) have a
-- midpoint that lands exactly on a district border or just outside any
-- district polygon, so they stay attached to the city. Here we attach each
-- such street to the geometrically nearest district, then refresh the
-- cached per-area aggregates. Idempotent.
begin;

update streets s
set area_id = (
  select a.id
  from areas a
  where a.kind = 'district'
  order by a.geom <-> ST_LineInterpolatePoint(s.geom, 0.5)
  limit 1
)
where s.area_id = (select id from areas where kind = 'city');

update areas a
set street_count = sub.cnt,
    total_street_length_m = sub.tot
from (
  select area_id, count(*) as cnt, sum(length_m) as tot
  from streets group by area_id
) sub
where sub.area_id = a.id;

-- Reset cached counts on areas that no longer have any streets (e.g. the
-- city row after the orphan reassignment), since the GROUP BY update above
-- only touches rows that are present in the aggregate result.
update areas
set street_count = 0, total_street_length_m = 0
where id not in (select distinct area_id from streets where area_id is not null);

commit;

-- Verify: should now be 0.
select count(*) as still_orphan
from streets
where area_id = (select id from areas where kind = 'city');
