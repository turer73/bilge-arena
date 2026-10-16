# Yedekleme bağlantı bilgisinin süreç argümanında görünmesi — 2026-08-25

## Sınıflandırma

Durum: **kapandı (2026-10-16): parola döndürüldü, yedek yeni bilgiyle geçti, rotasyon sonrası geri yükleme tatbikatı geçti**. Ayrıntı: aşağıdaki kapanış notu. Ücretli kurum onboarding'inin açılması veri sorumlusunun kararıdır.

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

## Kalan zorunlu adım (2026-08-25 itibarıyla — durum için kapanış notuna bakın)

Supabase veritabanı parolası proje sahibi tarafından panelden döndürülmeli;
ardından VPS'teki `/opt/backup/bilge-arena/.env` yeni bağlantı bilgisiyle güvenli
biçimde güncellenmeli ve bildirim kapalı backup + restore smoke yeniden geçmelidir.
Bu çalışma oturumunda Supabase paneli giriş istediği ve CLI access token mevcut
olmadığı için rotasyon yetkili hesap sahibi olmadan yapılamadı.

Rotasyon ve tekrar tatbikatı tamamlanana kadar olay “tam kapalı” sayılmaz; ücretli
kurum onboarding'i kapalı kalır.

## Kapanış notu — 2026-10-16

Bu not bağlantı bilgisini ve parolayı içermez. Kaynak: Klipper görev kaydı #3206 ve
VPS'teki `bilge-arena-backup.service` günlüğü (Klipper tarafından 2026-10-16'da
salt-okuma doğrulandı).

**Rotasyon tamamlandı.**

- Proje sahibi Supabase veritabanı parolasını panelden sıfırladı (2026-10-16).
  Eski parolanın artık reddedildiği doğrulandı.
- Tetikleyici: aynı gün bir migration uygulamasında `docker --env-file` tırnaklı
  bir değeri bozdu. Ardından gelen `psql` hatası, 2026-08-25'ten beri rotasyon
  bekleyen yedek parolasını bir çalışma oturumunun çıktısına bastı. Parola
  döndürüldüğü için o çıktıdaki değer artık geçersizdir.
- VPS'teki `/opt/backup/bilge-arena/.env`, sır içermeyen
  `/root/rotate-bilge-supabase-credential.sh` ile güncellendi:
  - yeni değer TTY'den gizli okunur ve URL-encode edilir;
  - yeni bağlantı başarıyla sınanmadan dosya değiştirilmez;
  - hata sınıfı ham çıktı basılmadan bildirilir.
- İlk iki deneme dosyayı değiştirmeden durdu: biri boş giriş, diğeri bağlantı
  hatası (sıfırlama henüz yayılmamış ya da değer yanlış yapıştırılmıştı).
  Üçüncü deneme başarılı oldu.
- Bu bağlantı bilgisini kullanan başka tüketici bulunmadı. VPS, Klipper ve yerel
  `.env` dosyaları tarandı.

**Yedek yeni bilgiyle geçti.**

- `bilge-arena-backup.service` 2026-10-16 22:07–22:08 arasında başarılı çalıştı.
- Çıktı: `/opt/backup/data/2026-10-16/bilge-arena.sql.gz`, 33 MB, 244.431 satır,
  224 tablo.
- Gzip bütünlük kontrolü geçti. `latest` bağlantısı yeni dosyayı gösteriyor.

- Not: bu yedek koşusu normal servis olarak elle başlatıldı; bildirim
  kapatılmadı. Başarı bildirimi Telegram'a gitmiş olabilir.

**Geri yükleme tatbikatı geçti (2026-10-16).**

- Kaynak döküm: `/opt/backup/data/2026-10-16/bilge-arena.sql.gz`, sha256
  `429d03f580914f71a409896152ec8a4ed448de895681877b7315d90cb781b290`.
- Yöntem: 2026-09-19 tatbikat betiğinin yalıtımı korundu.
  - Betik: `/root/bilge-vps-hardening/20261016-restore-smoke/run-restore-smoke.sh`.
  - Sabitlenmiş Supabase Postgres imajı (17.6).
  - Ağsız konteyner (`--network none`), açık port yok.
  - Döküm salt okunur bağlandı; parola rastgele üretildi.
  - Geri yükleme tek transaction'da, `ON_ERROR_STOP` ile yapıldı.
  - Tatbikatın bildirim yolu yok.
- Sonuç: geri yükleme 10 saniyede hatasız tamamlandı.
  - Dökümdeki 224 tablonun tamamı geri geldi.
  - Tablo başına satır sayısı dökümdeki COPY bloklarıyla birebir aynı: toplam
    189.983 satır, uyuşmayan tablo 0.
  - Geri yüklenen veritabanında dökümde bulunmayan, 0 satırlı bir tablo daha var.
    İmajın uzantı kurulumundan geldiği değerlendirildi; veri kaybı göstergesi
    değildir.
  - Ayrıca: `public` şemasında 180 tablo, `questions` 4.478 satır. Migration
    defterinde aynı günün `20261016190000` kaydı mevcut; döküm rotasyondan ve
    o migration'dan sonra alınmış.
- Gizlilik: hiçbir veri satırı yazdırılmadı; yalnız tablo adları ve sayılar
  karşılaştırıldı.
- Temizlik:
  - Konteyner volume'leriyle birlikte silindi.
  - Geçici sayım dosyaları silindi.
  - Kalan tatbikat konteyneri ve askıda volume sayısı 0.
  - Dizinde yalnız betik ve özet günlükler kaldı.
- Not: ilk koşuda geri yükleme geçti, ancak karşılaştırma adımındaki bir kalıp
  hatası döküm tarafının sayımını boş bıraktı ve koşu "count_mismatch" ile
  düştü. Hata düzeltildi, tatbikat baştan koşuldu. Yukarıdaki sonuçlar ikinci
  koşuya aittir.

Belgenin kendi ölçütüne göre olay kapalıdır:
- parola döndürüldü,
- yedek yeni bağlantı bilgisiyle geçti,
- rotasyon sonrası geri yükleme tatbikatı geçti.

Ücretli kurum onboarding'inin açılması, KVKK kapsamındaki nihai değerlendirmeyle
birlikte veri sorumlusunun kararıdır.
