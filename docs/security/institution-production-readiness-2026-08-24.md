# Kurumsal üretim güvenliği kanıt kaydı — 2026-08-24

Bu belge pazarlama beyanı değildir. Kodla kapanan kontrolleri, canlı kanıtı ve
insan/tedarikçi kararı bekleyen kapıları birbirinden ayırır.

## Zorunlu release kapıları

| Kapı | Durum | Kanıt / reddetme koşulu |
|---|---|---|
| Ücretli kurum onboarding | Kapalı | `INSTITUTION_ONBOARDING_ENABLED=false`; açık değilse route 503 |
| Hassas yüzey telemetrisi | Kodda tamam | `/admin`, `/arena/kurum`, `/arena/sinif`, MFA sayfasında reklam, GA, Plausible ve Sentry event yok; replay global 0 |
| Dağıtık rate limit | Canlı config + kodda tamam | Production'da Upstash ve KV env adları mevcut; eksik/erişilemez backend 503/fail-closed |
| Personel AAL2 | Kodda tamam | TOTP enrollment/challenge; admin/kurum/öğretmen izin ve proxy katmanında AAL2 |
| Tenant audit | Kodda tamam | Migration 145 + 149; kritik kurum/sınıf işlemleri immutable event |
| JWT-bound RPC | Migration/deploy sırası bekliyor | Migration 150 önce uygulanmalı; sonra route context kullanıcı JWT'siyle çağırır. `auth.uid()` bağlaması olmayan fonksiyonda migration durur |
| DSAR export | Kodda tamam | Kimliği doğrulanmış `/api/account/export`; no-store JSON; production rate limit |
| Otomatik imha | Bloke | Onaylı saklama matrisi ve güncel tüm FK'leri kapsayan deletion job yok. Onaylanmadan 30 gün garantisi verilmez |
| Tenant A/B gerçek oturum | Bloke | İki ayrı yetkili test hesabı ve izole test tenant'ı tahsis edilmedi |
| Gerçek kurum canary | Bloke | Kurum, DPA/aydınlatma onayı ve sorumlu kişi seçilmedi |

## ASVS odaklı tehdit modeli

| Tehdit | Kontrol | Test kapısı |
|---|---|---|
| BOLA / tenantlar arası okuma | RPC içinde membership + tenant kontrolü, `auth.uid()` aktör bağı | Tenant A'nın tüm ref/UUID'leri Tenant B oturumunda 403/404; veri alanı dönmez |
| Çalınmış personel oturumu | AAL2 + kısa süreli TOTP doğrulaması | AAL1 ile sayfa redirect, API 428 `aal2_required` |
| Service-role ile kimlik taklidi | Kurum/sınıf RPC'lerinde kullanıcı JWT'si | Route context service-role client oluşturmamalı; migration allowlist dışını grant etmemeli |
| Rate-limit backend kesintisi | Production fail-closed | Redis yok/timeout: ayrı instance belleğine düşmeden 503 |
| Personel ekranından veri sızıntısı | Üçüncü taraf script/event/replay yasağı | Hassas rota HTML/DOM/network'te GA, Plausible, AdSense ve replay bulunmamalı |
| İnkâr edilebilir yönetim işlemi | Immutable tenant audit | UPDATE/DELETE reddi; request replay tek event |
| Fazla veri içeren export | Yalnız oturum sahibine service-side derleme, no-store | Başka user id parametresi yok; response cache edilemez |

## Alt işleyen ve yurt dışı aktarım envanteri

| Hizmet | Amaç / veri | Kurum yüzeyi politikası | DPA / bölge durumu |
|---|---|---|---|
| Supabase | Kimlik, PostgreSQL, Storage | Zorunlu ana işleyen | Sözleşme ve proje bölgesi hukukçu/owner doğrulamalı |
| Vercel (`fra1`) | Uygulama çalıştırma, edge log | Zorunlu barındırma | DPA ve alt işleyen listesi doğrulanmalı |
| Upstash / Vercel KV | Pseudonymous rate-limit anahtarı | Zorunlu güvenlik kontrolü | Bölge ve DPA doğrulanmalı |
| Sentry | Hata/trace | Hassas yüzeylerde event kapalı; replay tamamen kapalı | DPA, retention ve region doğrulanmalı |
| Panola/Plausible (self-hosted) | Kamusal ürün analitiği | Kurum/sınıf/admin yüzeyinde yasak | VPS lokasyonu ve erişim sorumluları kayda alınmalı |
| Google Analytics / AdSense | Kamusal analitik/reklam | Kurum/sınıf/admin yüzeyinde yasak | Kurumsal veri gönderilmez |
| Resend | İşlemsel e-posta | Davet içeriği ve alıcı minimizasyonu gerekir | DPA/region doğrulanmalı |
| Google/DeepSeek AI | Soru/içerik üretimi | Öğrenci/personel PII gönderimi yasak | DPA ve model-retention kararı olmadan kurum verisi gönderilmez |

Bu satırlardaki “doğrulanmalı” maddeleri imzalanmış DPA yerine geçmez. Bunlar
tamamlanana kadar ücretli kurum kabulü kapalı kalır.

## Yedek ve geri dönüş tatbikatı

- Canlı hostta 2026-08-24 02:00 tarihli `latest.sql.gz` bulundu; boyut
  24,450,010 bayt ve `gzip -t` başarılıydı. Günlük üretim mevcutsa gözlenen
  yedekleme aralığına göre teknik RPO üst sınırı yaklaşık 24 saattir.
- Tam dump'ın ayrı PostgreSQL'e restore denemesi iki taşınabilirlik açığı buldu:
  hedef sürüm `transaction_timeout` ayarını ve `supabase_vault` extension'ını
  tanımıyor. Bu nedenle ölçülmüş RTO henüz yoktur.
- Geçici `bilge_restore_drill_20260824` veritabanı ve geçici dump dosyası her
  denemeden sonra silindi; canlı kaynak veritabanında yazma yapılmadı.
- Kapanış ölçütü: Supabase uyumlu restore image, aynı extension seti, tam restore,
  migration ve temel tablo sayımları; süre kaydı. Bu kanıt olmadan “restore hazır”
  veya RTO garantisi verilemez.
