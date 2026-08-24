# Kurumsal saklama ve imha karar kaydı — 2026-08-25

Bu belge otomatik silme süresi **uydurmaz**. Mevcut teknik davranışı ve hukuk
tarafından doldurulması gereken karar alanlarını ayırır. Onaysız bir süre,
production cron'una dönüştürülemez.

## Mevcut teknik gerçeklik

| Veri sınıfı | Bugünkü davranış | Teknik durum | Kapanış kararı |
|---|---|---|---|
| Profil ve hesap | `/api/account/delete`, `soft_delete_user` ile profili hemen anonimleştirir; hard-delete fonksiyonu 30 gün eşiği içerir | Hard-delete otomatik planlı değil ve `auth.users` silme işlemi Admin API gerektiriyor | Hukuk süresi + eksiksiz FK/Alt işleyen silme akışı onaylanmalı |
| Kurum üyeliği, sınıf ve öğrenci çalışmaları | Yetki sonlandırma/withdraw/archive erişimi keser; genel otomatik fiziksel imha yok | **Kısmi** | Sözleşme sonu, itiraz ve yasal yükümlülük süreleri belirlenmeli |
| Kurum işlem audit'i | Immutable event; UPDATE/DELETE reddedilir | Hesap verebilirlik güçlü, süre sınırı yok | Audit saklama süresi ve legal-hold istisnası belirlenmeli |
| Idempotency request ledger'ı | Günlük cron, varsayılan 90 gün; 30 gün altı ve 2 yıl üstü cutoff reddedilir | **Otomatik** | 90 günün hukuk/iş ihtiyacına uygunluğu onaylanmalı |
| Request tombstone | Kullanıcı UUID + request UUID'den tek yönlü MD5 anahtar; kaynak ve prune zamanı kalır | Replay'i önlemek için süre sınırı yok | Pseudonymous kaydın saklama süresi/risk kabulü onaylanmalı |
| DSAR export | Kimliği doğrulanmış hesap sahibine no-store JSON; doğrudan subject alanları ve iki ilişkili tablo | **Canlı teknik kapsam mevcut** | Veri kategorisi/alt işleyen export kapsamı hukukça doğrulanmalı |
| Uygulama/hata/analitik logları | Kurumsal hassas yüzeylerde üçüncü taraf event/replay kapalı | Sağlayıcı hesap retention'ları doğrulanmadı | Vercel, Sentry, VPS ve e-posta log süreleri yazılmalı |
| Yedekler | Günlük logical dump; 25 Ağustos tatbikatında güncel dump doğrulandı | Yedek kopyalarının toplam saklama süresi bu repoda kanıtlı değil | Günlük/haftalık/off-site imha takvimi ve legal hold belirlenmeli |
| AI prompt/output | Kodda üretim anahtarları var | Kurum PII yasağı politika düzeyinde; sağlayıcı hesap ayarı kanıtsız | PII sınıflandırıcı/gateway gereksinimi ve izinli use-case listesi onaylanmalı |

## Hukuk karar formu

Aşağıdaki her satır için boş alanlar doldurulup imzalanmadan genel retention
migration'ı yazılmaz.

| Alan | Zorunlu karar |
|---|---|
| Veri kategorisi ve tablo listesi |  |
| İşleme amacı ve hukuki sebep |  |
| Aktif kullanım süresi |  |
| Sözleşme/üyelik sonrası bekletme süresi |  |
| İmha yöntemi: silme, anonimleştirme veya agregasyon |  |
| Legal hold / uyuşmazlık istisnası |  |
| Yedeklerden düşme üst sınırı |  |
| Alt işleyenlere silme bildirimi |  |
| Onaylayan veri sorumlusu/hukukçu ve tarih |  |
| Teknik owner ve ilk production dry-run tarihi |  |

## Teknik uygulama sırası

1. Onaylı matrisi tablo ve FK bağımlılıklarına dönüştür.
2. Önce yalnız sayım yapan dry-run RPC/raporu çalıştır.
3. Tenant ve kullanıcı bazında export/reconciliation kanıtı al.
4. Silme veya anonimleştirmeyi küçük batch, lock timeout ve audit sonucu ile yap.
5. Alt işleyen silme taleplerini ve yedek expiry tarihini kaydet.
6. İlk üç production çalıştırmasını insan onaylı tut; sonra cron düşün.

Bu karar tamamlanana kadar mevcut 90 günlük ledger kontrolü korunur; genel veri
imhası otomatikleştirilmez.
