# Bilge Arena Kurumsal — Pilot Temel Dilimi

**Tarih:** 2026-08-13
**Durum:** Yerel uygulama ve statik kabul kapıları ilerliyor. Canlı migration, pilot ve deploy yapılmış sayılmaz.

## Amaç

İlk ücretli pilot için tek kurum/tek şube tenant sınırını kurmak ve mevcut öğretmen sınıfı akışını zorunlu kurum üyeliğine bağlamak.

## Bu dilimde yapılacaklar

- `pilot_institutions`: kurum kaydı, durum ve sabit pilot kapasitesi.
- `pilot_institution_memberships`: bir yönetici ve en fazla beş öğretmen için tenant üyeliği.
- Platform yöneticisinin ilk kurumu ve kurum yöneticisini güvenli/idempotent biçimde provision etmesi.
- Kurum yöneticisinin öğretmen ekleyip çıkarabilmesi.
- Her öğretmen sınıfının zorunlu `institution_id` taşıması.
- Mevcut sınıf RPC'lerinin hem genel öğretmen iznini hem aktif kurum üyeliğini doğrulaması.
- Kullanıcının yalnız kendi aktif kurum çalışma alanı özetini okuyabildiği dar API.
- RLS, doğrudan tablo DML yasağı, service-role-only RPC ve statik/gerçek PostgreSQL testleri.

## Bilinçli sınırlar

- Tek kullanıcı aynı anda yalnız bir pilot kurumda personel olabilir.
- İlk provision edilen kişi tek kurum yöneticisidir; yönetici yalnız öğretmen ekleyebilir.
- Öğrenciler kurum personeli tablosuna alınmaz; kurum bağı sınıf üyeliklerinden türetilir.
- Öğrenci CSV aktarımı, marka ayarları, yönetici analitiği, kampanya/turnuva ve çok şube bu dilimde yoktur.
- Kurum provision işlemi son kullanıcı arayüzüne açılmaz; kontrollü iç operasyon olarak kalır.

## Güvenlik değişmezleri

1. Genel `teacher_pilot` rolü tek başına sınıf erişimi vermez.
2. Aktif ve `pilot|active` durumundaki kurum üyeliği olmadan öğretmen RPC'leri kapalıdır.
3. Bir sınıf oluşturulduğu anda öğretmenin aktif kurumuna atomik olarak bağlanır.
4. Kurumdan çıkarılan öğretmenin bütün öğretmen RPC erişimi aynı anda kesilir.
5. Kurum yöneticisi başka kurumun üyeliğini okuyamaz veya değiştiremez.
6. Ham e-posta, telefon veya öğrenci cevap ayrıntısı kurum çalışma alanı yanıtına girmez.
7. Provision ve personel değişiklikleri owner/payload bağlı idempotency anahtarıyla çalışır.

## Kabul kapısı

- Migration lint ve statik sözleşme testleri temiz.
- Disposable PostgreSQL testinde çapraz-tenant erişim, kapasite, replay ve çıkarma senaryoları geçer.
- API sözleşme/route testleri ve type-check geçer.
- `git diff --check` temizdir.
- Bu kapılar geçse bile canlı migration ve yetkili kullanıcı smoke yapılmadan “pilot hazır” denmez.

## 2026-08-13 doğrulama durumu

Tamamlanan yerel kapılar:

- Institution API, route-context ve sözleşme testleri: 4 dosya / 13 test geçti.
- Öğretmen sınıfı + Institution hedefli regresyonu: 15 dosya / 50 test geçti.
- Migration 112 statik sözleşmesi: 7 test geçti.
- Migration lint: 115 migration tarandı, yeni ihlal yok.
- TypeScript kontrolü ve hedefli ESLint temiz.
- Next.js production build tamamlandı; Institution API rotaları build çıktısında yer aldı.
- Personel yazma uçları dar yazma rate limiter'ına bağlandı.
- Üyelikten çıkarma yalnız kuruma ait erişim rolünü geri alıyor; bağımsız verilmiş genel öğretmen rolünü silmiyor. Aktif tenant üyeliği kalktığı için öğretmen RPC erişimi yine anında kesiliyor.

Kalan yerel kabul kapısı:

- Gerçek PostgreSQL kabul paketi, yalnız `INSTITUTION_PILOT_TEST_DATABASE_URL` ile açıkça disposable bir veritabanı sağlandığında çalışır. Bu oturumda böyle bir veritabanı bulunmadığı için 6 test güvenli biçimde atlandı; geçmiş sayılmaz.

Henüz yapılmayan dış kapılar:

- Migration 112 production'a uygulanmadı.
- Feature flag açılmadı.
- Yetkili kurum yöneticisi/öğretmen ile production smoke yapılmadı.
- PR, CI ve deploy kanıtı oluşmadı.
