# Architektúra

## Adatfolyam

```
   ┌───────────────┐
   │  Mobil app    │       (1) GPS pontok (5m / 4s)
   │  Expo +       │ ────────────────────────┐
   │  TaskManager  │                         │
   └───────────────┘                         ▼
                                  ┌────────────────────┐
                                  │ Lokális buffer     │
                                  │ (AsyncStorage)     │
                                  └─────────┬──────────┘
                                            │ flush: 60 pont
                                            │ vagy 30 mp
                                            ▼
                                  ┌────────────────────┐
                                  │ Supabase RPC       │
                                  │  ingest_walk()     │
                                  └─────────┬──────────┘
                                            │
                ┌───────────────────────────┴───────────────────────────┐
                ▼                                                       ▼
       ┌───────────────────┐                                ┌────────────────────┐
       │ walk_sessions     │                                │ user_street_       │
       │ (raw path archív) │                                │   progress         │
       └───────────────────┘                                │  walked_geom union │
                                                           │  + coverage ratio   │
                                                           └─────────┬──────────┘
                                                                      │
                                                                      ▼
                                                           ┌────────────────────┐
                                                           │ user_area_progress │
                                                           │     (view)         │
                                                           └────────────────────┘
```

## Map matching (PostGIS)

A `ingest_walk` RPC algoritmusa pontról-pontra:

1. **Snap**: `ST_DWithin` 25 m-en belül megkeressük a legközelebbi utcát,
   és `ST_LineLocatePoint`-tal megkapjuk a 0..1 frakciót, ahol a pont az
   utca mentén van.
2. **Run grouping**: Egymást követő, ugyanarra az utcára eső pontok egy
   "futamot" alkotnak. A futam `[min(frac), max(frac)]` intervalluma
   alkotja a frissen bejárt szakaszt (`ST_LineSubstring`).
3. **Union**: A frissen bejárt szakaszt egyesítjük a `walked_geom`-mal,
   `ST_LineMerge(ST_Union(...))` segítségével — így a futamok között
   átfedés is helyes lesz.
4. **Coverage**: `ST_Length(walked_geom::geography) / streets.length_m`.
   Ha eléri a 75%-ot, `completed = true`.

## Miért 25 m?

A városi GPS pontosság jellemzően 5-15 m. 25 m elég ahhoz, hogy a
buszsávban vagy a járdán haladva is a megfelelő utcára illesszen, de még
nem olyan nagy, hogy a párhuzamos utcára átugorjon. Sűrű belvárosban
(Erzsébetváros) ez néha mégis téved — későbbi iterációban érdemes:

- HMM-alapú map matchingre váltani (lásd Newson & Krumm 2009)
- vagy a felhasználói irányt is bevenni a snap-be (`heading` Expo Location-ből)

## Performance vázlat

| művelet                    | felső becslés        |
|----------------------------|----------------------|
| Egy 30 perces séta         | ~450 GPS pont        |
| Egy `ingest_walk` hívás    | ≤ 60 pont, < 200 ms  |
| Térkép bbox lekérdezés     | < 5000 utca, < 150 ms|
| Kerületi haladás (view)    | < 50 ms              |

A `streets_geom_idx` (GIST) és a coverage_ratio stored generated column
miatt a "hot path" lekérdezések indexen mennek.

## Mit nem csinálunk (még)

- Offline térkép tile-ok. A Google Maps SDK cache-eli a legutóbbi nézetet,
  ez MVP-re elég.
- Több város / ország. A séma kész rá, de az importer csak Budapesthez van
  hangolva.
- Foto / story per utca. Későbbi achievement-réteg.
- Social. Csak per-user nézet.
