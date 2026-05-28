/**
 * Budapest OSM import
 *
 *   npx tsx scripts/import-budapest.ts
 *
 * Steps:
 *   1. Fetch the 23 Budapest districts (admin_level=9) and the city boundary
 *      (admin_level=8) from the Overpass API.
 *   2. Fetch all "highway" ways inside the Budapest boundary, filtered to
 *      pedestrian-walkable types.
 *   3. Insert into Supabase:
 *        - one city row (Budapest)
 *        - 23 district rows, parented to the city
 *        - one streets row per OSM way, parented to the district that
 *          contains its midpoint.
 *   4. Recompute cached aggregates (street_count, total_street_length_m).
 *
 * Env vars required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY    (service role, NOT anon)
 */

import { createClient } from "@supabase/supabase-js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Highway types we treat as walkable streets. Excludes motorways, raceways,
// and pure cycleways.
const WALKABLE_HIGHWAYS = new Set([
  "residential",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "living_street",
  "pedestrian",
  "footway",
  "path",
  "track",
  "service",
  "primary_link",
  "secondary_link",
  "tertiary_link",
]);

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  // present on `out geom`
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
  center?: { lat: number; lon: number };
};

async function overpass(query: string): Promise<OverpassElement[]> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) {
    throw new Error(`Overpass ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { elements: OverpassElement[] };
  return json.elements;
}

// Convert an Overpass relation (admin boundary) to a MultiPolygon WKT.
// Overpass returns the relation's outer ways with geometries; we stitch them
// into rings naively. For Budapest's well-formed admin boundaries this works,
// but production code should use a real polygon assembler.
function relationToMultiPolygonWKT(rel: OverpassElement): string | null {
  const outers = (rel.members ?? []).filter(
    (m) => m.type === "way" && m.role === "outer" && m.geometry?.length,
  );
  if (outers.length === 0) return null;

  // Stitch ways into closed rings.
  const rings: [number, number][][] = [];
  const remaining = outers.map((m) => m.geometry!.map((p) => [p.lon, p.lat] as [number, number]));

  while (remaining.length) {
    let ring = remaining.shift()!;
    // Greedily attach matching ways until the ring closes.
    let changed = true;
    while (changed && !ringClosed(ring)) {
      changed = false;
      for (let i = 0; i < remaining.length; i++) {
        const w = remaining[i];
        const [hx, hy] = ring[0];
        const [tx, ty] = ring[ring.length - 1];
        const [wx0, wy0] = w[0];
        const [wxn, wyn] = w[w.length - 1];
        if (tx === wx0 && ty === wy0) { ring = ring.concat(w.slice(1));     remaining.splice(i, 1); changed = true; break; }
        if (tx === wxn && ty === wyn) { ring = ring.concat([...w].reverse().slice(1)); remaining.splice(i, 1); changed = true; break; }
        if (hx === wxn && hy === wyn) { ring = w.concat(ring.slice(1));     remaining.splice(i, 1); changed = true; break; }
        if (hx === wx0 && hy === wy0) { ring = [...w].reverse().concat(ring.slice(1)); remaining.splice(i, 1); changed = true; break; }
      }
    }
    if (ringClosed(ring) && ring.length >= 4) rings.push(ring);
  }

  if (rings.length === 0) return null;
  const polys = rings.map(
    (r) => `((${r.map(([x, y]) => `${x} ${y}`).join(",")}))`,
  );
  return `SRID=4326;MULTIPOLYGON(${polys.join(",")})`;
}

function ringClosed(r: [number, number][]): boolean {
  if (r.length < 4) return false;
  const [hx, hy] = r[0];
  const [tx, ty] = r[r.length - 1];
  return hx === tx && hy === ty;
}

function wayToLineStringWKT(way: OverpassElement): string | null {
  if (!way.geometry || way.geometry.length < 2) return null;
  return (
    "SRID=4326;LINESTRING(" +
    way.geometry.map((p) => `${p.lon} ${p.lat}`).join(",") +
    ")"
  );
}

async function importBudapest() {
  // ---------------------------------------------------------------------- 1
  console.log("Fetching Budapest city + district boundaries…");
  const boundariesQuery = `
    [out:json][timeout:120];
    relation["name"="Budapest"]["admin_level"="8"]->.city;
    .city out tags;
    (
      relation["admin_level"="9"](area.cityArea);
      relation["admin_level"="9"]["is_in:city"="Budapest"];
    )->.districts;
    rel(r.city);
    out geom;
    rel(r.districts);
    out geom;
  `;
  // The query above is illustrative — in practice Overpass query DSL needs the
  // area to be derived from the relation. The simpler, robust version:
  const boundaries = await overpass(`
    [out:json][timeout:180];
    relation["name"="Budapest"]["admin_level"="8"];
    out geom;
    relation["admin_level"="9"](area:3600037410);
    out geom;
  `);
  // 3600037410 = OSM area id of Budapest (relation 37410 + 3600000000 offset).

  const city = boundaries.find(
    (e) => e.type === "relation" && e.tags?.admin_level === "8",
  );
  const districts = boundaries.filter(
    (e) => e.type === "relation" && e.tags?.admin_level === "9",
  );
  if (!city) throw new Error("Budapest city relation not found");
  console.log(`  Found city + ${districts.length} districts`);

  // ---------------------------------------------------------------------- 2
  console.log("Fetching walkable highways inside Budapest…");
  const ways = await overpass(`
    [out:json][timeout:300];
    area(3600037410)->.bp;
    way["highway"]["name"](area.bp);
    out geom;
  `);
  const walkable = ways.filter(
    (w) =>
      w.type === "way" &&
      w.tags?.highway &&
      WALKABLE_HIGHWAYS.has(w.tags.highway) &&
      w.tags.name,
  );
  console.log(`  Found ${walkable.length} named walkable ways`);

  // ---------------------------------------------------------------------- 3
  console.log("Upserting city…");
  const cityWKT = relationToMultiPolygonWKT(city);
  if (!cityWKT) throw new Error("Failed to assemble city polygon");

  const { data: cityRow, error: cityErr } = await supabase
    .from("areas")
    .upsert(
      {
        kind: "city",
        name: city.tags?.name ?? "Budapest",
        osm_id: city.id,
        geom: cityWKT,
      },
      { onConflict: "osm_id" },
    )
    .select("id")
    .single();
  if (cityErr) throw cityErr;
  const cityId = cityRow.id;

  console.log(`Upserting ${districts.length} districts…`);
  const districtIdByOsm = new Map<number, number>();
  for (const d of districts) {
    const wkt = relationToMultiPolygonWKT(d);
    if (!wkt) {
      console.warn(`  Skip district ${d.tags?.name} (no polygon)`);
      continue;
    }
    const { data, error } = await supabase
      .from("areas")
      .upsert(
        {
          kind: "district",
          parent_id: cityId,
          name: d.tags?.name ?? `district-${d.id}`,
          osm_id: d.id,
          geom: wkt,
        },
        { onConflict: "osm_id" },
      )
      .select("id")
      .single();
    if (error) throw error;
    districtIdByOsm.set(d.id, data.id);
  }

  // ---------------------------------------------------------------------- 4
  console.log("Inserting streets in batches…");
  const BATCH = 500;
  for (let i = 0; i < walkable.length; i += BATCH) {
    const slice = walkable.slice(i, i + BATCH);
    const rows = slice
      .map((w) => {
        const wkt = wayToLineStringWKT(w);
        if (!wkt) return null;
        return {
          osm_way_id: w.id,
          area_id: cityId, // refined below via SQL trigger / update step
          name: w.tags!.name!,
          highway_type: w.tags!.highway!,
          geom: wkt,
          length_m: 0, // recomputed in SQL below
        };
      })
      .filter(Boolean);
    const { error } = await supabase
      .from("streets")
      .upsert(rows as object[], { onConflict: "osm_way_id" });
    if (error) throw error;
    console.log(`  ${Math.min(i + BATCH, walkable.length)} / ${walkable.length}`);
  }

  // After bulk insert we run a single SQL pass to (a) recompute geographic
  // length, and (b) re-assign each street to the district that contains its
  // midpoint. Doing it in SQL is dramatically faster than per-row HTTP calls.
  console.log("Recomputing lengths and district assignment…");
  const { error: postErr } = await supabase.rpc("sql_exec", {
    sql: `
      update streets
      set length_m = ST_Length(geom::geography)
      where length_m = 0;

      update streets s
      set area_id = a.id
      from areas a
      where a.kind = 'district'
        and ST_Contains(a.geom, ST_LineInterpolatePoint(s.geom, 0.5));

      update areas a
      set
        street_count = sub.cnt,
        total_street_length_m = sub.tot
      from (
        select area_id, count(*) as cnt, sum(length_m) as tot
        from streets group by area_id
      ) sub
      where sub.area_id = a.id;
    `,
  });
  if (postErr) {
    console.warn(
      "sql_exec RPC not available — run the post-processing SQL manually:",
      postErr.message,
    );
  }

  console.log("Done.");
}

importBudapest().catch((e) => {
  console.error(e);
  process.exit(1);
});
