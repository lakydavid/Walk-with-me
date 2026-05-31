-- Post-processing: run AFTER 00_areas.sql and all NN_streets.sql.
-- 1. geographic length of each street
-- 2. assign each street to the district that contains its midpoint
-- 3. cache per-area street_count + total length
begin;

update streets
set length_m = ST_Length(geom::geography)
where length_m = 0 or length_m is null;

update streets s
set area_id = a.id
from areas a
where a.kind = 'district'
  and ST_Contains(a.geom, ST_LineInterpolatePoint(s.geom, 0.5));

update areas a
set street_count = sub.cnt,
    total_street_length_m = sub.tot
from (
  select area_id, count(*) as cnt, sum(length_m) as tot
  from streets group by area_id
) sub
where sub.area_id = a.id;

commit;

-- Sanity check:
select a.name, a.street_count, round(a.total_street_length_m/1000) as km
from areas a where a.kind = 'district' order by a.name;
