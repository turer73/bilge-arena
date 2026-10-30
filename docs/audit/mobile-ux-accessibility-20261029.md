# Mobil quiz: dar ekran, büyütülmüş metin ve odak kabulü

29 Ekim 2026. PR #709, başlangıç sürümü d7ea24ec. CLAIM 104892 ve kapsam eki
104895. Bu inceleme soru, sonuç paneli ve iki pencerenin klavye erişimiyle
sınırlıdır; bütün site için WCAG uygunluk beyanı değildir.

## Bulunan ve düzeltilen kusurlar

| Bulgu | Başlangıç kanıtı | Aday davranış |
|---|---|---|
| Discovery 2982: sonuç araçları çakışıyor | Gerçek önizleme, 320×640: Konu Anlatımı x107–235, beğeni x196–240. Ayrıntılı Çözüm scrollWidth 86, clientWidth 79. | Metin düğmeleri alan yetmezse satır değiştirir; sosyal ikonlar aynı grupta kalır. Metin küçültülmez. |
| Discovery 2985: odaklanan ilerleme düğmesi görünmüyor | Tarayıcı varsayılan yazısı 32 px, 360×640, büyük Aa, uzun yanlış cevap: Sonucu Gör odağı alır ama yüksekliği sınırlı panelin altında kalır. | Yalnız panelin scrollTop değeri ayarlanarak odak görünür yapılır. Soru konumu bu odak düzeltmesi yüzünden kaydırılmaz. |

Panelin yüksekliği sınırlı ve içi kaydırılabilir kalır. Dar alanda araçlar ek
satır kullanabilir; okunur metin ve birbirinden ayrı dokunma alanları korunur.
Mobil panelde birincil ilerleme eylemi tam genişliktedir. Masaüstündeki panel
akışı ve odak politikası korunur.

## Kabul matrisi

| Görünüm | Metin | Denetlenen akış |
|---|---|---|
| 320×640 CSS px | Büyük Aa | Uzun paragraf/şık, araçların çakışmaması, görünür odak |
| 320×450 CSS px | Büyük Aa | Kısa görünüm alanında panel içi kaydırma ve pencereler |
| 360×640 CSS px | Tarayıcı varsayılanı 16→32 px ve büyük Aa | Gerçek font tercihiyle rem metinlerin büyümesi; ilerleme/araç odağı |
| 640×900 CSS px | Tarayıcı varsayılanı 16→32 px ve büyük Aa | Mobil panelin ara genişlikte de taşmaması |

Her senaryo Aa penceresini klavyeyle açar, tercihi değiştirir, Escape ile
kapatır ve odağın açan düğmeye dönmesini doğrular. Zamansız misafir sorusunda
uzun paragrafın tamamı ve bütün şıklar bulunur. Yanlış cevap fixture'ı uzun
sonuç başlığı üretir. Araçlar en az 44×44 CSS px kalır; metin kırpılması ve
birbiriyle kesişen düğme alanları reddedilir. İlerleme, ayrıntılı çözüm,
konu anlatımı, beğeni ve yorum odağının panel içinde görünürlüğü denetlenir.
Ayrıntılı çözüm penceresinde son eyleme erişim ve Escape sonrası odak dönüşü
ayrıca doğrulanır.

## Yöntem ve sınırlar

Metni iki katına çıkarma Chromium'un Page.setFontSizes standard=32 tercihiyle
yapılır; html hesaplanan boyutunun 32 px olduğu ve soru yazısının büyüdüğü
ayrıca doğrulanır. Bu mekanizma CSS zoom veya ekran piksel yoğunluğunu değiştirmek
değildir. Chromium dışındaki motorlar bu font tercihi senaryosunda açık bir
gerekçeyle atlanır; diğer senaryolar aynı kısıta sahip değildir.

320×450, 640×900 görünüm alanının yüzde 200 tam sayfa büyütmedeki yerleşim
karşılığıdır. Gerçek tarayıcı menüsünden büyütme testi olduğu iddia edilmez.
Önceki Windows aracı adres doğrulaması yüzünden durmuştu; aynı sistem arayüzü
yeniden zorlanmadı. Fiziksel telefon, Safari, NVDA/VoiceOver ve oturum açmış
kullanıcının sunucuda kayıt kabulü bu kontrolde yapılmadı.

320 CSS px seçimi [W3C yeniden akış rehberine](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
dayanır. Metin büyütme mekanizmaları ve içerik kaybı ölçütü için
[W3C metni büyütme rehberi](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
kullanıldı. 44 px burada ürünün dokunma alanı hedefidir; bütün AA kontrollerinin
44 px zorunluluğu olduğu ileri sürülmez.

## Doğrulama ve deneme geçmişi

- İlgili hook/panel testleri: 16 geçti. Tip kontrolü geçti.
- Dört yeni kabul ve üç mevcut mobil akış senaryosu: 7 Chromium testi geçti.
- Görsel kontrolden sonra odak görünürlüğü dört ardışık ölçümde ve ekran
  görüntüsü alındıktan sonra da doğrulanacak şekilde güçlendirildi; dört kabul
  senaryosu bu kontrollerle yeniden geçti.
- Tam derleme, testler ve uzak CI sonucu PR üzerinde tutulur.
- İlk yeni test denemeleri Chromium'un modal sınırındaki BODY/scrollable DIALOG
  duraklarını ve Windows erişilebilirlik ağacındaki checkbox ile DOM'daki
  aria-pressed button ayrımını yanlış varsaydı. Testler gözlenen yerel tarayıcı
  davranışına göre düzeltildi; arka plan kontrollerine odak kaçışı yine reddedilir.
- Bu varsayımlar düzeltildikten sonra başlangıç sürümünde üç gerçek kabul testi
  kırpılma/örtülen odak nedeniyle başarısız oldu (baseline-panel-final.log).
  İlk yeni birim testinde bütün öğelerin clientHeight değeri 200 verilince
  görünüm alanı da yanlış küçülmüştü; panel ve belge ölçüleri ayrıldı.

Yerel kanıtlar: D:/Projelerim/.codex-tmp/mobile-ux-accessibility-20261029/.
Fixture notlandırması arayüz kontrolüdür; soru içeriği doğruluğu kanıtı değildir.
Bu belge aday kabulünü kaydeder; üretime yayın veya fiziksel cihaz kabulü değildir.
