# Kurumsal üretim güvenliği kanıt kaydı — 2026-08-24

Bu belge pazarlama beyanı değildir. Kodla kapanan kontrolleri, canlı kanıtı ve
insan/tedarikçi kararı bekleyen kapıları birbirinden ayırır.

## Zorunlu release kapıları

| Kapı | Durum | Kanıt / reddetme koşulu |
|---|---|---|
| Ücretli kurum onboarding | Kapalı | `INSTITUTION_ONBOARDING_ENABLED` production envanterinde yok; kod yalnız tam `true` değerinde açar, diğer durumda route 503 |
| 16 Mayıs KVKK/pentest kaydı | Teknik olarak kapalı; hukuk kararı veri sorumlusunda | [Kapanış kaydı](./2026-05-18-authorized-pentest-closure.md) olayı yetkili iç pentest/responsible disclosure olarak sınıflandırır; gerçek erişim kontrolü bulgusu kapatıldı, yetkisiz dış üçüncü taraf erişimi/aktarımı kanıtı yok |
| Hassas yüzey telemetrisi | Kodda tamam | Hassas sayfa ve API namespace'lerinde reklam, GA, Plausible ve Sentry event yok; kamusal document'tan hassas alana SPA geçişi native document boundary'ye çevrilir; replay global 0 |
| Dağıtık rate limit | Canlı config + kodda tamam | Production'da Upstash ve KV env adları mevcut; eksik/erişilemez backend 503/fail-closed |
| Personel AAL2 | Canlıda tamam | TOTP enrollment/challenge, proxy/API kapısı ve migration 155 ile doğrudan RPC çağrılarında JWT `aal=aal2`; PR #439 admin dönüş hedefi ve eksik enrollment akışını canlıda düzeltti |
| Tenant audit | Canlıda tamam | Migration 145 + 149 + 154 + 155; kritik kurum/sınıf işlemleri immutable event, davet/review/exam-mode hedef ve sonuç alanları doğrulandı |
| JWT-bound RPC | Canlıda tamam | Migration 150 + 155 ve PR #428 canlıda; kurum, öğretmen ve platform kurum RPC'leri caller JWT, AAL2 ve aktif tenant durumuna bağlı; anon kapalı |
| DSAR export | Canlıda tamam | Migration 154 + 155 + 156 ve PR #428 canlıda; kimliği doğrulanmış `/api/account/export`; katalogdan yalnız veri sahibini işaret eden UUID sütunlarını ve ilişkili answer/submission-item satırlarını derleyen service-role-only RPC; öğretmenin öğrencilerine ait satırlar ve rapor edilen kullanıcıya ait olmayan moderasyon/raportör verileri dışarıda; no-store JSON; production rate limit |
| İstek ledger imhası | Canlıda tamam | Migration 152 + 155 ve günlük Vercel cron canlıda; varsayılan 90 gün sonunda ledger silinmeden kalıcı hash tombstone üretir, request UUID tekrar kullanımını reddeder ve immutable audit event'leri korur. 30 günden yeni cutoff SQL'de reddedilir |
| DB yedek/restore | Canlı betik + ölçülmüş DB restore | [25 Ağustos tatbikatında](./institution-restore-drill-2026-08-25.md) ACL korumalı 24.659.983 bayt dump ağsız Supabase PG17 imajına 47 saniyede restore edildi; 11/11 migration, RPC grant sınırları ve extension seti geçti. Tam servis cutover RTO'su değildir |
| Yedek DB parolası rotasyonu | Bloke / hesap sahibi gerekli | Eski süreç-argümanı sızıntısı çevrelendi ve canlı betik düzeltildi; [olay kaydındaki](./2026-08-25-backup-credential-process-exposure.md) Supabase parola rotasyonu panel girişi olmadan tamamlanamaz |
| Genel otomatik imha | Kısmi / hukuk kararı bekliyor | [Karar kaydı](./institution-retention-decision-record-2026-08-25.md) mevcut teknik davranışı ve doldurulması gereken hukuk alanlarını ayırır; onaylı süre olmadan genel silme cron'u açılmaz |
| Tenant A/B gerçek oturum | Bloke | [Kanıt matrisi](./institution-canary-and-tenant-proof-runbook-2026-08-25.md) hazır; iki tenant ve AAL2'li gerçek test hesapları tahsis edilmedi |
| Gerçek kurum canary | Bloke | [Canary runbook'u](./institution-canary-and-tenant-proof-runbook-2026-08-25.md) hazır; kurum, DPA/aydınlatma onayı ve sorumlu kişi seçilmedi |

## ASVS odaklı tehdit modeli

| Tehdit | Kontrol | Test kapısı |
|---|---|---|
| BOLA / tenantlar arası okuma | RPC içinde membership + tenant kontrolü, `auth.uid()` aktör bağı | Tenant A'nın tüm ref/UUID'leri Tenant B oturumunda 403/404; veri alanı dönmez |
| Çalınmış personel oturumu | AAL2 + kısa süreli TOTP doğrulaması | AAL1 ile sayfa redirect, API 428 `aal2_required` |
| Service-role ile kimlik taklidi | Kurum/sınıf RPC'lerinde kullanıcı JWT'si | Route context service-role client oluşturmamalı; migration allowlist dışını grant etmemeli |
| Rate-limit backend kesintisi | Production fail-closed | Redis yok/timeout: ayrı instance belleğine düşmeden 503 |
| Personel ekranından veri sızıntısı | Üçüncü taraf script/event/replay yasağı | Hassas rota HTML/DOM/network'te GA, Plausible, AdSense ve replay bulunmamalı |
| İnkâr edilebilir yönetim işlemi | Immutable tenant audit | UPDATE/DELETE reddi; request replay tek event |
| Kurum yöneticisi kaybı / sözleşme durması | Yönetici devri + platform askıya alma/terminal arşiv | JWT-bound olmayan aktör reddi; askıya alınan tenant RPC'leri kapanır; gerekçe immutable event'e yazılır |
| Fazla veri içeren export | Yalnız oturum sahibine service-side derleme, no-store | Başka user id parametresi yok; response cache edilemez |

## Alt işleyen ve yurt dışı aktarım envanteri

Ayrıntılı, kaynak bağlantılı ve hesap kanıtını kamusal DPA'dan ayıran güncel kayıt:
[institution-vendor-transfer-register-2026-08-25.md](./institution-vendor-transfer-register-2026-08-25.md).

| Hizmet | Amaç / veri | Kurum yüzeyi politikası | DPA / bölge durumu |
|---|---|---|---|
| Supabase | Kimlik, PostgreSQL, Storage | Zorunlu ana işleyen | Kamusal DPA var; hesap DPA'sı, proje bölgesi ve HIBP ayarı doğrulanmadı |
| Vercel (`fra1`) | Uygulama çalıştırma, edge log | Zorunlu barındırma | Frankfurt compute kodda doğrulandı; hesap DPA'sı doğrulanmadı |
| Upstash / Vercel KV | Pseudonymous rate-limit anahtarı | Zorunlu güvenlik kontrolü | Kamusal DPA var; hesap bölgesi ve DPA kabulü doğrulanmadı |
| Sentry | Hata/trace | Hassas yüzeylerde event kapalı; replay tamamen kapalı | Kamusal DPA/DE region seçeneği var; hesap retention, DPA ve region doğrulanmadı |
| Panola/Plausible (self-hosted) | Kamusal ürün analitiği | Kurum/sınıf/admin yüzeyinde yasak | VPS lokasyonu ve erişim sorumluları kayda alınmalı |
| Google Analytics / AdSense | Kamusal analitik/reklam | Kurum/sınıf/admin yüzeyinde yasak | Kurumsal veri gönderilmez |
| Resend | İşlemsel e-posta | Davet içeriği ve alıcı minimizasyonu gerekir | Kamusal DPA var; hesap Documents kanıtı/region/retention doğrulanmadı |
| Google/DeepSeek AI | Soru/içerik üretimi | Öğrenci/personel PII gönderimi yasak | Gemini ZDR hesabı kanıtsız; DeepSeek Çin işleme/training riski nedeniyle kurum PII kesin yasak |

Bu satırlardaki “doğrulanmalı” maddeleri imzalanmış DPA yerine geçmez. Bunlar
tamamlanana kadar ücretli kurum kabulü kapalı kalır.

## Opus denetimi kapanış karşılaştırması

| Eski bulgu | Güncel durum | Kanıt |
|---|---|---|
| Yönetici devri yok | Kapandı | Migration 145 ve manager-transfer route/testleri |
| Kurum askıya alma/arşiv yok | Canlıda kapandı | Migration 151 + PR #428; JWT-bound platform RPC, gerekçeli admin UI ve immutable event |
| `student_limit` uygulanmıyor | Kapandı | Migration 145; tenant genelinde distinct aktif öğrenci sayımı ve advisory lock |
| Kurum işlem audit'i yok | Kapandı | Migration 145 + 149 + 151 |
| Öğretmen gizlilik PG testi CI dışında | Kapandı | CI ayrı disposable PostgreSQL veritabanında suite'i çalıştırır |
| Haftalık lig cron'u kayıtlı değil | Kapandı | `vercel.json` Pazartesi 00:05 UTC tetikleyicisi |
| Migration 136 trigger grant kaçağı | Canlıda kapandı | Migration 152 forward revoke + migration 136 sonrası SECURITY DEFINER CI linteri |
| Idempotency ledger'ları süresiz | Canlıda kapandı | 30–729 gün güvenli aralık; varsayılan 90 gün; günlük service-role cron |
| Platform kurum RPC'leri service-role taşıyıcılı | Canlıda kapandı | PR #428 sonrası listeleme, provisioning, destek görünümü ve durum değişimi caller JWT ile çalışır |
| Beş eski fonksiyonda mutable `search_path` | Canlıda kapandı | Migration 153, fonksiyon OID ve trigger bağlarını değiştirmeden `pg_catalog, public` pinledi |
| PR agent review birinci tur kapanışı | Canlıda kapandı | Migration 154 + PR #428: davet audit çözümleme, arşiv tenant görünürlüğü, DSAR kapsamı, API telemetri filtresi, document boundary, grant linteri, MFA cookie aktarımı ve doğru idempotent yanıt |
| PR agent review ikinci tur kapanışı | Canlıda kapandı | Migration 155 + PR #428: RPC içi AAL2, askıya alınan tenant classroom blokajı, öğretmen/öğrenci DSAR izolasyonu, request tombstone'ları, review/exam audit alanları ve admin limiter fail-closed |
| PR agent review üçüncü tur kapanışı | Canlıda kapandı | Migration 156 + PR #428: `user_reports` genel subject katalogundan çıkarıldı; yalnız reporter-owned ve minimize edilmiş projection döner |
| Admin MFA dönüş/enrollment regresyonu | Canlıda kapandı | PR #439; `/admin/...` hedefi login→MFA→admin boyunca korunur, doğrulanmamış TOTP güvenli resetlenebilir ve kurulum üç adımda açıklanır |

Opus'un `pg_trgm` ve `unaccent` extension'larının `public` şemasında olması notu
ayrı bir bakım değişikliğidir. Extension taşıma; wrapper fonksiyonu, expression
indexleri ve arama RPC'leriyle birlikte prova edilmeden canlıda otomatik
uygulanmayacaktır. HIBP sızmış parola kontrolü de Supabase planı/hesap ayarıdır;
kod migration'ı gibi tamamlanmış sayılmaz.

Bu tablo yalnız kod/CI durumunu gösterir. Migration, merge, deploy ve canlı sorgu
kanıtı tamamlanmadan “canlıda kapandı” denmez.

### 24 Ağustos canlı şema kanıtı

- Migration 149–156 ayrı transaction'lar halinde başarıyla uygulandı ve
  `supabase_migrations.schema_migrations` ledger'ında 8/8 kayıt doğrulandı.
- `set_pilot_institution_status`: `authenticated=true`, `service_role=false`.
- `provision_pilot_institution`: `authenticated=true`, `anon=false`.
- `prune_institution_request_ledgers`: `service_role=true`, `authenticated=false`.
- `tg_require_question_validation_decision`: `anon=false`.
- `institution_operation_events_event_type_check`,
  `institution_status_changed` olayını kabul ediyor.
- Opus/Supabase Advisor'da kalan beş eski fonksiyonun tamamında
  `proconfig=["search_path=pg_catalog, public"]` ve migration 153 ledger kaydı
  canlı sorguyla doğrulandı.
- Migration 154 için `audit_teacher_classroom_request()` hiçbir browser rolüne
  açık değil; `list_pilot_institutions(uuid)` yalnız `authenticated`,
  `export_account_data(uuid)` yalnız `service_role` rolüne açık. Üç fonksiyonda
  `search_path=pg_catalog`, review düzeltme işareti ve ledger kaydı canlı sorguda
  `true` doğrulandı.
- Migration 155 için AAL2 yardımcısının `search_path=pg_catalog` olduğu ve
  `PUBLIC`/`anon`/`authenticated`/`service_role` rollerinden hiçbirine doğrudan
  açık olmadığı doğrulandı. `export_account_data` yalnız `service_role`, ledger
  prune RPC'si yalnız `service_role`; tombstone tablosu hiçbir browser veya
  service rolüne doğrudan `SELECT` vermiyor. Review hedefi ve exam-mode audit
  alanı kaynak kontrolleri `true`, migration ledger kaydı mevcut ve 149–155
  toplamı canlı sorguda 7 olarak döndü.
- Migration 156 için `export_account_data(uuid)` fonksiyonunun `user_reports`
  tablosunu genel katalog export'undan çıkardığı, yalnız `reporter_id=$1`
  satırlarını açık alan projection'ıyla döndürdüğü; tam satır, `admin_note` ve
  `resolved_by` projection'ı içermediği canlı fonksiyon kaynağında doğrulandı.
  RPC `anon=false`, `authenticated=false`, `service_role=true`, sabit
  `search_path=pg_catalog`; migration ledger kaydı mevcut ve 149–156 toplamı
  canlı sorguda 8 olarak döndü.

## Yedek ve geri dönüş tatbikatı

- 25 Ağustos 00:49'da güncel üretim mantıksal yedeği bildirim kapalı ve salt-okuma
  alınarak `gzip -t` ile doğrulandı: 24.659.983 bayt, 175 tablo, 36 saniye.
- Yedek `supabase/postgres:17.6.1.136` imajında, ağsız tek kullanımlık konteynere
  restore edildi. Başlangıç 20, SQL restore 24, migration doğrulaması 3; toplam
  ölçülen DB kurtarma süresi **47 saniye**.
- 133 public tablo, 410 auth kullanıcısı/profil, 4.473 soru, 2 pilot kurum,
  migration 146–156 için 11/11 kayıt ve altı zorunlu extension doğrulandı.
  JWT-bound kurum RPC'si ve service-role-only DSAR ACL kontrolleri geçti.
- `/etc/cron.d/bilge-arena-backup` günlük 02:00 çalışıyor; gözlenen DB RPO
  penceresi yaklaşık en fazla 24 saattir. 24 Ağustos yedeğinin aynı gün eklenen
  worker kimliğini taşımaması bu veri kaybı penceresini somut olarak gösterdi.
- [Ayrıntılı kanıt](./institution-restore-drill-2026-08-25.md) tam uygulama,
  DNS, Auth/Storage/Realtime secret ve kullanıcı kabul cutover'ını kapsamaz;
  47 saniye yalnız ölçülmüş veritabanı restore RTO'sudur.
