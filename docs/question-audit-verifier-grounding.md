# Çözüm denetçisi: yazar metnine bağlı yeterlilik

Bu belge `solution-verifier@5` / `solution-evidence@2` tarihsel sözleşmesini
anlatır. Yerel aday @6/@3 ve yeni politika için
[Fen korumaları](question-audit-fen-offline-guards.md) belgesine bakın.

## Sorun

Fen geliştirme koşusunda 12 yalnız-sonuç çözümünün altısı yeterli sayıldı.
Örneğin yazar `Yanıt 23.` derken model kendi gerekçesinde `12+18−7=23`
hesabını tamamladı. Bu, yazarın çözümünün yeterli olduğuna kanıt değildir.
Bu altı örnek geliştirme regresyonudur; bağımsız değerlendirme kümesi değildir.

## Sözleşme

Denetçi cevap anahtarını görmez. Sonuç indeksini çıkarır; kod işaretli
indeksle karşılaştırır. Ayrıca soru talebini `recall` / `reasoning` olarak
değerlendirir ve `supportingUnitIds` içinde yalnız kodun `solutionText`'ten
ürettiği `authorEvidenceUnits` kimliklerini seçer. `supportingQuotes` modelden
kabul edilmez; kod seçilmiş parçaların metnini birebir çıkarır. Kendi ürettiği hesap veya soru kökündeki
bir formül yazarın göstermediği çözüm adımı yerine geçmez.

Parçalar boş olmayan satırlar, uzun satırlarda en çok 2000 UTF-16 birimlik
dilimlerdir. Noktalama/ondalık/LaTeX normalleştirilmez, surrogate çiftleri
bölünmez. `start/end` tam kaynak dilimini belirtir. Kimlikler yalnız aynı
girdi anlık görüntüsü içinde anlamlıdır. En çok sekiz farklı parça seçilebilir;
uydurma veya tekrarlanan kimlik, boş yeterlilik kanıtı ve fazla alan reddedilir.
Çok uzun/parçalı bir çözüm bu sınırda incelenemiyorsa otomatik yeterli sayılmaz.

- `adequate` için en az bir boş olmayan, metinde gerçekten bulunan dayanak gerekir.
- Hesap/çıkarımda yalnız seçenek metninin tekrarı ve açık `Yanıt/Cevap/Sonuç`
  önekli tekrarlar dayanak sayılmaz. Bu dar bir kontrol, genel dil çözümleyicisi değildir.
- Kısa ama gösterilmiş hesap (`12+18−7=23`) kabul edilebilir.
- Tanım/hatırlama sorusunda tek cümle, hatta uygun tek sözcük, yeterli olabilir.
  Kök cevabı aynen verip tekrar seçtiriyorsa da doğrudan eşleştirmedir;
  verilen kuralla yeni bir örneğe uygulama veya hesap yapmak farklıdır.
- Dayanak eksikliği veya yeterlilik belirsizliği `terse` olur; mevcut
  `INCOMPLETE_SOLUTION` uyarısıyla insan/sorumlu incelemesine gider.
- Sahte alıntı, eski sözleşme veya alan ihlali ajan `schema` hatasıdır;
  soru kusuruna çevrilmez. Başka bağımsız engelleyici bulgu yoksa sonuç
  `INCONCLUSIVE` olur. Ham yanıt korunur; mevcut sınırlı yeniden deneme kuralı geçerlidir.

**Sınır:** Alıntının varlığı anlamsal doğruluk veya yeterlilik kanıtı değildir.
Model yanlış soru türü seçebilir veya gerçek fakat ilgisiz bir ifadeyi yeterli
bulabilir. Kurallar, bu riski bütünüyle ortadan kaldırmaz. Gerçek model
kontrolleri ve kaynak/kazanım incelemesi hâlâ gerekir.

## Geçmiş, önbellek ve yayın

Eski @1/@2/@3 sonuçları yalnız kendi parser'ıyla yeniden okunur; onlara yeni
kanıt alanları eklenmez. @4 sonuçlarının alıntıları eski sözleşmesiyle
saklanan girdiyle doğrulanır. @5 kayıtlarında hem parça kimlikleri hem kodun
çıkardığı alıntılar yeniden doğrulanır; bozulmuş alıntı sessizce onarılmaz.
Bilinmeyen sürüm eski parser'a düşmez.

`runCalibration`, önbellekte hem girdi hem de politika, model, sağlayıcı,
prompt ve üretim ayarlarının tam kimliğini doğrular. Eski @3/@4 sonucu @5
etiketli yeni rapora veya yetkili karara taşınamaz. Tarihsel inceleme için
`fromValidationRunRows` ve `deriveVerdict` kullanılabilir.

Karar politikası `question-quality@2` ve yayın kapısı değişmedi. Yeni prompt
kimliği eski benchmark terfi kanıtıyla eşleşmez. Testlerin geçmesi modelin
doğrulandığı veya soruların yayımlandığı anlamına gelmez. Tam üç-ajanlı
benchmark, kesin aday hash'leriyle denetim, kaynak/yıl/kazanım kabulü ve
ilgili sorular için yetkili yayın kararı ayrı adımlardır.

## Yerel doğrulama

```powershell
npm exec -- vitest run src/lib/question-audit
npm run type-check
npm exec -- eslint src/lib/question-audit/
```

Özel koşu kanıtları `secure/lgs-fen-verifier-units-20261011/` altındadır.
Önceki `secure/lgs-fen-verifier-repair-20261011/` ve
`secure/lgs-fen-review-20261011/` paketleri değiştirilmez. Hepsi git dışıdır.
Eski koşunun dosya doğrulaması eski kod hash'lerine bağlıdır; yeni kodla aynı
koşuyu yeniden adlandırıp çalıştırmak doğru değildir. @4 geliştirme sonucu
44/48 olarak kalır; tartışmalı etiket ayrı değerlendirilir, eski puan değişmez.
