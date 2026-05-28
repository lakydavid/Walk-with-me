-- Walk With Me — initial schema
-- Requires PostGIS for geometry and spatial queries.

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- AREAS
-- ---------------------------------------------------------------------------
-- Hierarchical administrative units: country > county > city > district.
-- For the Budapest MVP we seed:
--   - one country (Magyarország)
--   - one city (Budapest)
--   - 23 districts (I. … XXIII. kerület)
-- The hierarchy is open-ended so we can add more cities later.

create type area_kind as enum ('country', 'county', 'city', 'district');

create table areas (
  id           bigserial primary key,
  parent_id    bigint references areas(id) on delete cascade,
  kind         area_kind not null,
  name         text not null,
  -- OSM relation id, used for idempotent re-imports.
  osm_id       bigint unique,
  -- Boundary polygon. SRID 4326 (WGS84 lat/lng).
  geom         geometry(MultiPolygon, 4326) not null,
  -- Cached aggregate so we don't recompute on every progress query.
  total_street_length_m double precision,
  street_count integer,
  created_at   timestamptz not null default now()
);

create index areas_parent_idx on areas(parent_id);
create index areas_kind_idx on areas(kind);
create index areas_geom_idx on areas using gist(geom);

-- ---------------------------------------------------------------------------
-- STREETS
-- ---------------------------------------------------------------------------
-- One row = one OSM "way" (a continuous segment of a named street).
-- A real-world street like "Andrássy út" may consist of many ways; we treat
-- each way as an independent achievement segment and aggregate by name in UI.

create table streets (
  id            bigserial primary key,
  area_id       bigint not null references areas(id) on delete cascade,
  osm_way_id    bigint unique,
  name          text not null,
  highway_type  text,                              -- residential, primary, …
  geom          geometry(LineString, 4326) not null,
  length_m      double precision not null,         -- ST_Length on geography
  created_at    timestamptz not null default now()
);

create index streets_area_idx on streets(area_id);
create index streets_geom_idx on streets using gist(geom);
create index streets_name_trgm_idx on streets using gin (name gin_trgm_ops);

-- Trigram index needs the extension.
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- USER PROGRESS
-- ---------------------------------------------------------------------------
-- For each (user, street) pair we keep the union of all walked sub-segments
-- as a MultiLineString and the cached covered length. The 75% threshold
-- promotes a street to "completed".

create table user_street_progress (
  user_id           uuid not null references auth.users(id) on delete cascade,
  street_id         bigint not null references streets(id) on delete cascade,
  walked_geom       geometry(MultiLineString, 4326) not null,
  walked_length_m   double precision not null,
  -- Cached and kept in sync by ingest_walk(). PostgreSQL won't allow a
  -- STORED generated column to reference another table, so we update it
  -- inside the RPC.
  coverage_ratio    double precision not null default 0
                    check (coverage_ratio between 0 and 1),
  completed         boolean not null default false,
  first_walked_at   timestamptz not null default now(),
  completed_at      timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (user_id, street_id)
);

create index usp_user_idx on user_street_progress(user_id);
create index usp_completed_idx on user_street_progress(user_id, completed);

-- ---------------------------------------------------------------------------
-- BATCH IDEMPOTENCY
-- ---------------------------------------------------------------------------
-- Each ingest_walk call carries a client-generated batch_id. We record
-- processed batches so retries (after network errors) are no-ops instead of
-- double-counting walked length. Rows are auto-purged after 7 days.

create table ingest_batches (
  batch_id    uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  uuid not null,
  created_at  timestamptz not null default now()
);

create index ingest_batches_user_idx on ingest_batches(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RATE LIMITING
-- ---------------------------------------------------------------------------
-- Lightweight counter used by ingest_walk to throttle abuse. We allow up to
-- 60 calls per user per minute (a normal client flushes every 30s).

create table rpc_calls (
  user_id     uuid not null references auth.users(id) on delete cascade,
  rpc_name    text not null,
  called_at   timestamptz not null default now()
);

create index rpc_calls_user_idx on rpc_calls(user_id, rpc_name, called_at desc);

-- ---------------------------------------------------------------------------
-- RAW GPS TRACKS
-- ---------------------------------------------------------------------------
-- We persist raw walks so we can re-process them if the matching algorithm
-- changes. Points are stored as a single LineString per recorded session.

create table walk_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  path        geometry(LineString, 4326),
  point_count integer not null default 0,
  raw_length_m double precision,
  processed   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index ws_user_idx on walk_sessions(user_id, started_at desc);
create index ws_path_idx on walk_sessions using gist(path);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
-- Reference data (areas, streets) is public-read. User progress is per-user.

alter table areas                enable row level security;
alter table streets              enable row level security;
alter table user_street_progress enable row level security;
alter table walk_sessions        enable row level security;
alter table ingest_batches       enable row level security;
alter table rpc_calls            enable row level security;

create policy areas_read   on areas   for select using (true);
create policy streets_read on streets for select using (true);

create policy usp_owner_select on user_street_progress
  for select using (auth.uid() = user_id);
-- Writes happen only via the ingest_walk RPC (SECURITY DEFINER), so we do
-- NOT grant table-level write access to authenticated users. A direct INSERT
-- from a client would let an attacker mark any street completed.
create policy usp_owner_delete on user_street_progress
  for delete using (auth.uid() = user_id);

create policy ws_owner_select on walk_sessions
  for select using (auth.uid() = user_id);
create policy ws_owner_delete on walk_sessions
  for delete using (auth.uid() = user_id);

-- ingest_batches and rpc_calls are never accessed directly by clients; they
-- are written exclusively by SECURITY DEFINER functions. We leave RLS on
-- with no policies, which denies all client access.
