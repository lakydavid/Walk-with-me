# Setup

## 1. Supabase projekt

1. Hozz létre egy új projektet a [supabase.com](https://supabase.com)-on.
2. SQL editorben futtasd le sorban a `supabase/migrations/` mappa fájljait:
   - `20260528000001_init_schema.sql`
   - `20260528000002_map_matching.sql`
   - `20260528000003_streets_in_bbox.sql`
3. Settings → API alól másold ki:
   - `Project URL` → ez lesz a `SUPABASE_URL`
   - `anon public` kulcs → ez kell a mobil appnak
   - `service_role` kulcs → ez kell az import scriptnek (titok, ne commitold)

## 2. Budapest adatainak importálása

```bash
cd scripts
npm install
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  npm run import:budapest
```

Az import ~5-10 percig tart. Eredmény:
- 1 város (Budapest)
- 23 kerület
- ~30-50 ezer nevesített utcaszegmens

> **Megjegyzés:** Az `import-budapest.ts` egy `sql_exec` RPC-re hivatkozik a
> hossz- és kerület-újraszámoláshoz. Ezt biztonsági okokból nem hoztuk létre
> alapból; futtasd a script végén megjelenő SQL-t a Supabase SQL editorban.

## 3. Mobil app

```bash
cd app
npm install
```

Töltsd ki az `app.json` `extra` mezőit a Supabase URL és anon kulccsal,
valamint az Android Google Maps API kulccsal.

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
