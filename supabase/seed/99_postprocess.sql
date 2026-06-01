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

-- Fallback: streets whose midpoint landed on a border (still attached to the
-- city) go to the geometrically nearest district. A correlated subselect is
-- used because UPDATE's target table can't be referenced from a LATERAL in
-- the FROM clause.
update streets s
set area_id = (
  select a.id from areas a
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

-- Zero out areas that no longer have any streets pointing to them
-- (e.g. the city row, once the orphan reassignment moved all its streets
-- to districts). The aggregate update above only touches rows that ARE in
-- the GROUP BY result, so a "drained" area would keep its stale count.
update areas
set street_count = 0, total_street_length_m = 0
where id not in (select distinct area_id from streets where area_id is not null);

commit;

-- Sanity check:
select a.name, a.street_count, round(a.total_street_length_m/1000) as km
from areas a where a.kind = 'district' order by a.name;
