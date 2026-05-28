# Edge cases & döntéseik

Élő dokumentum: amikor új edge case-szel találkozunk, ide kerül a
megfontolás + a választott út.

## GPS / Tracking

### Csalás
| Vektor | Védelem |
| --- | --- |
| Mock GPS app (Lockito stb.) | Kliens: `LocationObject.mocked === true` → drop. Szerver: nincs mit tenni, de a sebesség-cap ellene játszik. |
| Autó / villamos | Szerver-oldal: ha két pont közti sebesség > 12 km/h, a második pont kiesik. |
| Bicikli | 12 km/h limit a "gyors séta" felső sávja. Bringás 25+ km/h-val nem fér bele — ez tudatos kompromisszum: bringával nem _séta_. |
| Teleportálás (GPS spoof + ugrás) | Sebesség-cap automatikusan ledobja. |
| Batch hamisítás (curl-lel poszt) | Idempotency + rate limit + auth-only ingest. Az anti-cheat azonosítja a sebességet, ezzel a "bárhonnan minden utca" támadás nem megy. |

### Pontatlanság
| Eset | Kezelés |
| --- | --- |
| accuracy > 30 m | Kliens dropolja. |
| Alagút / signal loss | A buffer megmarad; pont nem kerül be amíg vissza nem tér a fix. |
| Felüljáró / híd | Jelenleg: a snap mindkét utcára esélyes. **Elfogadott edge case az MVP-ben** — ritka és nem visszafordíthatatlan. Későbbi javítás: ha az utca highway-szintje (`level` tag) eltér a felhasználó valószínű mozgásától, súlyozás. |
| Sűrű belvárosi grid (pl. VII. ker.) | Néha rossz párhuzamos utcára snap-elhet. Későbbi: HMM matcher (Newson & Krumm 2009). |
| Phone in pocket vs hand | Kompasz heading megbízhatatlan zsebben; jelenleg nem használjuk heading-et, csak pozíciót. OK. |

### Mozgástípusok
| Típus | Döntés |
| --- | --- |
| Séta | Számít |
| Lassú futás (< 12 km/h) | Számít (anti-cheat nem szűri) |
| Bicikli, roller | Sebesség-cap kiveszi |
| Autó | Sebesség-cap kiveszi |
| Indoor (pláza, IKEA) | Pontatlan GPS miatt nem snap-el utcára → automatikusan nem számít |

## Map matching

| Probléma | Megoldás |
| --- | --- |
| Egyirányú utcapár | Két külön achievement. Két külön bejárás. |
| U-turn / oda-vissza séta | A walked_geom MultiLineString-be union-álódik; egyszer számít. |
| Roundabout | OSM `junction=roundabout` ways külön achievementek. Általában rövid → könnyű teljesíteni. |
| Streets sharing geometry | OSM ritkán így tárolja. Ha mégis: külön way → külön achievement. |
| Sparse points (telefon alvó módba ment) | Aspect: a "run" csoportosítás nem törik el, mert csak ugyanarra az utcára eső szomszédos pontok kerülnek runba. Gap esetén új run kezdődik, de a `walked_geom` union miatt nincs adatvesztés. |

## OSM adat

| Probléma | Megoldás |
| --- | --- |
| Nevesincs utak | Importer szűr: `tags.name IS NOT NULL` → kihagyjuk. |
| "Petőfi utca" mindenhol | Külön sorok mert külön kerületben. UI-on név + kerület együtt jelenik meg. |
| OSM átnevezés / split | Reimport-kor új `osm_way_id` → új sor. A user progress a régihez van kötve. **Jelenleg adatvesztés.** Migration TODO: az import futtassa először a "stale streets" detektálást, és lehetővé tegyen geometria alapú re-link-et. |
| Footway / path / track | Walkable highway-ként importáljuk, mert _járható_ utak. A user UI-on szűrhet később (out of MVP). |

## Több kerületen átnyúló utca

Választott: midpoint-alapú kerület-assign (`ST_LineInterpolatePoint(geom, 0.5)`).

Indok: OSM tipikusan kerelmi határon split-eli a way-eket. A maradék
edge case-ek (kevés) elfogadható hibahatáron belül vannak. Ha később
fontossá válik → ST_Intersection-nel split-elés az importerben.

## UX

| Eset | Megoldás |
| --- | --- |
| User véletlen elindítja és elalszik | Foreground service notification végig látható; akku-drain jelez. _Future_: 4 órás auto-stop ha nincs érdemi mozgás. |
| Hibás bejelölés | _Future_: utca long-press → "Töröld a haladásom" opció. Most: az utca complete-state nem fordítható vissza |
| Több eszköz | Supabase auth már handle-eli; minden device-ról ugyanaz a progress. |
| Account delete | In-app, két lépcsős megerősítés (typed "TÖRLÖM"). |
| Korábbi (app előtti) séták claim-elése | _Out of scope_ MVP. Honest play. |

## Network / sync

| Eset | Megoldás |
| --- | --- |
| Offline session | Kliens buffer AsyncStorage-ben (5000 pont hard-cap). Hálózat visszatértekor flush. |
| Idempotencia | Minden batch egyedi `batch_id` UUID-vel megy ki; szerver `ingest_batches` táblába írja, retry = no-op. |
| Server 500 | A "pending batch" lokálisan marad, következő flush-kor retry. |
| Tartós szerver-hiba | A buffer megnő → 5000 pont után FIFO drop. **Elfogadott trade-off**: a legrégebbi pontok vesznek el, nem az újak. |

## Adatbázis perf

| Eset | Mértékegység | Megoldás |
| --- | --- | --- |
| User aki bejárta Budapest 80%-át | ~20 ezer user_street_progress sor | Index `(user_id, completed)` |
| Zoomed out bbox query | Akár > 5000 utca | `streets_in_bbox` `LIMIT 5000` |
| `area_coverage_ratio` aggregate | 23 kerület × 1500 utca/kerület | View, group by → ~50 ms. Ha lassú lesz: materialized view + trigger. |

## Privacy / Compliance

| Eset | Megoldás |
| --- | --- |
| GDPR access kérés | Email-alapú JSON export; manuális 30 napon belül. _Future_: in-app "Export my data" gomb. |
| GDPR erasure | In-app delete_my_account. 24 órán belül teljes törlés. |
| 13 év alatti user | Privacy policy egyértelműen rögzíti: nem ajánlott. Aktív gyermek-szűrés (pl. életkor input) NINCS — Play Store NEM kötelezi sem 13+ Designed-for-Families esetén. Ha Designed-for-Families címkét akarunk → COPPA-compliance kell. |
| Raw walk_sessions megőrzés | 90 nap után törlés (TODO cron / scheduled function). |
| Adatszivárgás | Supabase incident response + privacy policy + a felhasználók értesítése 72 órán belül. |
