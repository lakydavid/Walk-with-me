# Google Play Store submission checklist

A háttér-helymeghatározással rendelkező apok submission-je külön audit alá
esik. A lista alapja a 2024-25-ös Play Console policy (Location Permissions
+ Account Deletion).

## Code-side (DONE in this branch)

- [x] Prominent in-app disclosure a rendszer-prompt előtt (`consent.tsx`)
- [x] Foreground service notification a háttér-tracking idejére
      (`tracking.ts` → `foregroundService`)
- [x] In-app account deletion két lépcsős megerősítéssel
      (`profile.tsx` + `delete_my_account` RPC)
- [x] Magyar + angol privacy policy sablon (`docs/privacy/`)
- [x] Mock GPS detekció + 12 km/h sebesség-cap
- [x] Input size limit + per-user rate limit a serveren
- [x] Batch idempotencia a klienses retry-ok ellen
- [x] Szigorú RLS — user-progress íráshoz csak a `SECURITY DEFINER` RPC
- [x] Anon kulcs + GMaps kulcs `EXPO_PUBLIC_*` env-be került, nincs commit
- [x] `ITSAppUsesNonExemptEncryption: false` iOS oldalon

## Pre-submission action items

### Privacy policy
- [ ] A `docs/privacy/privacy-en.md` és `privacy-hu.md` tartalmát publikus
      URL-re hosztolni (pl. GitHub Pages: `lakydavid.github.io/Walk-with-me/privacy`)
- [ ] Az URL bekerül a Play Console "Privacy policy" mezőjébe ÉS a
      `EXPO_PUBLIC_PRIVACY_POLICY_URL` env-be

### Play Console — Data safety form
Be kell jelölni:
- Location → Precise location → **Collected, processed ephemerally
  (raw points) + Collected, stored (per-street progress)**
- Personal info → Email address → **Collected, stored**
- App activity → App interactions → **Collected, stored** (achievementek)
- Encryption in transit: **Yes** (Supabase TLS 1.3)
- Encryption at rest: **Yes** (Supabase / Postgres alapból titkosított disk)
- Adatok megoszthatóságát harmadik féllel: **No**
- User can request data deletion: **Yes**, link a Profile screen-re

### Play Console — Permissions
- `ACCESS_BACKGROUND_LOCATION`-höz töltsd ki a "Permissions declaration"
  form-ot:
  - **Core functionality**: "Tracks which streets the user has walked.
    Background access is required because walks last 20-90 minutes and
    the screen is normally off in a pocket."
  - **Csatolj egy screencast videót** (≤ 30 sec): tap "Indítsd a sétát" →
    consent screen → OS prompt → térkép foreground notification-nel.
  - **Csatolj screenshotot** a consent screen-ről.

### Hashes és kulcs-restrikciók
- [ ] Play App Signing engedélyezett, a Console-on lévő SHA-1
      hozzáadva a Google Maps API kulcs Android restrikciójához
- [ ] A debug SHA-1 is hozzáadva fejlesztéshez
- [ ] A Supabase Auth → URL Configuration alá `walkwithme://auth` és
      a deep link domain hozzáadva

### Tartalom besorolás
- IARC kérdőív: nincs erőszak, szerencsejáték, vásárlás, felhasználói
  tartalom → 3+

### Targeting / SDK
- [ ] Expo SDK 52 → Android targetSdkVersion 35 (Play 2025 elvárás)
- [ ] iOS minimum 13.4 (Expo 52 alap)

### Belső tesztelési csatorna
- [ ] EAS build (release-mode AAB), 5+ teszter, 14 napos teszt mielőtt
      production-ra megy

### Tárgyú audit
A Google külső auditort küldhet a háttér-helymeghatározás
ellenőrzésére. Készülj fel rá, hogy bemutasd:
- a consent flow-t,
- a foreground service notification-t,
- hogy a tracking nem fut, ha a user nem nyomta meg a gombot.

## Apple App Store (later)

Bár jelenleg csak Play-re megyünk, jegyezd meg iOS-re:
- App Tracking Transparency NEM kell, mert nem osztjuk meg az adatot
  cross-app/cross-site reklámcélra.
- A `Privacy Nutrition Label`-t a Privacy Policy-val kell szinkronban
  tartani.
- Background modes: `location` + `fetch`. App Review kifejezetten
  kérdezni fogja, hogy miért — válasz: "User-initiated walk tracking
  that may last hours with the screen off."
