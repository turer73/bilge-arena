# Bilge Tahta — Ortak Konu Anlatımı Yüzeyi

**Tarih:** 2026-08-13
**Durum:** Dilim A–D kodlandı ve yerelde doğrulandı; feature flag varsayılan kapalı. Yetkili kullanıcıyla production smoke yapılmadığı için canlı tamamlandı sayılmaz.

## 2026-08-13 uygulama kanıtı

- Ortak `BilgeTahtaDialog`, güvenli içerik sözleşmesi ve metin/formül renderer eklendi.
- Oyun modu yalnız sunucudan açılmış mevcut `/api/coach/hint` aşamasını taşır; soru kökü, seçenekler ve doğru cevap tahta modeline alınmaz.
- Ders Çalış modu yalnız başarıyla tamamlanmış `/api/chat` yanıtını taşır ve içeriği “Doğrulanmış ders içeriği değildir” etiketiyle gösterir.
- Analitik olayları kapalı alan listesiyle çalışır; PII, soru, cevap ve sohbet metni göndermez.
- Gerçek tarayıcı ölçümü: 320/375/390 px genişliklerde belge, dialog ve footer yatay taşmadı; uzun formül alanı `overflow-x: auto` ile kendi içinde kaydı.
- Hedefli test, type-check ve lint kapıları geçti. Production rollout ve yetkili smoke ayrı onay kapısıdır.

## Amaç

Bilge Asistan'ın Ders Çalış alanındaki konu anlatımını ve oyun içindeki doğrulanmış Bilge Koç aşamalarını, Bilge Arena kimliğine uygun ortak bir tahta yüzeyinde sunmak.

Bu çalışma yeni bir serbest yapay zekâ veya ikinci bir Koç akışı kurmaz. Mevcut içerik kaynaklarını, sunucu tarafı notlamayı ve kademeli yardım sözleşmesini koruyan bir kullanıcı deneyimi katmanıdır.

## Ürün konumu ve sırası

- Yol haritası: **Sprint 2 — ilk değer ve tekrar kullanım / öğrenci bağlılık döngüsü**.
- Institution Lite tenant temelinden bağımsız geliştirilebilir; ancak mevcut yarım temel dilim doğrulanmadan uygulamaya başlanmaz.
- İlk yayın feature flag ile yapılır ve kullanım/geri dönüş etkisi ölçülmeden varsayılan ana deneyim hâline getirilmez.

## Ortak bileşen sınırı

Tek bir `BilgeTahtaDialog` iki kontrollü modda çalışır:

### Ders Çalış modu

- Bilge Asistan içinde “Tahtada anlat” eylemiyle açılır.
- Seçili sınav, ders ve konu bağlamını kullanır.
- Kavram, çözümlü örnek ve “sen dene” adımlarını gösterir.
- Kullanıcı anlatımdan sohbete veya çalışma planına bağlamını kaybetmeden döner.

### Oyun modu

- Ders ve konu mevcut sorudan otomatik gelir; kullanıcı ders değiştiremez.
- Mevcut sıra korunur: ilk deneme → ipucu 1 → ipucu 2 → küçük örnek → çözüm → transfer.
- Tam çözüm, doğru cevap veya transfer cevabı sunucu sözleşmesinin izin verdiği aşamadan önce gösterilmez.
- “Soruyu çözmeye dön” ana kaçış eylemidir.

## Görsel ve responsive sözleşme

- Masaüstü: en fazla 900 px genişliğinde erişilebilir dialog.
- Mobil: alttan açılan, en fazla `88dvh` yüksekliğinde tam genişliğe yakın sheet.
- 320, 375 ve 390 px genişliklerinde yatay taşma olmamalı.
- Başlık ve alt eylemler sabit; uzun anlatım ve formüller kaydırılabilir gövdede olmalı.
- Ahşap çerçeve mobilde inceltilmeli; dekor içerik alanını daraltmamalı.
- El yazısı fontu kısa başlık/vurguyla sınırlı; ana açıklama okunaklı uygulama fontunda olmalı.
- KaTeX formülleri sarmalanmalı veya kendi alanında yatay kaydırılabilmeli.
- Dokunma hedefleri en az 44x44 px olmalı.

## Etkileşim ve erişilebilirlik

- `role="dialog"`, `aria-modal`, erişilebilir başlık/açıklama ve odak kapanı.
- Açan kontrole odak geri dönüşü, Escape ile kapatma ve arka plan kaydırma kilidi.
- `prefers-reduced-motion` durumunda daktilo/tahta animasyonu kapalı.
- “Yazıyı hemen göster” kontrolü.
- Ses kullanıcı eylemiyle başlar; tebeşir sesi varsayılan kapalıdır.
- Kapatma ve “soruya dön” eylemleri yükleme/hata durumlarında da kullanılabilir.

## İçerik ve güvenlik değişmezleri

1. Oyun istemcisi doğru cevabı konu anlatımı bahanesiyle önceden alamaz.
2. Oyun modu yalnız `/api/coach/hint` tarafından izin verilen aşamayı gösterir.
3. Ders Çalış modu mevcut `/api/chat` güvenlik, hız sınırı ve oturum kurallarını korur.
4. Küratörlü içerik mevcutsa önceliklidir; serbest model çıktısı güvenilir/onaylı içerik gibi etiketlenmez.
5. Kaynak ve koruyucu kontrol etiketi, Koç yanıt sözleşmesinden geldiyse görünür kalır.
6. HTML yanıtı doğrudan işlenmez; metin ve formül alanları güvenli render edilir.

## Ölçüm

- `BilgeBoardOpened`: `study|game`, ders, sınav kapsamı ve giriş noktası.
- `BilgeBoardStageViewed`: kavram, örnek, uygulama veya mevcut Koç aşaması.
- `BilgeBoardReturnedToQuestion`: dönüş ve açılıştan dönüşe süre.
- `BilgeBoardCompleted`: son adıma ulaşma.
- Mevcut `CoachStageViewed` ve `CoachTransferResult` olayları korunur; aynı öğrenme eylemi iki kez başarı olarak sayılmaz.
- PII ve ham soru/cevap metni analitik olaylara gönderilmez.

## Uygulama dilimleri

### Dilim A — Kabuk ve sözleşme

- Dialog/sheet kabuğu, responsive davranış ve erişilebilirlik.
- Tahta adım modeli ve güvenli metin/formül renderer.
- 320/375/390 px bileşen testleri ve uzun içerik örnekleri.

### Dilim B — Oyun entegrasyonu

- `BilgeChanCompanion` aşamalarını ortak tahta görünümüne bağlama.
- İlk deneme ve sunucu izin sırası regresyon testleri.
- Hata, yeniden deneme, kapatma ve soruya dönüş akışları.

### Dilim C — Ders Çalış entegrasyonu

- `StudyAssistant` içinde “Tahtada anlat”.
- Seçili ders/sınav/konu bağlamı ve sohbet bağlamına güvenli dönüş.
- Boş, yükleniyor, rate-limit ve bağlantı hatası durumları.

### Dilim D — Kademeli yayın

- Varsayılan kapalı feature flag.
- İç ekip ve dar öğrenci grubunda mobil/masaüstü smoke.
- Açılma, tamamlama, soruya dönüş ve transfer sonuçlarının karşılaştırılması.

## Kabul kapısı

- Birinci denemeden önce cevap/çözüm sızıntısı regresyon testleri temiz.
- Dialog erişilebilirlik ve klavye testleri temiz.
- 320, 375, 390 px ve masaüstünde uzun Türkçe metin/formül taşması yok.
- Oyun ve Ders Çalış kapatma/dönüş akışlarında bağlam kaybı yok.
- Analitik olaylarda PII veya soru metni yok ve çift sayım yapılmıyor.
- İlgili testler, type-check, lint ve üretim build geçiyor.
- Yetkili test kullanıcısıyla production smoke yapılmadan “canlı tamamlandı” denmez.

## Bu sürümde yok

- Öğretmenin serbest içerik hazırlama stüdyosu.
- Otomatik video ders üretimi.
- Canlı öğretmen yayını.
- Kuruma özel ayrı tahta teması veya white-label.
- Modelin doğrulanmamış içeriğini toplu biçimde soru bankasına yazma.
