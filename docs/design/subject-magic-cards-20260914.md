# Ders oyunları — küçük ve büyülü kartlar (ikinci tasarım)

14 Eylül 2026. Kullanıcı ilk renkli/simgeli kartları büyük buldu ve özellikle **büyülü hava** istedi. Bu sürüm ilk tasarımın yerini alır; geçmiş doğrulama kaydı silinmez.

## Görsel ve kod

- Dört özgün ders illüstrasyonu yerleşik `image_gen` ile üretildi. Creative Production becerisinin çoklu üretim kuralıyla iki görsel çalışanı kullanıldı; her görselin ilk üretimi seçildi. CLI veya harici görsel API'si kullanılmadı. Pano aracı doğrudan kullanılamadığı için yerel sayfa ve ekran görüntüleri üzerinden inceleme yapıldı.
- Kaynak PNG baytları değiştirilmeden projeye kopyalandı. [Tam promptlar, kaynak dosyalar, ölçüler ve SHA-256 kayıtları](subject-magic-prompts-20260914.json).
- Matematik: [ışıklı geometrik kristal](../../public/academy/subjects/matematik-magic-v1.png).
- Türkçe: [büyülü kitap ve tüy kalem](../../public/academy/subjects/turkce-magic-v1.png).
- Fen: [zümrüt ışıklı şişe ve prizma](../../public/academy/subjects/fen-magic-v1.png).
- Sosyal: [altın/mor küre ve keşif haritası](../../public/academy/subjects/sosyal-magic-v1.png).
- Bunlar dekoratif fantastik çizimlerdir; deney tarifi, doğru coğrafi veri veya ölçme kanıtı değildir. Sosyal görselde bazı ince yüzey çizgileri vardır; öğretim materyali olarak kullanılmamalı.
- Kartlar önceki yaklaşık 235.6 px yerine **160 px**: yaklaşık %32 daha kısa. Büyük simge ve ikinci açıklama satırı kaldırıldı; ders adı, sınav etiketi ve “Turunu kur” kaldı.
- Masaüstünde dört sütun; 768–1050 px tablette iki sütun. Tek/iki dersli sınavlarda gereksiz genişleme sınırlandı. YDT mevcut WordQuest çizimini kullanır, yeni ders eklenmez.
- `next/image`, açık `sizes` ve sabit minimum yükseklik kullanılır. Farklı kaynak oranları `contain` ile nesneyi kesmeden gösterilir; yumuşak kenar/alt geçişleri metni okunur tutar. Tema yüzeyi ve kenarlar mevcut değişkenleri kullanır; çizim üzerindeki açık yazılar koyu görsele göre sabittir.
- Sürekli animasyon yok. Farede 3 px yükselme, %2.5 görsel yaklaşması ve tek kısa ışık geçişi; klavye odağı ve dokunma/iptal desteği korunur. Hareket azaltma tercihinde dönüşüm, geçiş ve animasyon yoktur.

## Korunan sınırlar

Mevcut sınav kataloğu, href hedefleri, oturum erişimi ve mobil bileşenler değişmedi. Kule, Bil ve Fethet ve WordQuest üst kartları korunur. API/veri tabanı, oyun motorları, ödül/istatistik ve kurum altyapısı değişmedi. Commit, push veya deploy yapılmadı.

## Bu sürümün yerel doğrulaması

- Üç test dosyasında 30 test geçti: oyun keşfi, çalışma ekranı ve mevcut arena ana ekranı.
- TypeScript `--noEmit --incremental false` ve hedefli ESLint geçti.
- `scripts/check-academy-assets.mjs` geçti: 24 ifade, iki portre, şeffaf kupa, üç üst mod çizimi, dört yeni ders çizimi/hashleri ve CSS ayrıştırması doğrulandı. Bu betikteki `browserVisualQa: not_run` yalnızca betiğin tarayıcı çalıştırmadığını belirtir; ayrı gerçek tarayıcı sonuçları aşağıdadır.
- 1240 px orman, 1440 px açık, 834 px koyu ve 768 px açık temada gerçek Chromium tarayıcı kontrolü: dört görsel yükleniyor, her kart 160 px, beklenen sütun düzeni, yatay taşma ve sayfa JS hatası yok.
- 390 px görünümde mevcut mobil ana ekran bulunuyor; yeni masaüstü oyun ağacı yok.
- TYT dört → AYT Sayısal iki → YDT bir → TYT dört bağlantı/sınav kapsamı doğrulandı.
- Normal harekette yaklaşık 3 px fare yükselmesi; azaltılmış harekette `transform: none`, `transition: 0s`, sözde öğe animasyonu `none` gözlendi. Klavye odağı 3 px ve görünür.
- 834 px dokunmatik bağlamda gerçek `touchStart/touchCancel` ile basma ve temizleme doğrulandı. Normal tercihte ölçek tepkisi, azaltılmış harekette dönüşümsüz davranış; oyun başlatılmadı.
- Tam üretim derlemesi, gerçek öğrenci hesabı ve kurum pilotu bu sürümde çalıştırılmadı. Yerel kanıtlar canlıya hazır olma iddiası değildir.

## Ekran görüntüleri

- [1240 px orman](previews/subject-magic-1240-orman.png)
- [1440 px açık](previews/subject-magic-1440-light.png)
- [834 px koyu](previews/subject-magic-834-dark.png)
- [768 px açık](previews/subject-magic-768-light.png)

Ekran görüntülerinin kopyaları da proje içine kaydedildi; bu belge Codex geçici önizleme klasörüne bağımlı değildir.
