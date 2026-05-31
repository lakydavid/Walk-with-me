# Setup

## 1. Supabase projekt

1. Hozz létre egy új projektet a [supabase.com](https://supabase.com)-on
   (válaszd az EU régiót GDPR miatt).
2. SQL editorben futtasd le sorban a `supabase/migrations/` mappa fájljait:
   - `20260528000001_init_schema.sql`
   - `20260528000002_map_matching.sql`
   - `20260528000003_streets_in_bbox.sql`
   - `20260528000004_account_deletion.sql`
   - `20260528000005_retention.sql`
3. Settings → API alól másold ki:
   - `Project URL` → ez lesz a `SUPABASE_URL`
   - `anon public` kulcs → ez kell a mobil appnak
   - `service_role` kulcs → ez kell az import scriptnek (titok, ne commitold)
4. Authentication → Email Templates: állítsd át a magic link sablont
   magyar nyelvre, és állítsd be a `Site URL`-t a deep link sémára
   (`walkwithme://auth`).
5. Authentication → Rate Limits: max 4 magic link / óra / IP (alapból már
   szigorú, de érdemes ellenőrizni).

## 2. Budapest adatainak importálása

Két út van. Az **A** opció böngésző-only (semmi helyi telepítés) — ezt
ajánljuk. A **B** opció a Node importer, ha frissíteni akarod az OSM
adatokat.

### A) Előgenerált SQL seed (ajánlott)

A `supabase/seed/` mappa kész SQL fájlokat tartalmaz a 2026-05-31-i OSM
adatokból (Budapest + 23 kerület + 32 821 nevesített járható utca). Futtasd
őket az SQL Editorban **sorrendben**, mint a migrációkat:

1. `00_areas.sql` — város + 23 kerület határai
2. `01_streets.sql` … `09_streets.sql` — utcaszegmensek (~4000/fájl)
3. `99_postprocess.sql` — hossz-számítás, kerület-hozzárendelés, aggregátumok

A `99_postprocess.sql` a végén kiír egy ellenőrző táblát: kerületenként az
utcák száma és összhossza km-ben. Ha ezt látod, az import kész.

> A street fájlok ~700 KB-osak; a beillesztés után a "Run" pár másodperc.

### B) Node importer (OSM frissítéshez)

```bash
cd scripts
npm install
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  npm run import:budapest
```

A seed fájlok újragenerálásához (friss OSM adatból):

```bash
# 1. Overpass lekérések /tmp-be (lásd scripts/generate-seed.cjs fejlécét)
# 2. node scripts/generate-seed.cjs supabase/seed
```

## 3. Mobil app

```bash
cd app
npm install
cp .env.example .env
# töltsd ki az EXPO_PUBLIC_* változókat a .env-ben
```

Az `app.config.ts` `extra` mezője `EXPO_PUBLIC_*` env változókat olvas;
a `.env` gitignore-olt, így a kulcsok nem kerülnek a repóba.

A Google Maps Android kulcsot mindenképp **restrict-eld** a GCP konzolon:
- Application restrictions: Android apps
- Package name: `com.lakydavid.walkwithme`
- SHA-1: a release-keystore SHA-1 fingerprint-je

Indítás:

```bash
npx expo start
```

iOS-en és Androidon a háttér-lokáció **valódi build**-et igényel
(Expo Go nem támogatja a `expo-task-manager`-rel kombinált background
location frissítéseket). Az első alkalommal:

```bash
npx expo prebuild
npx expo run:ios     # vagy run:android
```

## 4. Mit teszteljünk először

1. Bejelentkezés magic link emaillel.
2. A térkép kerületi szinten szürke vonalakkal jelenik meg (még semmi sincs
   bejárva).
3. "Indítsd a sétát" → engedélyezd a háttér-lokációt.
4. Sétálj végig egy rövid utcán. ~30 másodperc múlva a vonal sárgára vált
   (részleges), és ha 75%-ot átléptél, zöldre.
5. A Haladás fülön nézd meg a kerületi százalékot.

## Ismert korlátok

- A nyers GPS pontosság miatt a "nearest segment" matcher néha rossz
  párhuzamos utcára illeszt. Későbbi iterációban érdemes HMM matcherre
  váltani.
- Az OSM `name` mező duplikációkat tartalmaz (pl. minden kerületben van
  "Petőfi utca"). Jelenleg minden külön szegmens független achievement.
- A `walk_sessions` táblát még nem használjuk újratervezésre — csak archív
  céllal mentjük.
