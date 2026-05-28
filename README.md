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
└── docs/                # Architektúra dokumentáció
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
- [ ] Supabase auth (email + magic link)
- [ ] Térképnézet: utcák színezve státusz szerint (szürke / sárga / zöld)
- [ ] Háttér GPS tracking (Expo Location)
- [ ] Map matching RPC: GPS-pontok → utcaszegmensek, hossz-frissítés, 75% küszöb
- [ ] Kerület-progress nézet

### Fázis 3 — Polish
- [ ] Achievement értesítések (kerület 100%-ra teljesítve)
- [ ] Statisztikák: összes lépett km, teljesített kerületek
- [ ] Streak-ek / napi célok
- [ ] Social: barátok progressje

## Setup

Lásd `docs/SETUP.md`.
