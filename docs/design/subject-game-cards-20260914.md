# Ders oyunları — görsel oyun kartları

> Bu belge ilk büyük/simgeli tasarımın tarihsel kaydıdır. Son kullanıcı isteğiyle yerini [küçük, büyülü ve illüstrasyonlu ikinci tasarıma](subject-magic-cards-20260914.md) bıraktı.

14 Eylül 2026. Kullanıcının dört ders için daha canlı, hareketli buton tasarımı isteği üzerine yerel masaüstü/tablet düzenlemesi.

## Tasarım

- Mevcut ders renkleri katalogdan alınır: Matematik mavi, Türkçe amber, Fen yeşil, Sosyal mor. YDT seçildiğinde İngilizce aynı tasarım dilini kullanır.
- Kabartmalı büyük simge, dersle ilişkili dekoratif işaretler, renkli kenar/alt gölge, sınav kapsamı etiketi ve belirgin “Turunu kur” eylemi.
- Masaüstünde dört ders yan yana; 768–1050px arasında iki sütun. Tek dersli YDT görünümü gereksiz yere tam sayfa genişliğine uzatılmaz.
- Kartlar hâlâ doğal bağlantılardır; içlerine ikinci bir buton eklenmedi. Erişilebilir isim ders, seçili sınav ve eylemi içerir. Dekoratif simgeler/işaretler ekran okuyucudan gizlidir.
- Etkileşim hareketleri CSS ile yapılır; yeni resim, bağımlılık, JS animasyon zamanlayıcısı veya arka plan isteği yoktur.
- Fare üzerinde kart yaklaşık 5px yükselir; simge ve işaretler küçük hareketlerle tepki verir, tek kısa ışık geçişi oynar. Klavye odağında 3px görünür odak ve kısa simge tepkisi vardır. Basma durumunda küçük çökme/ölçek tepkisi tanımlıdır.
- Sürekli yanıp sönme ve sonsuz animasyon yoktur. `prefers-reduced-motion: reduce` ile hareket, geçiş ve sözde öğe animasyonları kapanır; odak işareti korunur.
- Renk geçişleri mevcut `--app-*` tema yüzeylerinden türetilir; tema veya arka plan tercihi değiştirilmez.

## Korunan davranışlar

Ders listesi, sınav filtreleri, profilin LGS/YKS kapsamı, mevcut soru hazırlığı bağlantıları ve WordQuest görünürlüğü aynı kaynaktan gelir. Yeni oyun türü veya kuralı eklenmedi. Kule/Bil ve Fethet/WordQuest üst kartlarına dokunulmadı. Mobil bileşenler değiştirilmedi; bu kartlar yalnızca mevcut geniş ekran ağacında bulunur.

## Yerel doğrulama

- Üç test dosyasında **30 test geçti**; TypeScript ve hedefli ESLint geçti.
- Akademi görsel dosyaları/orijinal hashleri ve CSS ayrıştırması kontrolü geçti.
- 1240px orman, 1440px açık, 834px koyu ve 768px açık temada görsel inceleme yapıldı; dört ayrı ders rengi ve doğru sütun düzeni doğrulandı.
- 390px mobilde mevcut ana ekran korunuyor; yeni ders kartları render edilmiyor.
- Test edilen ekranlarda yatay taşma ve sayfa JavaScript hatası bulunmadı.
- Fareyle yükselme gerçek tarayıcıda ölçüldü; klavye odağı doğrulandı. Azaltılmış hareket durumunda kart dönüşümü ve sözde öğe animasyonu “none”, geçiş süresi “0s”.
- Dokunmatik tarayıcıda doğal `:active` durumu oluşmadığı gözlendi. Yalnızca dokunma/kalem için geçici bileşen basma durumu eklendi; bırakma, iptal, çıkış ve odak kaybında temizlenir. Olaylar engellenmez, bağlantı davranışı değişmez; kalıcı veri veya JS animasyon zamanlayıcısı eklenmedi.
- 834px dokunmatik tarayıcıda gerçek touchStart/touchCancel ile basma ve sıfırlama doğrulandı. Normal tercihte küçük ölçek/çökme tepkisi, azaltılmış harekette `transform: none` gözlendi; oyun başlatılmadı.
- Tarayıcıda TYT (4 ders) → AYT Sayısal (2 ders) → YDT (1 ders) → TYT (4 ders) geçişleri ve bağlantı hedefleri doğrulandı.
- Tam üretim build'i veya gerçek öğrenci/kurum hesabıyla oyun testi bu görsel değişikliğin kapsamında değildi.

## Ekran görüntüleri

- `C:/Users/sevdi/.codex/visualizations/2026/08/25/01a03aa7-0e5c-7b80-99d4-7d63a086637b/subject-cards-1240-orman.png`
- `C:/Users/sevdi/.codex/visualizations/2026/08/25/01a03aa7-0e5c-7b80-99d4-7d63a086637b/subject-cards-768-light.png`

Sadece sunum bileşeni, ona ait CSS ve hedefli testler değişti. API, veritabanı, soru değerlendirme, kurum, istatistik ve kalıcı tercih altyapısına dokunulmadı. Commit, push veya yayın yapılmadı.
