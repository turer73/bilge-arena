# Yedekleme bağlantı bilgisinin süreç argümanında görünmesi — 2026-08-25

## Sınıflandırma

Durum: **teknik olarak çevrelendi; parola rotasyonu bekliyor**.

Kurumsal restore tatbikatı sırasında eski VPS yedekleme komutunun Supabase
veritabanı bağlantı URI'sini host süreç argümanında tuttuğu görüldü. Bu, aynı
hostta yeterli süreç-görüntüleme yetkisine sahip bir aktörün URI'yi ve parolayı
görebilmesi anlamına gelir. Bu belge bağlantı bilgisini içermez ve yeniden
üretmez.

Yetkisiz harici erişim, veri indirme veya kişisel veri aktarımı olduğuna dair
kanıt bulunmadı. Bu teknik gözlem, KVKK kapsamındaki nihai ihlal/bildirim kararının
yerine geçmez; veri sorumlusu ve hukukçu log/erişim kapsamını ayrıca değerlendirir.

## Uygulanan çevreleme

- Tanı sırasında başlatılmış eski komut sonlandırıldı; kalan süreç/konteyner
  olmadığı doğrulandı.
- Canlı `/opt/backup/bilge-arena/bilge-arena-backup.sh` düzeltildi. URI artık
  komut argümanına veya Docker environment metadata'sına verilmez; `0600`
  geçici dosya konteynere salt-okunur bağlanır, URI konteyner içinde ayrıştırılır
  ve parola [libpq password-file](https://www.postgresql.org/docs/17/libpq-pgpass.html)
  mekanizmasıyla sağlanır. `pg_dump` argv'sinde yalnız gizli olmayan host, port,
  kullanıcı ve veritabanı alanları bulunur; `--no-password` etkindir.
- URI query'sindeki güçlü TLS modları (`require`, `verify-ca`, `verify-full`),
  `sslrootcert=system`, channel binding, connect timeout ve target-session
  koşulları açık allowlist ile libpq ortamına aktarılır. Daha zayıf veya
  desteklenmeyen seçenek sessizce düşürülmez; yedek fail-closed kapanır.
- Betik çıkışında geçici dump ve secret dosyası trap ile silinir. Tatbikat sonunda
  eşleşen secret geçici dosyası sayısı sıfırdı.
- Önceki betik geri dönüş kanıtı için tutuldu fakat modu `0600` yapılarak çalıştırma
  yetkisi kaldırıldı.
- Yeni betikle bildirim kapalı manuel yedek ve ACL korumalı restore başarıyla
  tamamlandı; günlük 02:00 cron yolu aktif betiğe işaret ediyor.

## Kalan zorunlu adım

Supabase veritabanı parolası proje sahibi tarafından panelden döndürülmeli;
ardından VPS'teki `/opt/backup/bilge-arena/.env` yeni bağlantı bilgisiyle güvenli
biçimde güncellenmeli ve bildirim kapalı backup + restore smoke yeniden geçmelidir.
Bu çalışma oturumunda Supabase paneli giriş istediği ve CLI access token mevcut
olmadığı için rotasyon yetkili hesap sahibi olmadan yapılamadı.

Rotasyon ve tekrar tatbikatı tamamlanana kadar olay “tam kapalı” sayılmaz; ücretli
kurum onboarding'i kapalı kalır.
