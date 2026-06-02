# Session handoff — 2026-06-02

> Az előző session-ben a privacy policy hostolásánál akadtunk el: a
> Walk-with-me repo **privát**, ezért a GitHub Pages tab "Upgrade" gombot
> kért. Az új session itt folytatja.

## Repo state — ahol abbahagytuk

- **Branch**: `claude/mobile-map-achievements-2VFIl`
- **Utolsó commit**: `8d71e61` "Zero stale cached counts on drained areas after orphan reassignment"
- **Working tree**: tiszta, minden korábbi munka pusholva van
- **GitHub repo**: `lakydavid/Walk-with-me` (jelenleg **privát**)

## Mit csináltunk eddig

1. **Initial scaffold** (2af4796): Expo app, Supabase schema, Budapest OSM importer
2. **Play Store hardening** (9c3d3df): anti-cheat (mock GPS detect, 12 km/h cap), idempotency, account deletion RPC, magyar+angol privacy policy
3. **Privacy URL fix** (ccdaab8): `docs/privacy.md` → `https://lakydavid.github.io/Walk-with-me/privacy` (a `.md` extension nélkül, Jekyll permalink-eken keresztül)
4. **DB import bugfix sorozat** (d1a4c11 → 8d71e61): pg_trgm extension sorrendje, browser-pasteable SQL seed Budapestre, border-orphan utcák kerülethez rendelése, korrelált subselect a nearest-district lookuphoz, drained district cache zero-zása

A `docs/` mappa GitHub Pages-ready:
- `_config.yml`, `index.md`, `privacy.md` (HU), `privacy-en.md` (EN)
- Permalinkok beállítva: `/privacy`, `/privacy-en`

---

## NEXT SESSION — TODO sorrend

### A) Repo publikussá tétele + Pages bekapcsolása

**Miért publikus?** A GitHub Pages free tier privát repó-ra nem működik
(Pro-t kérne). A repo-ban semmi titok nincs: a kód publikus lehet, a
`.env`-ben lévő kulcsok gitignore-olva vannak, a Supabase service kulcs
sose került commitba.

**Lépések a user által:**
1. https://github.com/lakydavid/Walk-with-me/settings → görgess az aljára
2. **Danger Zone** → **Change repository visibility** → **Change to public**
3. Megerősítés: gépeld be `lakydavid/Walk-with-me`
4. Utána: **Settings → Pages**
5. Source: `Deploy from a branch`
6. Branch: `claude/mobile-map-achievements-2VFIl`, Folder: `/docs`
7. Save → várj ~1-2 percet

**Verify URL-ek:**
- https://lakydavid.github.io/Walk-with-me/
- https://lakydavid.github.io/Walk-with-me/privacy
- https://lakydavid.github.io/Walk-with-me/privacy-en

**Megjegyzés Claude-nak:** ha a user azt mondja "kész", **WebFetch**-csel
ellenőrizd mindhárom URL-t, mielőtt továbblépsz.

---

### B) Google Maps API kulcs beszerzése + restrikció

**Cél:** az Android build-hez kell egy Maps SDK for Android kulcs, package
name + SHA-1 restrikcióval.

**Lépések:**
1. https://console.cloud.google.com → új projekt (név: `walk-with-me`)
2. **APIs & Services → Library** → engedélyezd:
   - **Maps SDK for Android**
   - (iOS-re majd: Maps SDK for iOS — most kihagyható)
3. **APIs & Services → Credentials** → **Create credentials → API key**
4. Az új kulcsra kattints, **Edit API key**:
   - **Application restrictions**: `Android apps`
   - **Add an item**:
     - Package name: `com.lakydavid.walkwithme`
     - SHA-1: **két SHA-1 kell** (debug + release)
       - **Debug SHA-1**: a user laptop-ján `~/.android/debug.keystore`-ból:
         ```
         keytool -list -v -keystore ~/.android/debug.keystore \
           -alias androiddebugkey -storepass android -keypass android \
           | grep SHA1
         ```
       - **Release SHA-1**: ha Play App Signing-ot használunk (ajánlott),
         a Play Console **Setup → App signing → App signing key
         certificate** alól a SHA-1
   - **API restrictions**: válaszd ki `Maps SDK for Android`-ot
5. **Save**

**Hova kerül a kulcs:**
- `app/.env`-be: `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...`
- EAS Build használata esetén: `eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value AIza...`
- **Nem kerül commitba** (`.env` gitignore-olva van)

**Probléma esetén:** ha a user nem fér hozzá a release SHA-1-hez a Play
Console-on (mert még nem hoztuk létre az app listing-et), akkor csak a
debug SHA-1-gyel kezdjünk; a release SHA-1-et később adjuk hozzá amikor
megvan az AAB és felmegy a Play Console-ra.

---

### C) EAS Build setup + első release-build

**Cél:** Production-ready Android AAB amit feltölthetünk a Play Console
belső tesztelési csatornájára.

**Lépések:**
1. `cd app && npm install -g eas-cli && eas login`
2. `eas build:configure` (válaszd ki: Android, profile: `production`)
3. Ellenőrizd a `eas.json`-t:
   - `production` profile: `buildType: app-bundle` (AAB-t generál)
4. **Secrets**:
   ```
   eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value https://xxx.supabase.co
   eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJ...
   eas secret:create --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value AIza...
   eas secret:create --name EXPO_PUBLIC_PRIVACY_POLICY_URL --value https://lakydavid.github.io/Walk-with-me/privacy
   ```
5. `eas build --platform android --profile production`
6. Várj 10-15 percet — letöltési link jön emailben

**Megjegyzés:** az első build lassú (Expo prebuild + Gradle + R8 minify).
A user géppel a `expo run:android` lokálisan is működhet ha van Android
Studio + JDK 17.

---

### D) Play Console — első listing setup

**Megnyitás:** https://play.google.com/console (25 USD egyszeri reg fee
ha még nem fizetett a user)

**Lépések (sorrendben):**
1. **Create app**
   - Name: "Walk with me"
   - Default language: Hungarian
   - App or game: App
   - Free or paid: Free
   - Declarations: Both unchecked OK
2. **Set up your app** wizard, fő pontok:
   - **App access**: All functionality available (no login wall? — magic
     link kell. Részleges access: "Walk tracking requires email sign-in").
     Adj demo email-t a reviewer-nek.
   - **Ads**: No
   - **Content rating**: IARC questionnaire, 3+ várható
   - **Target audience**: 13+ (lokáció + email miatt 13 alatt nem ajánlott)
   - **News app**: No
   - **COVID-19 contact tracing**: No
   - **Data safety form**: lásd `docs/PLAY_STORE.md` "Data safety form" szekció
   - **Government app**: No
   - **Financial features**: No
3. **App content → Privacy policy**:
   - URL: `https://lakydavid.github.io/Walk-with-me/privacy`
4. **Store listing**:
   - Short description (max 80): "Sétálj végig Budapest minden utcáján és gyűjtsd be a kerületeket."
   - Full description (max 4000): kell írni, magyar + english
   - **Screenshots**: legalább 2 phone screenshot (max 8). A térkép +
     achievement screen
   - **Feature graphic**: 1024×500 PNG/JPG (kötelező)
   - **App icon**: 512×512 (a `app/assets/icon.png`-ből)
5. **Permissions declaration** (ACCESS_BACKGROUND_LOCATION):
   - Core functionality + screencast video + screenshot a consent screen-ről
6. **App release → Internal testing → Create new release**
   - Upload AAB
   - Add 5+ tester email
   - Submit for review (Internal testing 1-2 órán belül elfogadva)

**Megjegyzés:** a screenshot + feature graphic generálását CSAK akkor
kezdjük, ha a user kifejezetten kéri — ez tervezési munka, nem
prioritás az MVP-hez.

---

### E) Belső teszt → Closed testing → Production (14 napos szabály)

**FONTOS:** A Play Console 2023-as policy szerint új fejlesztőknek
**20 tester + 14 napos closed test** kell mielőtt production-ra mehetnek.

1. **Internal testing**: instant — 5+ tester, kvázi azonnal elérhető
2. **Closed testing track**: 20+ tester, **14 napon át aktívan használja
   az appot** (Console-ban látni fogod a "DAU" számot)
3. Csak ezután engedélyezi a Console a **Production release**-t

A user-nek szólni kell, hogy gyűjtsön össze 20 tester emailcímet, mert
ez 2 hét csúszás.

---

## Tanulságok / hozott döntések

- **GitHub Pages a privacy policy host** (nem külön domain). Olcsó,
  verziókövetett, a markdown is verziókövetett. **Kompromisszum**: a repó
  publikussá vált.
- **Két nyelv a privacy policy**: HU (magyar UI) + EN (Play Console
  reviewer-eknek + nemzetközi terjeszkedéshez). A Play Console mező
  csak ONE URL-t enged → a magyart adjuk meg, EN-re link a HU oldalon.
- **Anti-cheat: mock GPS detect + 12 km/h cap**: nem kompromisszum nélküli
  (kerékpár nem fogad el sétaként), de a Play Store számára a "no obvious
  cheat" elég. Későbbi iterációban HMM matcher + activity recognition
  (gyaloglás vs futás vs bicikli) ráadás.
- **OSM `name` duplikáció**: minden "Petőfi utca" külön achievement
  marad. NE próbáld összevonni — a user-eknek félrevezető lenne, hogy egy
  másik kerületbeli utca már "részben" kész.
- **Budapest border streets**: a `a3d2324` commit megoldja az olyan
  utcákat, amik egyik kerületbe sem esnek 100%-ban (folyópart, hidak).
  Nearest district lookup correlated subselectben fut (`1f298d5`).
- **Drained district cache zeroing** (`8d71e61`): amikor egy border-orphan
  utcát új kerülethez rendelünk, a régi kerület cached count-ja nem
  frissül automatikusan → explicit `UPDATE … SET completed=0 WHERE
  reassigned`. Ez subtle race-condition source ha future-ben async
  reassignment lesz, **NE refactor-old el** trigger-be ütemezett job
  nélkül.

## Ami HIÁNYZIK / kockázat

- **Nincs CI/CD**. A `claude/mobile-map-achievements-2VFIl` branch
  manuálisan lett tesztelve. Játssz biztonsra: minden új session
  először `npm test`-et és `expo doctor`-t fut le.
- **Nincs E2E teszt**. A consent flow + background location regression
  csak manuális teszten derül ki. Detox/Maestro setup későbbi feladat.
- **Supabase projekt MÉG NINCS létrehozva**. A user-nek létre kell hozni
  egyet (EU régió, GDPR miatt) és lefuttatni a migrációkat + seed-eket.
  Ez a Play Console submission előtti BLOCKER.
- **App icon nincs designolva**. A `app/assets/icon.png` placeholder.
- **Screenshots nincsenek**. EAS build után simulator/emulator screenshotok kellenek.

## Hasznos parancsok az új session-höz

```bash
# Repo state check
cd /home/user/Walk-with-me
git log --oneline -5
git status

# Privacy policy URL check (publikussá tétel után)
curl -I https://lakydavid.github.io/Walk-with-me/privacy

# Supabase migráció státusz (ha local CLI van)
supabase db diff

# EAS build state
eas build:list --limit 5
```

## Kontextus a következő Claude-nak

A user **nem fejlesztő**, hanem termékötlet-tulajdonos. A magyarázatok
legyenek lépésről-lépésre, screenshot-elhetők, és kerüld a CLI-only
megoldásokat ha böngésző-only út is létezik (lásd Supabase seed: SQL
Editorban beilleszthető SQL fájlok, nem CLI script).

Ha akadás van: kérj screenshotot a hibáról, ne tippelj.

Nyelvválasztás: magyar az alapértelmezett, de a code/commit message angol.
