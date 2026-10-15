# LGS Türkçe kalite geçişi — yerel uygulama, yayın değil

14 Ekim 2026. Taban: `origin/master` / `4fbb3050`. Kullanıcı bu iş özelinde
Codex'in iki kod düzeltmesini yapmasını doğrudan onayladı. Bu izin ücretli
denetim, canlı migration, soru yayını, push veya merge izni değildir.

## Değişiklik 1: hedefe bağlı terfi kanıtı (#2487)

`assertPromotionEvidence` artık yürütme kimliği yanında gerçek hedef bağlamını
ister. `promotion-scope@1` yalnız `bounded_cohort` destekler:

- Ders (`game`), sınav (`examRef`), sabit kontrol etiket dosyasının SHA-256'sı.
- Tam soru UUID / revizyon UUID / içerik SHA-256 kümesi. Alt küme, ek hedef,
  aynı sorunun iki revizyonu veya aynı revizyonun tekrar sayılması kabul edilmez.
- Mevcut model/istem/ayar, varsayılan istatistik eşikleri ve varsa ilave koşullar
  aynen zorunludur. Genel model/alan terfisi bu sürümde desteklenmez.

Runner, **elenenler dahil tüm çekilen hedefleri** kontrol eder. Bir hedefin
deterministik kapıdan elenmesi yetkili karar koşusunu durdurur. Kontrol ilk
model çağrısı, cache okuması, ham kayıt veya karar yazımından öncedir.
Dry-run çağrı yapmaz; raw-only benchmark akışı terfi gerektirmeden kullanılabilir.

`--target-scope preregistered-scope.json` seçimi, taslakları **tam revizyon
UUID'leriyle** okur; aynı metinli eski revizyona veya yayımlı soruya düşmez.
Eksik/yinelenmiş kayıt, ders/sınav/hash değişimi reddedilir. Kontrol etiketleri
aday seçimi gibi kullanılmaz. Diğer seçim filtreleri veya `--limit` ile küme
daraltılamaz. Bu bayrak tek başına çalıştırma veya karar yetkisi değildir.

Yeni çevrimdışı benchmark üretimi, gerçek etiket ve ölçüm dosyaları hazırken:

```powershell
node database/run-question-benchmark.mjs --labels frozen-labels.json --report calibration.json --scope preregistered-scope.json --out new-benchmark.json
```

Yalnız seçim ve çağrı planı (canlı veri okuması gerektirir, bu tur çalıştırılmadı):

```powershell
node database/run-question-audit.mjs --target-scope preregistered-scope.json
```

`controlSetSha256`, `frozen-labels.json` dosyasının **tam baytlarının** hash'idir;
etiketlerdeki `proofRef` bağlantıları ve gerekçeleri ayrı incelenmelidir.
`--scope` olmadan üretilen sonuç yalnız tanısal metriktir. Çıktı dosyası varsa
üzerine yazılmaz. Eski Fen kanıtına geriye dönük Türkçe kapsamı eklenmez.

Yetkili karar yazıcısı ayrıca `--control-set frozen-labels.json` ister. Dosya
bağımsız okunur, etiket şeması denetlenir ve hash raporla karşılaştırılır. Kapsam
veya kontrol dosyası eksik eski rapor artık karar yazımını açamaz. Bu kasıtlı bir
CLI sözleşme değişikliğidir; mevcut yayımlı sorulara veya geçmiş kararlara dokunmaz.

Hash eşleşmesi dosyanın doğruluğu, uzman bağımsızlığı ya da imzalı yetki değildir.
Kapsam manifesti koşudan önce kararlaştırılmalı; güvenilir operatör ve kanıt
incelemesi sınırı korunmalıdır. Kaynak kabulü benchmark gold etiketi değildir.

## Değişiklik 2: dar veritabanı geçişi

`20261014183929_revision_bound_turkce_quality_policy.sql` CLI `migration new`
ile oluşturuldu; projenin kanonik `database/migrations` dizinine alındı.

| Ders / sınav | Ham koşu | Karar |
|---|---|---|
| Fen / LGS | `question-quality@4` | `question-quality@5` |
| Türkçe / LGS | `question-quality@5` | `question-quality@5` |

Diğer ders/sınav/sürüm çiftleri açılmaz. Genel politika `@2` kalır. Eski Fen
bağlamaları ve içerikler korunur. Aynı çift denetimi hem bağlama trigger'ında
hem etkin politika çözümleyicisinde kullanılır. Mevcut publisher, kaynak
readiness ve yayın trigger'ı aynı çözümleyiciyi kullanmaya devam eder.

Tam beş ham kayıt (3 kör örnek + adversarial + verifier), revizyon/hash/run ve
model/istem/ayar kimlikleri zorunludur. Eksik/değişmiş bağlamada eski `@2`
kararına dönüş yoktur. Bağlama henüz yokken aynı LGS Fen/Türkçe revizyonuna
`@5` kararı yazılmışsa eski `@2` kararı yayını açamaz. Bağlamasız eski `@2`
revizyonları ve ileride ayrı kararla değiştirilecek genel politika davranışı
korunur. Kaynak/yıl kabulü ve insan/owner yayın koşulları kaldırılmaz.

Bağlamalar append-only kalır; `anon`/`authenticated` hiçbir yetki almaz,
`service_role` yalnız SELECT yapabilir. Yardımcı fonksiyonlar PUBLIC'e açık
değildir; SECURITY DEFINER fonksiyonların yolu `pg_catalog` ile sabittir.
Migration hiçbir bağlama, karar, kabul, soru veya yayın satırı üretmez.

## Doğrulama ve sınırlar

- Birim testleri: yanlış ders/sınav, ek/eksik/yinelenmiş hedef, revizyon/hash,
  kontrol seti, eksik/eski kapsam ve başarısız ek koşullar ağ/cache/yazıcı öncesi
  reddediliyor. Pozitif kontrol doğru kapsamın cache aşamasına geçtiğini gösterir.
- Native PostgreSQL: eski Fen ve yeni Türkçe yolları, idempotent migration,
  mevcut bağlama makbuzunun korunması, izinler, kaynak kapıları ve iki bağlantıyla
  yayın sırasında ham kayıt/karar kilitleri sınanıyor.
- PostgreSQL testi ilk denemede otomatik kısaltılan eski CHECK adını yakaladı.
  Gerçek eski ad kaldırıldı; yeni CHECK adları kısa ve açık. JSON eksikleri
  `CHECK (... IS TRUE)` ile NULL nedeniyle kabul edilemez.
- Veritabanı testleri **izole, yeni oluşturulan yerel PostgreSQL** kullanır.
  Gerçek publisher/trigger çalışır; bazı kaynak/rol bağımlılıkları fixture'dır.
  Bu, tüm canlı migration zincirinin veya canlı ACL durumunun provası değildir.
- Önceki kaynak kabulü ve hazırlık paketlerinin 14+14 dosya mührü tekrar
  doğrulandı. Eski paketler değiştirilmedi. Canlı veritabanına bu tur bağlanılmadı.

Yerel kontrol makbuzları git dışındaki
`secure/turkce-quality-implementation-20261014/` dizinindedir:

- `audit-tests.json`: kalite modülünde 516/516 test geçti.
- `full-app-frozen.json`: kod sabitken yeni tam uygulama koşusu **527 dosya,
  5.245/5.245 test**, 0 hata, 0 atlama; 436,79 saniye. Önceki denemedeki
  zaman aşımı ve export yükleme hataları bu koşuda tekrarlanmadı.
- `database-tests.json`: dört veritabanı/CLI test dosyasında 281/281 geçti,
  atlanan test yok; bunun 140'ı Fen/Türkçe revizyon-politika testidir.
- `real-fen-rejection.json`: gerçek eski Fen terfi raporu, 21 Türkçe hedefi için
  reddedildi. Rapora sonradan kapsam eklenmedi; model ve DB çağrısı yapılmadı.
- `code-snapshot.json`: 12 kod/test/CI/migration dosyasının son koşu sırasındaki
  hash'leri. Doküman bu yürütülebilir kod kümesine dahil değildir.
- `earlier-test-attempt.json`: ilk geniş taramadaki dokuz hata saklandı.
  Biri GameView zaman aşımı (ayrı koşuda 3/3 geçti), sekizi koşu sırasında
  eklenen fonksiyonun yüklenememesiydi; eski modül önbelleği olası neden.
  Dosya değişiklikleriyle çakışan bu deneme final kabul
  sayılmadı; kod sabitken yeni tam koşu açıldı.
- TypeScript, değişen TS dosyalarında ESLint, iki CLI sözdizimi, 238 migration
  idempotency denetimi, fonksiyon grant/search_path denetimi ve diff kontrolü
  geçti. Build, E2E ve GitHub CI bu yerel teslimin kapsamında çalıştırılmadı.

Tekrar çalıştırma:

```powershell
node node_modules/vitest/vitest.mjs run src/lib/question-audit/__tests__
$env:SOURCE_REVIEW_PG_BIN = '<yerel PostgreSQL bin dizini>'
$env:SOURCE_REVIEW_PG_REQUIRED = '1'
node node_modules/vitest/vitest.mjs run --config vitest.database.config.ts database/__tests__/revision-bound-fen-quality-policy.test.mjs database/__tests__/question-benchmark-scope.test.mjs
node database/lint-migrations.mjs
node database/lint-function-grants.mjs
node node_modules/typescript/bin/tsc --noEmit
```

## Ayrı yetki gerektiren yayın ve geri dönüş planı

1. Bağımsız kod incelemesi ve CI. Canlıda önce mevcut CHECK adları, trigger,
   fonksiyon gövdeleri, izinler ve migration ledger salt okunur doğrulanmalı.
2. Açık şema-yayını izniyle yalnız yeni migration uygulanır. Bağlama/karar/
   kabul/soru sayılarının değişmediği, global `@2`, eski Fen makbuzları ve ACL
   geri okunur. Beklenmeyen durum varsa işlem durur; kapı gevşetilmez.
3. Türkçe kontrol etiketleri, bağımsızlık/provenance, model/istem/ayar ve tam
   kapsam sabitlenir. Ayrı maliyet izninden sonra gerçek denetim koşulur.
4. Başarılı, eşleşen kanıtla normal karar yazıcısı; ayrıca yetkili tam revizyon
   bağlaması ve yayın işlemi. Model sonucu veya bu kod değişikliği yayın değildir.

Geri dönüş: henüz prod değişmediğinden şu an geri alınacak canlı işlem yoktur.
Migration transaction içindedir; hata bütünü geri alır. Sonradan sorun görülürse
Türkçe koşu/yayınını durdur ve kanıtları koru. Türkçe bağlaması oluşmadan, önceki
DDL makbuzuyla kontrollü geri migration tasarlanabilir. Bağlamalar oluştuktan
sonra eski Fen migration'ını körlemesine yeniden çalıştırma veya satırları silme;
önce etkileri incele, tercihen dar bir ileri düzeltme kullan. Source onayları ve
öğrenci geçmişi hiçbir geri dönüşte silinmez.

Yeni yerel teslim paketindeki `unexecuted-plan.json` 21 hedefi eski makbuz hash'i
ile sabitler; kontrol etiketi sayısı 0, bütçe/model seçimi bekliyor, koşu ve yayın
yetkisi false. Bu dosya geçerli bir terfi raporu değildir.

Teslim durumu: `codex/turkce-quality-scope-20261014` dalındaki değişiklikler
yereldir ve commit edilmemiştir. Push/PR/merge, canlı migration, ücretli denetim
ve soru yayını yapılmadı. #2487 için yerel düzeltme hazırdır; canlıda çözülmüş
olarak işaretlenmemelidir. Bu uygulama incelemesi bağımsız kod incelemesi değildir.
