# Resmî TYT Sosyal keşfi — kapsam düzeltmesi ve kalan yayın kapıları

## Kullanıcı kararı

6 Ekim 2026: dört alanlı genel pilot yerine **resmî TYT Sosyal** seçildi.
Tarih 5, coğrafya 5, ortak felsefe 5; kayıtlı cevaplama düzenine göre
Din Kültürü 5 **veya** ilave felsefe 5. Seçim nedeni/inanç kaydedilmez.
Sosyoloji bu kapsamda değildir. İlave felsefe, sosyolojiyle doldurulmaz.

Dayanak: [ÖSYM 2026 YKS Kılavuzu](https://dokuman.osym.gov.tr/pdfdokuman/2026/YKS/basvuru_kilavuz06022026.pdf),
Tablo 1A, PDF s.50 / basılı s.46. Bu dayanak 2027 yayını sayılmaz.
Mevcut politika `tyt-social-2026-v1`, geçerlilik sonu 2027-01-01 (hariç).

## Bu değişiklik ne yapar?

- 221: `tyt_social_exam_role_compatible` sosyolojiyi her iki felsefe rolünden
  çıkarır. Mevcut hazırlama, kabul, seçim ve snapshot kontrolleri aynı yordamı
  kullanır; paralel rol sistemi oluşturulmaz.
- Yayınlanmış kapsam veya geçmiş sosyoloji rol kaydı varsa migration durur.
  Eski kararlar sessizce yeniden yorumlanmaz.
- İstemci kategori sözleşmesi ve hâkimiyet okuyucusu aynı sınırı uygular.
- Resmî bölüm adaptörü 20 benzersiz soru yanında **sıralı 5/5/5/5 kategori**,
  politika sürümü ve her soruda beş seçenek arar. Hatalı/karışmış snapshot
  kullanıcıya aktarılmaz. SQL rol onayı kontrolü bununla ikame edilmez.
- Yönetici kuyruğunda sosyoloji görünür kalır fakat hatalı TYT rolü önerilmez.
- Dört alanlı pilotun verileri, RPC'leri ve izinleri değişmez. O pilot resmî
  TYT değildir; mevcut tarihsel raporları resmî kapsama onay olarak taşınamaz.

## Canlı salt-okunur başlangıç tespiti

| Kategori | TYT etiketli toplam | Aktif |
| --- | ---: | ---: |
| Tarih | 339 | 338 |
| Coğrafya | 359 | 358 |
| Felsefe | 322 | 322 |
| Sosyoloji (resmî TYT dışı) | 298 | 298 |
| Din Kültürü | 0 | 0 |

Sınav rolü kabulü beş rolün tamamında **0**. Kapsam `validating`,
`diagnostic_enabled=false`; dört alanlı pilot paketi **0**.
Kaynak/yayın kapısı açık tutuluyor (`question-quality@2`).

## Gerçek tamamlanma için kalanlar

1. **İçerik:** en az 5 Din Kültürü sorusu ve ortak/ilave felsefe için birbirinden
   ayrı beşerli gruplar hazırlanmalı. İki varyantı destekleyen asgari rol havuzu
   25 benzersiz sorudur; bu sayı tek başına yayın yeterliliği değildir.
2. **Sınıflama:** 298 mevcut sosyoloji kaydı kendiliğinden AYT'ye taşınmaz veya
   silinmez. Doğru sınav/kazanım için ayrı revizyonla incelenir.
3. **Kapı uyumu:** 191'in kaynak kapsamı hâlâ beş kategoriyi ve tüm aktif
   TYT etiketli bankanın kabulünü ister; 205 rol bütünlüğü de tüm aktif bankayı
   sayar. Bu düzeltme o güvenlik politikasını gevşetmez. Eski kayıtların
   sınıflaması/kabulleri tamamlanmalı veya yalnız incelemeli bir alt havuzu
   yayımlamak için ayrı, sürümlü ve test edilmiş kapsam politikası hazırlanmalı.
   **25 soru hazırlamak mevcut global kapıyı otomatik açmaz.**
4. **Yetkili kayıtlar:** her kullanılacak revizyonda kaynak/kullanım beyanı,
   kaynak-kazanım kabulü, gereken içerik ve rol onayları, normal writer üzerinden
   kalite kararı bulunmalı. Model raporu, kullanıcı isteği veya dosya hash'i
   bu kayıtların yerine yazılamaz. Pilot 5/LGS özgün üretim beyanı Sosyal'e
   genişletilmez.
5. **Ürün entegrasyonu:** mevcut resmî bölüm `deneme`/verified-attempt yoludur;
   216'nın 12 soruluk genel pilotu değildir. Resmî keşif için bu yolun keşif
   sonuçları/kalıcı seviye ayrımı ve imzalı öğrenci akışı ayrıca doğrulanmalı.
   `diagnostic_enabled` bayrağını açmak bunu gerçekleştirmez.

## Doğrulama sınırı

Yeni PostgreSQL testi gerçek 221'i, 205'teki gerçek eski rol yordamından
başlayarak **dar ve tek kullanımlık** şemada uygular. Beş rol/kategori eşleşmesi,
NULL ve sosyoloji reddi, idempotency, geçmiş kayıt ve yayın koruması, soruların
ve ayrı pilot izninin değişmemesi sınanır. Tam migration zinciri provası değildir.
CI bu testi yeni loopback cluster üzerinde çalıştırır; üretim URL'si kabul edilmez.

Bu paket kapsam hatası düzeltmesidir; resmî keşfin açıldığına, 24 kaynak raporunun
kabul edildiğine veya yeni soru yayımlandığına dair bir beyan değildir.
