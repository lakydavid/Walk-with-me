/*
 * One-off generator: turns the fetched Overpass JSON into SQL seed files that
 * can be pasted straight into the Supabase SQL editor (no Node / service key
 * needed on the operator's machine).
 *
 * Inputs (already fetched into /tmp):
 *   boundaries.json  — city (admin_level 8) + 23 districts (admin_level 9), out geom
 *   streets.json     — every named highway in Budapest, out geom
 *
 * Outputs (supabase/seed/):
 *   00_areas.sql           — city + districts (MultiPolygon boundaries)
 *   01..NN_streets.sql     — street rows in browser-friendly chunks
 *   99_postprocess.sql     — lengths, district assignment, cached aggregates
 */

const fs = require("fs");
const path = require("path");

const OUT_DIR = process.argv[2];
const CITY_REL = 1244004;
const COORD_DP = 6;                 // ~0.1 m precision, plenty for walking
const CHUNK = 4000;                 // streets per SQL file

const WALKABLE = new Set([
  "residential", "primary", "secondary", "tertiary", "unclassified",
  "living_street", "pedestrian", "footway", "path", "track", "service",
  "primary_link", "secondary_link", "tertiary_link",
]);

const r = (n) => Number(n).toFixed(COORD_DP);
const sqlStr = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// --- polygon assembly ------------------------------------------------------
function ringClosed(ring) {
  if (ring.length < 4) return false;
  const [hx, hy] = ring[0];
  const [tx, ty] = ring[ring.length - 1];
  return hx === tx && hy === ty;
}

function relationToMultiPolygonWKT(rel) {
  const outers = (rel.members || []).filter(
    (m) => m.type === "way" && m.role === "outer" && m.geometry && m.geometry.length,
  );
  if (!outers.length) return null;

  const remaining = outers.map((m) => m.geometry.map((p) => [p.lon, p.lat]));
  const rings = [];

  while (remaining.length) {
    let ring = remaining.shift();
    let changed = true;
    while (changed && !ringClosed(ring)) {
      changed = false;
      for (let i = 0; i < remaining.length; i++) {
        const w = remaining[i];
        const [hx, hy] = ring[0];
        const [tx, ty] = ring[ring.length - 1];
        const [wx0, wy0] = w[0];
        const [wxn, wyn] = w[w.length - 1];
        if (tx === wx0 && ty === wy0) { ring = ring.concat(w.slice(1)); remaining.splice(i, 1); changed = true; break; }
        if (tx === wxn && ty === wyn) { ring = ring.concat([...w].reverse().slice(1)); remaining.splice(i, 1); changed = true; break; }
        if (hx === wxn && hy === wyn) { ring = w.concat(ring.slice(1)); remaining.splice(i, 1); changed = true; break; }
        if (hx === wx0 && hy === wy0) { ring = [...w].reverse().concat(ring.slice(1)); remaining.splice(i, 1); changed = true; break; }
      }
    }
    if (ringClosed(ring) && ring.length >= 4) rings.push(ring);
  }
  if (!rings.length) return null;
  const polys = rings.map(
    (ring) => `((${ring.map(([x, y]) => `${r(x)} ${r(y)}`).join(",")}))`,
  );
  return `MULTIPOLYGON(${polys.join(",")})`;
}

// --- areas -----------------------------------------------------------------
const boundaries = require("/tmp/boundaries.json").elements.filter((e) => e.type === "relation");
const city = boundaries.find((e) => e.id === CITY_REL);
const districts = boundaries.filter((e) => e.tags.admin_level === "9");

let areasSql = `-- Areas: Budapest city + 23 districts.
-- Boundaries assembled from OSM relation outer ways, validated with
-- ST_MakeValid in case any ring self-touches.
begin;

insert into areas (kind, name, osm_id, geom) values
  ('city', ${sqlStr(city.tags.name)}, ${city.id},
   ST_Multi(ST_MakeValid(ST_GeomFromText('${relationToMultiPolygonWKT(city)}', 4326))))
on conflict (osm_id) do update set geom = excluded.geom;
`;

for (const d of districts) {
  const wkt = relationToMultiPolygonWKT(d);
  if (!wkt) { console.warn("skip district (no polygon):", d.tags.name); continue; }
  areasSql += `
insert into areas (kind, parent_id, name, osm_id, geom)
select 'district', (select id from areas where osm_id = ${city.id}),
       ${sqlStr(d.tags.name)}, ${d.id},
       ST_Multi(ST_MakeValid(ST_GeomFromText('${wkt}', 4326)))
on conflict (osm_id) do update set geom = excluded.geom;
`;
}
areasSql += "\ncommit;\n";
fs.writeFileSync(path.join(OUT_DIR, "00_areas.sql"), areasSql);
console.log("wrote 00_areas.sql");

// --- streets ---------------------------------------------------------------
const ways = require("/tmp/streets.json").elements.filter(
  (e) => e.type === "way" && e.tags && WALKABLE.has(e.tags.highway)
    && e.tags.name && e.geometry && e.geometry.length >= 2,
);

let fileIdx = 1;
for (let i = 0; i < ways.length; i += CHUNK) {
  const slice = ways.slice(i, i + CHUNK);
  // area_id is set to the city now and refined per-district in postprocess.
  let sql = `-- Streets chunk ${fileIdx} (${slice.length} rows). area_id is the
-- city id for now; 99_postprocess.sql reassigns each street to its district.
insert into streets (osm_way_id, area_id, name, highway_type, geom, length_m)
select v.osm_way_id, (select id from areas where osm_id = ${city.id}),
       v.name, v.highway_type, ST_GeomFromText(v.wkt, 4326), 0
from (values
`;
  const rows = slice.map((w) => {
    const wkt = "LINESTRING(" + w.geometry.map((p) => `${r(p.lon)} ${r(p.lat)}`).join(",") + ")";
    return `  (${w.id}::bigint, ${sqlStr(w.tags.name)}, ${sqlStr(w.tags.highway)}, ${sqlStr(wkt)})`;
  });
  sql += rows.join(",\n");
  sql += `
) as v(osm_way_id, name, highway_type, wkt)
on conflict (osm_way_id) do nothing;
`;
  const fname = String(fileIdx).padStart(2, "0") + "_streets.sql";
  fs.writeFileSync(path.join(OUT_DIR, fname), sql);
  console.log("wrote", fname, "(", slice.length, "rows )");
  fileIdx++;
}

// --- postprocess -----------------------------------------------------------
const postSql = `-- Post-processing: run AFTER 00_areas.sql and all NN_streets.sql.
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
`;
fs.writeFileSync(path.join(OUT_DIR, "99_postprocess.sql"), postSql);
console.log("wrote 99_postprocess.sql");
console.log("total streets:", ways.length, "in", fileIdx - 1, "chunks");
