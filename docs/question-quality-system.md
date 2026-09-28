# Soru kalitesi: tek otorite, katmanli guvence

## Karar

Bilge Arena'da birden fazla kalite sinyali vardir; ancak yayin kararini veren
tek otomatik otorite vardir:

`src/lib/question-audit` -> `question_validation_runs` ->
`question_validation_decisions` -> `question_validation_runtime`

Canli yayin kapisi yalniz `question_validation_runtime.required_policy_version`
ile tam eslesen `APPROVED` kararini kabul eder. Saglayici/model/prompt/ayar
kimligiyle tam eslesen insan-altin benchmark kaniti olmadan yetkili karar
yazilamaz.

## Katmanlar

| Katman | Amac | Yetkili karar yazar mi? |
| --- | --- | --- |
| `question_content_basic_guard` | DB'ye giren icerigin temel sekil kosullari | Hayir |
| `validate-question-bank.mjs` ve `question-source.ts` | Bos/bozuk alan, secenek ve indeks gibi deterministik kusurlar | Hayir |
| `src/lib/question-audit` | Kor cozucu + adversarial + cozum denetcisi kaniti ve saf verdict | Evet, yalniz terfi kanitiyla |
| Icerik yonetisimi (migration 106) | Taslak, iki asamali insan onayi, yayin, karantina ve duzeltme | Nihai insan/operasyon otoritesi |
| Itiraz, kullanici raporu ve psikometri | Uretim sonrasi sinyal ve duzeltme girdisi | Hayir; insan kuyruguna kanit verir |
| `quality-audit.mjs`, `audit-math-fen.mjs`, `audit-semantic.mjs` | Salt-okunur/yerel teshis | Hayir |

Bu katmanlar alternatif sistemler degildir. Ayni yasam dongusunun farkli
kapilaridir; hicbiri `question_validation_decisions` disinda otomatik yayin
karari uretemez.

## Yetkili isletim akisi

1. Soru, yonetimli taslak olarak `create_governed_question` ile olusturulur.
2. Deterministik sekil kontrolleri gecersiz girdiyi LLM'e gitmeden reddeder.
3. `audit:calibrate -- --persist --no-decisions --confirm` ham, replay edilebilir
   ajan kosularini saklar.
4. En az iki uzmanla olusturulmus, held-out insan-altin etiketler
   `audit:benchmark` ile degerlendirilir.
5. Ayni execution identity ve varsayilan terfi esikleri gecerse cached kosu
   `--promotion-report` ile yetkili karari yazar; yeni LLM maliyeti gerekmez.
6. Iki asamali insan onayi sonrasinda DB yayin kapisi yalniz gerekli politika
   surumundeki `APPROVED` kararla yayina izin verir.
7. Uretim sinyalleri sorun gosterirse soru once karantinaya alinir; duzeltme yeni
   revizyon olarak ayni hattan yeniden gecer.

## Emekliye ayrilan yollar

- `database/audit-llm-judge.mjs`: kalibre edilmemis paralel tek-model yargici;
  fail-closed durumdadir ve npm komutu yoktur.
- `database/import-json-to-db.mjs`: dogrudan `questions` insert eden eski arac;
  canli yonetisimle uyumsuz oldugu icin fail-closed durumdadir.
- `database/audit-validate.mjs`: daha once `validate-question-bank.mjs` lehine
  emekliye ayrilmistir.

Tarihsel uretim/seed betikleri dogrudan `questions` DML kodu tasiyabilir.
Migration 163 sonrasinda `anon`, `authenticated` ve `service_role` rollerinin
INSERT/UPDATE/DELETE yetkisi yoktur; bu betikler servis anahtariyla fail-closed
olur. Yeni otomasyonlar yonetimli taslak RPC'sini kullanmalidir. Acil bakim
gerekiyorsa API anahtari bir "break glass" yolu degildir: owner yetkili,
incelemeli ve kayitli bir SQL migration'i gerekir.

## Pilot bulgularindan taslak revizyon

Antigravity pilotlari ve `npm run scan:question-text` yalniz ADAY uretir. Aday,
migration ile ya da `questions` tablosuna dogrudan yazilarak canliya alinamaz:
`trg_question_content_direct_mutation_guard` (106/142) icerik ve `is_active`
degisikligini 42501 ile reddeder ve migration dosyalari icerik tasimaz.
Hicbir LLM ciktisi (kor cozucu, oneri metni) tek basina yayin, ret veya
karantina otoritesi degildir.

Yol:

1. Oneri dosyasi (`question-revision-proposals@1`; ornek ve 16 soruluk iskelet
   `database/__fixtures__/question-revision-proposals/` altinda). Her oge:
   soru kimligi, bulgu (kod/onem/ozet), kanit, `changeKind`
   (`edit` | `correct_answer` | `retire`), yalniz icerik alanlarini tasiyan
   `patch` ve gerekce. Zorluk, kategori ve kazanim `patch` ile degismez.
2. `npm run revision:drafts -- --proposals <dosya> --user-id <hazirlayan>`: kuru
   calisma. Her soru icin yayimli revizyon, kaynak kaydi ve kazanim eslemesi
   `get_question_content_revision` RPC'si ile hazirlayan kimligiyle okunur
   (`question_revision_sources` service_role'a kapalidir, 136 yalniz revizyon
   tablosuna sutun bazli SELECT verir); 106 + 110 (`coach`)
   `content_governance_validate_payload` sozlesmesine uyan payload kurulur;
   `coach` nesnesi aynen tasinir ve patch ile degistirilemez; coach'lu soruda
   cevap indeksi veya secenek metni (yazim duzeltmesi disinda) degisemez,
   once insan coach revizyonu yapar; onerilen icerik
   deterministik taramadan ERROR alirsa oge bloklanir. Cikti:
   `payloads.json`, `review-sheet.md` (once/sonra tablosu) ve `report.json`,
   varsayilan olarak `secure/revision-drafts/<paket>/`. DB'ye yazilmaz.
   DB yoksa `--rows <dis aktarim>` ile cevrimdisi onizleme alinir.
3. `--apply`: yalniz "ready" ogeler icin
   `create_question_content_revision` cagrilir; sonuc TASLAKTIR. Istek kimligi
   soru + payload'dan turetilir, yeniden calistirma taslak cogaltmaz; taban
   revizyon bayatsa RPC reddeder (`22023`).
4. Iki insan onayi: stage 1 ve stage 2, hazirlayandan ve birbirinden farkli
   kisiler (`review_question_content_revision`); ardindan
   `publish_question_content_revision`. Pasife alma yalniz `retire`
   taslaginin yayimidir.
