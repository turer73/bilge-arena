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

Tarihsel uretim/seed betikleri dogrudan insert kodu tasiyabilir. Canlida
`content_governance_runtime.enforce_direct_mutation=true` oldugunda DB bunlari
reddeder; yeni otomasyonlar bu betikleri ornek almamali, yonetimli taslak RPC'sini
kullanmalidir.
