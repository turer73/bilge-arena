# Kaynak karşılaştırmalı tek onay — yayın sözleşmesi

1 Ekim 2026. Kullanıcı tek yetkili kabulün canlı yayın sözleşmesine uygulanmasını
onayladı. **217 migration canlıda uygulandı; admin API ve arayüz değişikliği bu
worktree'de hazır, henüz uygulama deploy'u yapılmadı. Hiçbir soru onaylanmadı veya yayınlanmadı.**

## Yeni yol

`draft → kaynak karşılaştırmalı gerçek stage-1 onayı → kalite kapısı → published`

Mevcut `review_question_content_revision` tek gerçek insan imzasını yazar.
İkinci reviewer kaydı üretilmez. Kaynak raporu yeni bir yaşam döngüsü veya
paralel kalite kararı değildir: mevcut onaya bağlı, özel ve append-only kanıttır.
Hazırlayan ve kazanımı bağlayan kişi kendi taslağını onaylayamaz. Bu yolda tek
inceleyen ve ayrı bir yayın yetkisi yeterlidir; yayın yetkisi aynı inceleyende
varsa ayrıca ikinci kullanıcı gerekmez. Eski iki aşamalı yol ve kayıtlar korunur.

Raporun `source-comparison@1` şeması, gerçek question/revision/PostgreSQL hash
kimliği, soru kökü, çözüm, her seçenek ve yerel kazanım kapsamı kontrol edilir.
Her iddia için en az iki bağımsız ve ilgili bölümü okunmuş kaynak zinciri gerekir;
aynı eser, grup, URL veya okunan metin hash'i transitif olarak tek zincir sayılır.
Bu operasyonel kapsam kontrolüdür, bilimsel doğruluk garantisi değildir. Kaynak
hash'i veritabanının internete eriştiği anlamına gelmez; gerçek yetkili kişi
erişim izlerini ve karşılaştırmayı inceleyerek gerekçeli kabul verir. Lisans
uyarıları gösterilir; soru sahipliği/lisans/provenance kaydı ayrıca zorunludur.
Ücretsiz erişim ticari kopyalama izni sayılmaz.

Yayın sırasında kaynak ve kazanım bağları yeniden kontrol edilir. Kabulün hash,
metadata, kaynak ve kazanım fingerprint'i ile mevcut stage-1 imzası eşleşmelidir.
Aktif kazanım kapsamı, base revision CAS ve eski revizyon koruması sürer. Yeni
yol, güncel `question_validation_runtime.required_policy_version` için aynı
soru/revizyon/hash'e ait **APPROVED** yetkili karar ister. `NEEDS_REVIEW`,
transport hatası veya ham ajan birliği bunu karşılamaz. Politika/karar ve
kapsam kilitleri projeksiyon yazımı boyunca tutulur. Mevcut publish trigger'ı
ve transaction-bound doğrudan yazma koruması kaldırılmadı.

## Admin kullanımı

Yeni uygulama dağıtıldıktan sonra taslak ayrıntısında JSON raporu yüklenir,
`Kaynak karşılaştırmasıyla onayla` seçilir ve gerçek inceleme gerekçesi girilir.
Sunucu kullanıcı kimliğini oturumdan alır; client actor/approval alanı kabul
edilmez. Eksik rapor 409, hatalı şema 400, 1 MiB üstü gerçek istek gövdesi 413
döner. Regex JSON kurtarma yoktur. Rapor yüklenmesi kendi başına onay değildir.
Yayın düğmesi stage-1 için yalnız sunucunun tüm kapıları hazır bulmasıyla görünür.
Eski endpoint dağıtımında yeni durum endpoint'inin yokluğu eski akışı bozmaz.

Yeni endpoint:
`/api/admin/content-quality/revisions/[revisionId]/source-review` (GET/POST).
Raporlar öğrenciye veya durum GET yanıtına yansıtılmaz; yanıtlar `private, no-store`.
Tabloda RLS açık; anon/authenticated/service_role doğrudan tablo erişimi yok.
Yazma yalnız service-role RPC ve mevcut gerçek kullanıcı permission kontrolüyle.
Rol ataması, kullanıcı yetkisi veya enforcement flag'i değiştirilmedi.

## Canlı geri okuma

Migration ledger: `20261001193004 / 217_question_source_review_single_approval`.
19:31:03 UTC geri okumada 17 Sosyal taslağı hâlâ draft; 17 eski yayın işaretçisi
ve 17 kazanım bağı korunmuş; onay 0, yetkili karar 0, yeni kaynak kabulü 0,
tek-onay yayın hazır 0. `question-quality@2` ve enforce_publish_gate=true değişmedi.

17 rapor hâlâ `insufficient_evidence`. Tek onay kararı bu raporları tamamlanmış
saymaz, legacy-import lisansını yeni lisans yapmaz, iç SOS-* kodlarını resmî MEB
kazanım kabulüne dönüştürmez. Kaynak/kapsam eksikleri ve yetkili kalite kararı
tamamlanmadan yeni Sosyal içeriği yayınlanamaz. 216 pilot dağıtımı ayrıdır.

Supabase advisor karşılaştırması yalnız yeni özel tabloda INFO
[RLS enabled, no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
buldu. Bu tablo için client policy olmaması bilinçli deny-all tasarımdır; açmak
için client policy eklenmedi. Yeni WARN/ERROR bulgusu yok; mevcut proje bulguları
bu iş kapsamında topluca değiştirilmedi.

## Doğrulama ve sınırlar

- API/mevcut yönetişim/kaynak sözleşmesi testleri: 60 geçti.
- Yeni admin rapor yükleme/yayın kontrolü testleri: 4 geçti.
- İzole gerçek PostgreSQL WASM motorunda 36 SQL kabul testi geçti; toplam 100
  ilgili test geçti (60 API/sözleşme, 4 arayüz, 36 SQL).
  Gerçek hash/request/approval/scope fonksiyonları kullanılır; mevcut write-context
  ve split-curriculum yayın yordamları bu dar fixture'da stub'dır.
- TypeScript, değişen dosyaların ESLint'i, migration idempotency ve function
  grant/search_path linter'ları geçti.
- Yerel native PostgreSQL URL olmadığı için mevcut 18 native/concurrency kabul
  testi **atlandı**. Bu sonuç native race/RLS/write-context provasının geçtiği
  şeklinde sunulamaz. CI/native test ayrı zorunlu release kontrolüdür.
- Varsayılan Turbopack build, worktree node_modules junction'ı root dışında olduğu
  için panic verdi. Uygulama kodu veya ortak node_modules değiştirilmeden Webpack
  build ayrıca çalıştırıldı ve geçti; yeni source-review route'u derlenen
  route listesinde yer alıyor. Bu varsayılan Turbopack build geçti demek değildir.
- Authenticated browser, gerçek öğrenci akışı ve fiziksel cihaz kabulü yapılmadı.
  Uygulama deploy'u, merge/push veya soru içeriği yayını bu migration sonucu değildir.

Çalıştırma:

```powershell
node node_modules/vitest/vitest.mjs run --config vitest.database.config.ts database/__tests__/question-source-review-wasm.test.mjs
node node_modules/vitest/vitest.mjs run src/app/api/admin/content-quality/__tests__/source-review.test.ts src/components/admin/__tests__/content-governance-source-review.test.tsx
```

Rollback: `database/rollback/217_question_source_review_single_approval.sql`
önceki yayın ve Sosyal kaynak-readiness fonksiyonlarını geri getirir ve yeni
kabul RPC'sinin service_role execute yetkisini kaldırır. Onay/rapor tablosunu
ve tarihsel kayıtları silmez. Otomatik uygulanmadı; lokal SQL testi kapsar.
İleride yeniden etkinleştirme migration'ı aynı kanıtları koruyabilir.

Özel canlı receipt:
`secure/source-single-review-release-20261001/receipt.json`.
