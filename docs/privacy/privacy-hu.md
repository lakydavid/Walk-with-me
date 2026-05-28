# Adatkezelési tájékoztató

**Hatályos: 2026. május 28.** &nbsp;·&nbsp; **Adatkezelő:** Laky Dávid (`lktsdvd@gmail.com`)

A Walk With Me mobilapplikáció ("Szolgáltatás") által gyűjtött személyes
adatokat az alábbiak szerint kezeljük.

## 1. Milyen adatokat gyűjtünk

| Adat | Cél | Jogalap |
| --- | --- | --- |
| Email cím | Bejelentkezés, fiókazonosítás | Szerződés teljesítése |
| GPS koordináták és időbélyeg (kb. 4 mp-enként, csak aktív tracking alatt) | Bejárt utcák kiszámolása, achievementek nyilvántartása | Szerződés teljesítése + kifejezett hozzájárulás (háttér-tracking) |
| Készülék által jelentett pontossági érték, "mocked GPS" jelzés | Visszaélések szűrése (mock GPS, járművel csalás) | Jogos érdek |
| Hibanaplók, anonim crash report | Stabilitás javítása | Jogos érdek |

A Szolgáltatás **nem gyűjt** reklámazonosítót, böngészési előzményt,
névjegyzéket, kép- vagy hangadatokat, biometrikus adatot.

## 2. Háttér-helymeghatározás

A Szolgáltatás akkor, és csak akkor használ háttér-helymeghatározást, ha
a felhasználó az appban explicit elindította a séta-trackinget. A követés
azonnal megáll, ha:
- a felhasználó megnyomja a "Séta vége" gombot,
- a felhasználó kijelentkezik vagy törli a fiókját,
- a felhasználó visszavonja a háttér-helymeghatározás OS-szintű
  engedélyét.

## 3. Adattárolás és továbbítás

- Az adatok az Európai Unión belüli Supabase szervereken tárolódnak, TLS
  1.3-mal titkosított csatornán keresztül érkeznek.
- Az adatok **nincsenek megosztva** harmadik féllel marketing célból.
- Sem közvetlen, sem közvetett értékesítés nem történik.
- Aggregált, nem azonosítható statisztikákat (pl. összes bejárt km
  Budapesten) közzétehetünk.

## 4. Megőrzés

| Adatkör | Megőrzési idő |
| --- | --- |
| Email + fiókadat | Amíg a fiók aktív |
| Nyers GPS sétaelőzmény | 90 nap, utána aggregálva törlődik |
| Utcánkénti haladás | Fiók törléséig |
| Hibanapló | 30 nap |

## 5. A felhasználó jogai (GDPR)

- **Hozzáférés**: a Profil oldalon az összes utcánkénti haladás
  látható; emailes kérésre teljes adatexportot küldünk 30 napon belül.
- **Helyesbítés**: emailben kérhető.
- **Törlés**: a Profil → *Fiók törlése* gombbal azonnali, visszafordíthatatlan
  törlés indítható. A művelet az összes adatot (email, sétaelőzmények,
  achievementek) eltávolítja 24 órán belül.
- **Adathordozhatóság**: emailes kérésre JSON exportot küldünk.
- **Tiltakozás**: bármikor.
- **Hatósági panasz**: NAIH ([naih.hu](https://naih.hu)).

A jogok gyakorlásához írj az `lktsdvd@gmail.com` címre. 30 napon belül
válaszolunk.

## 6. Sütik

A Szolgáltatás nem használ sütiket. A mobil appban kizárólag a
helyi titkosított tárba (AsyncStorage) mentünk be belépési token-t,
sétaelőzmény-puffert, és a tracking-hez adott hozzájárulás flagjét.

## 7. Gyermekek

A Szolgáltatás 13 éven aluli felhasználók számára nem ajánlott.
Tudatosan nem gyűjtünk adatot 13 éven aluliaktól.

## 8. Változások

A jelen tájékoztató bármely lényeges változásáról az appban
értesítjük a felhasználókat, és új hozzájárulást kérünk a tracking
folytatásához.

## 9. Kapcsolat

Laky Dávid &nbsp;·&nbsp; `lktsdvd@gmail.com`
