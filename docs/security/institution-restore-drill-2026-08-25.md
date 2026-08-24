# Kurumsal yedek ve geri-yükleme tatbikatı — 2026-08-25

Bu kayıt, üretim PostgreSQL veritabanına yazmadan alınan mantıksal yedeğin
ayrı ve ağ erişimi olmayan bir Supabase PostgreSQL konteynerinde gerçekten
açılabildiğini gösterir. Sonuç tam uygulama/servis cutover RTO garantisi değil;
veritabanı kurtarma aşamasının ölçümüdür.

## Nihai sonuç

| Ölçüm | Sonuç |
|---|---:|
| Yedek zamanı | 2026-08-25 01:23 Europe/Istanbul |
| Yedek oluşturma | 45 saniye |
| Sıkıştırılmış dump | 24.672.285 bayt; `gzip -t` başarılı |
| Restore image | `supabase/postgres:17.6.1.136` |
| Postgres başlangıcı | 27 saniye |
| SQL restore | 30 saniye |
| Dinamik migration doğrulaması | 20 saniye |
| Ölçülen DB kurtarma süresi | **77 saniye** |

Konteyner `--network none` ile çalıştırıldı; dump ve migration dizini
salt-okunur bağlandı. Tatbikat bitince konteyner ve volume otomatik silindi.
Canlı kaynak yalnız `pg_dump` tarafından okundu.

## Semantik doğrulama

Nihai çalıştırma aşağıdaki sonuçların tamamını verdi:

- PostgreSQL `17.6`, 133 `public` tablosu;
- 410 `auth.users`, 410 `profiles`, 4.473 soru, 2 pilot kurum;
- migration 146–156 için 11/11 kayıt; 0 yeni uygulama, 11 skip;
- `get_my_pilot_institution(uuid)` authenticated rolüne açık, anon rolüne kapalı;
- `export_account_data(uuid)` yalnız `service_role` rolüne açık;
- request tombstone tablosu mevcut;
- `pg_stat_statements`, `pg_trgm`, `pgcrypto`, `supabase_vault`, `unaccent` ve
  `uuid-ossp` extension'larının tamamı mevcut.

Restore betiği bu güvenlik sözleşmelerinden biri yanlışsa veya kritik kullanıcı,
profil, soru ya da kurum agregalarından biri boşsa artık `status=failed` ve
`reason=security_contract_validation` ile kapanır; yalnız SQL'in/şemanın açılması
başarı sayılmaz.

Migration ileri-sarım listesi 156'da sabitlenmez. Betik migration dizinindeki
146 ve üzeri tüm sayısal sürümleri version-sort ile keşfeder, yinelenen sürümü
reddeder, eksik olanı uygular ve her güncel dosyanın ledger kaydını yeniden
doğrular. Böylece daha yeni bir migration eklendiğinde eski snapshot sessizce
başarılı sayılamaz.

## Tatbikatta bulunan ve kapatılan kusurlar

1. 24 Ağustos 02:00 yedeği, aynı gün sonra uygulanan migration 149–156'yı ve
   migration 148'in ihtiyaç duyduğu worker kimliğini içermiyordu. Bu, günlük
   yedeğin 24 saate kadar veri/değişiklik kaybı penceresini gerçek olarak
   gösterdi; eski snapshot koddan tek başına güncel kimliği üretemez.
2. Eski betikteki `--no-acl`, tablo/veriyi geri getiriyor fakat RPC grant/revoke
   sınırlarını kaybediyordu. Seçenek kaldırıldı; ACL artık yedeğin güvenlik
   sözleşmesinin parçası.
3. Çıplak Supabase Postgres imajında hosted Realtime servisinin oluşturduğu
   `supabase_realtime_admin` rolü yoktu. Restore betiği yalnız bu denetlenmiş
   platform rolünü `NOLOGIN` olarak önceden oluşturuyor. Gerçek cutover'da servis
   parolası dump'tan değil, ayrı secret yönetiminden sağlanmalıdır.
4. Eski yedekleme komutu veritabanı URI'sini host süreç argümanına koyuyordu.
   Canlı betik salt-okunur `0600` geçici secret mount'una geçirildi; geçici dosya
   sayısı ve kalan restore konteyneri tatbikat sonunda sıfır doğrulandı. Ayrıntı
   [olay kaydında](./2026-08-25-backup-credential-process-exposure.md).

## RPO ve RTO kararı

- `/etc/cron.d/bilge-arena-backup` her gün 02:00 Europe/Istanbul çalışıyor;
  21–24 Ağustos günlük dosyaları ve 25 Ağustos manuel kurtarma noktası görüldü.
- Buna göre **ölçülen/kanıtlanan DB RPO penceresi en fazla yaklaşık 24 saattir**.
  Bu sıfır veri kaybı taahhüdü değildir; daha düşük hedef için WAL/PITR veya daha
  sık doğrulanmış yedek gerekir.
- İzole DB restore aşaması için ölçülen **RTO 77 saniyedir**. DNS, Vercel,
  Supabase Auth/Storage/Realtime secret'ları, uygulama smoke ve kullanıcı kabulü
  dahil tam servis RTO'su henüz ölçülmemiştir.

## Tekrarlama

Repo betiği:
`scripts/security/run-supabase-restore-drill.sh DUMP_PATH MIGRATIONS_DIR`

Canlı günlük yedek betiği bildirim üretmeden manuel doğrulanacaksa yalnız yetkili
operatör `BILGE_BACKUP_DISABLE_NOTIFY=true` ile çalıştırır. Normal cron akışında
başarı/hata bildirimi korunur.
