# Kaynak karşılaştırması v2 — içerik ile resmî kapsamı ayırma

Bu görev kör çözüm değildir. Soru, seçenekler ve çözüm görünürdür. Çıktı
`source-comparison@2` sözleşmesine uyar; insan kabulü veya yayın kararı değildir.
Genel araştırma ve dürüst erişim kuralları için [v1](source-comparison-v1.md)
geçerlidir. Tek değişiklik aşağıdaki sürümlü kazanım bağıdır.

## İçerik

Kök, her seçenek ve çözüm iddiası için en az iki bağımsız kaynak grubu gerekir.
Aynı eser, çeviri, ayna, aynı URL veya aynı metin hash'i ikinci kaynak sayılmaz.
Çelişki çoğunluk oyuyla ortadan kalkmaz. Salt kaynak başlığı veya özetinden
okunmamış sayfa için erişim makbuzu üretme. Ücretsiz erişim kopyalama lisansı değildir.

## Kazanım

Resmî programın ne dediği bir ansiklopediyle oylanmaz. Kazanım iddiası için
doğrudan okunmuş resmî program ve kayıtlı kanonik kimlik gerekir:

`programKey@programEdition:gradeN:examRef:officialCode`

`curriculumBinding` alanı `examRef`, `examYear` ve `mappings` içerir. Her eşleme:

- `claimId`: rapordaki kazanım iddiası;
- `outcomeId`, `canonicalId`: operatörün verdiği gerçek katalog kimlikleri;
- `programKey`, `programEdition`, `grade`, `officialCode`: aynı kaydın kimliği;
- `programSourceId`, `programPageTextSha256`: resmî program sayfası ve onun metin hash'i;
- `examScopeSourceId`, `examScopeLocator`: seçilen sınav yılını doğrulayan resmî kaynak ve bölüm.

Program kaynağının `retrievedTextSha256` değeri **ilgili program sayfasının çıkarılmış
metnine** aittir; bütün PDF, JSON paketi veya başka sayfanın hash'i değildir. URL ve
sayfa metni hash'i kayıtlı kanonik makbuzla eşleşmelidir. Kullanılan çıkarıcı ve sürüm
kanonik makbuzda tutulur; metin özetini kaynak pasajı gibi hash'leme.

Sınav yılı kaynağı `official_exam` veya `official_curriculum` olabilir. Yalnız tür
etiketi yeterli değildir: tür, URL, metin hash'i, `retrievalRef` ve locator,
`curriculum_canonical_exam_scopes` içindeki yetkili katalog sahibi tarafından
incelenmiş aynı kimlik/yıl kaydıyla eşleşmelidir. Bu kayıt report ingestion ile
oluşturulmaz. 2026 kaydı 2027 kanıtı değildir.

Kimlik, eşleme veya yıl kanıtı eksikse `curriculumBinding: null` yaz. UUID, resmî
kod veya kabul uydurma; mevcut içerik araştırması yine korunur. Kısmi beceri sorusu
bütün kazanımı ölçmüş sayılmaz. Sınav kapsamındaki başka ders/sınıfı zorla eşleme.

## Kontrollerin sınırı

Yerel validator yalnız bildirilmiş kanıtın yapısını değerlendirir. `evidence_complete`
bile katalog kabulü değildir; `CURRICULUM_CATALOG_ACCEPTANCE_REQUIRES_DATABASE_CHECK`
uyarısı bunun için vardır. PostgreSQL, gerçek revizyon-kazanım eşlemelerini, aktif
hiyerarşiyi, kanonik kimliği, sayfa makbuzunu ve yıl kabulünü yeniden kontrol eder.

V1 dosyaları geriye dönük değiştirilmez. Varsayılan `prepare` hâlâ v1 üretir.
V2 için:

```text
node database/source-comparison-review.mjs prepare-v2 INPUT.json NEW_DIRECTORY
node database/source-comparison-review.mjs validate NEW_DIRECTORY
```

Manifest, task ve response aynı sürümde olmalı. Araç veritabanına yazmaz. Yeni LGS
tek-insan kaynak kabulü v2 gerektirir; mevcut v1 kabul geçmişi ve aynı isteğin tam
idempotent tekrarı korunur. Yetkili gerçek inceleyici, kaynak kökeni, tam revizyona
bağlı `question-quality@2` kararı ve ayrı yayın adımı aynen kalır.

## Dağıtım sırası ve geri dönüş

1. İlgili testler ve yetki incelemesi. Kaynak inceleme testi hem izole WASM hem gerçek
   PostgreSQL ile çalışabilir; ayrıca native yönetişim testi 219/v2'yi gerçek taslak,
   kaynak kabulü, yayın ve yazma korumalarıyla birlikte uygular. Aynı kabul isteğinin
   iki eşzamanlı çağrısı yalnız bir onay ve bir kaynak kaydı üretmelidir.
   Bu seçilmiş migration zinciri tam üretim şeması veya yük testi değildir.
2. Üretimde 217 ve 219'un varlığı, fonksiyon/grant tanımları ve katalog durumu salt
   okunur doğrulanır. Bu doküman canlıya uygulanmış olduğunu söylemez.
3. Onaylı migration `20261008183619_question_source_curriculum_v2.sql` uygulanır;
   ardından izinler, v1 tarihçesi ve v2 eksik-kayıt reddi geri okunur. Migration seed,
   onay veya soru yayını içermez; yeni tablo boş kalır.
4. V2 uygulama/CLI sürümü dağıtılır. Migration önce gelmelidir; aksi halde eski DB
   v2 raporları reddeder (güvenli kapanma).
5. Ayrı, kanıtı incelenmiş katalog/yıl işlemi ve gerçek insan kabulü tamamlanmadan
   iki Din sorusu yayımlanmaz. Tanılama aktivasyonu bu değişikliğin kapsamı değildir.

Sorunda yeni kabul işlemlerini durdur; migration 217'yi körlemesine tekrar çalıştırma
(yeni LGS v1 kabulünü yeniden açar). Uygulamanın eski sürüme dönüşü v2 yazımını durdurur;
veritabanındaki v2 koruması ve değişmez kayıtlar korunur. Silerek geri dönüş yoktur.

## Yerel ve CI doğrulaması

`SOURCE_REVIEW_PG_BIN` mutlak PostgreSQL `bin` dizinidir. Test yardımcısı mevcut bir
bağlantı URL'si kabul etmez: yeni geçici dizin, yalnız loopback dinleyicisi ve boş
Unix socket ayarıyla kendi kümesini açar; gerçek veri dizinini geri okuyup eşleştirir.
İş bitince kendi kümesini durdurur, tanı için geçici dosyaları saklar.

```text
SOURCE_REVIEW_PG_BIN=/usr/lib/postgresql/16/bin
SOURCE_REVIEW_PG_REQUIRED=1
node node_modules/vitest/vitest.mjs run --config vitest.database.config.ts database/__tests__/question-source-review-wasm.test.mjs database/__tests__/source-comparison-review.test.mjs
```

İlk iki satır kullanılan kabuğa göre ortam değişkeni olarak ayarlanmalıdır.
`SOURCE_REVIEW_PG_REQUIRED=1` iken binary yolu eksikse test atlanmaz, koşu hata verir.
Native yolu verilmişken başlatma hatası da WASM'a sessiz geçiş yapmaz. CI'daki
`question-quality-postgres` işi bu kontrolü zorunlu olarak çalıştırır. Önceki native
yönetişim işi de v2 yaşam döngüsünü kapsar; yalnız adımın dosyada olması CI başarısı
değildir, ilgili commit'in GitHub koşusu ayrıca doğrulanmalıdır.

`question-content-governance-postgres.integration.test.mjs` yalnız açıkça disposable
olarak işaretlenen `bilge_r43_test_*` veritabanında çalışır ve test şemasını yeniden
kurar. **Üretim URL'si bu teste verilmez.** Örnek kaynaklar ve kalite kararları yalnız
test verisidir; gerçek soru, kaynak kabulü veya insan kararı sayılmaz.

8 Ekim 2026 yerel prova PostgreSQL 16.15 ile, canlı salt-okuma PostgreSQL 17.6 üzerinde
yapıldı. Sürüm eşitliği veya 225 migration'ın tamamının provası iddia edilmemelidir.
