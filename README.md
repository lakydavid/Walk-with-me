# Walk With Me

Mobil app, ami minden bejárt utcát achievementként követ. Cél: végigsétálni egy
adott terület (pl. budapesti kerület, város) **minden** utcáján, és így 100%-ra
teljesíteni.

## Áttekintés

- **Frontend**: React Native + Expo (iOS + Android)
- **Térkép- és utcaadatok**: OpenStreetMap (Overpass API)
- **Backend**: Supabase (PostgreSQL + PostGIS, Auth, Realtime)
- **Tracking**: Expo Location háttér-tracking + szerver-oldali map matching
- **MVP scope**: Budapest, 23 kerület
- **Bejárás-küszöb**: az utca hosszának 75%-án végig kellett menni

## Repository struktúra

```
walk-with-me/
├── app/                 # Expo React Native mobilapp
├── supabase/            # Adatbázis migrációk, RPC függvények, edge functions
├── scripts/             # OSM import és egyéb data-pipeline scriptek
└── docs/
    ├── SETUP.md         # Telepítés
    ├── ARCHITECTURE.md  # Adatfolyam, map matching
    ├── EDGE_CASES.md    # Edge case-ek + döntések
    ├── PLAY_STORE.md    # Play Store submission checklist
    └── privacy/         # Privacy Policy (HU + EN)
```

## Adatmodell (vázlat)

- `areas` — közigazgatási egységek (ország / megye / város / kerület), hierarchikus
- `streets` — utcaszegmensek (LINESTRING geometriával, hossz, kerület-FK)
- `user_street_progress` — per-user, per-street bejárt hossz és státusz
- `user_area_progress` — összegzett kerületi/városi haladás (materialized view)

## Fejlesztési fázisok

### Fázis 1 — Foundation (jelenlegi)
- [x] Repo struktúra
- [x] Supabase séma + PostGIS
- [x] Budapest OSM import script (kerületek + utcák)
- [x] Expo app skeleton

### Fázis 2 — Core MVP
- [x] Supabase auth (email + magic link)
- [x] Térképnézet: utcák színezve státusz szerint (szürke / sárga / zöld)
- [x] Háttér GPS tracking (Expo Location)
- [x] Map matching RPC: GPS-pontok → utcaszegmensek, hossz-frissítés, 75% küszöb
- [x] Kerület-progress nézet

### Fázis 3 — Play Store readiness (jelen branch)
- [x] Privacy consent screen (prominent disclosure)
- [x] In-app account deletion (kötelező Play Store policy)
- [x] Anti-cheat: mock GPS reject + 12 km/h sebesség-cap
- [x] Idempotens batch ingest + per-user rate limit
- [x] Input validáció + size cap a `ingest_walk` RPC-ben
- [x] RLS auditálva: user_street_progress csak SECURITY DEFINER-en át írható
- [x] Anon kulcs + GMaps kulcs `EXPO_PUBLIC_*` env-be, gitignore-olva
- [x] 90 napos retention a nyers walk_sessions-re
- [x] Magyar + angol privacy policy sablon

### Fázis 4 — Polish
- [ ] Achievement értesítések (kerület 100%-ra teljesítve)
- [ ] Statisztikák: összes lépett km, teljesített kerületek
- [ ] Streak-ek / napi célok
- [ ] In-app data export ("Letöltöm az adataim" GDPR-ready)
- [ ] Social: barátok progressje

## Setup

Lásd `docs/SETUP.md`.
