# Denetim: şık metni seçimi

Yerel geliştirme adayı: `question-quality@4`, `blind-solver@4`,
`adversarial@3`, `solution-verifier@7`, `option-text@1`,
`solution-evidence@4`. Bu değişiklik yeni ücretli koşu, benchmark terfisi,
veritabanı kabulü veya soru yayını değildir.

## Sorun ve sözleşme

Fen v6 denetiminde bazı yanıtlar doğru sayıyı yazdığı halde başka şıkkın
indeksini seçti. Genel benchmark geçti ama önceden belirlenmiş ek koşullar
129/132 kaldı. O koşu başarısız kalır; 28 adayın olumlu sonucu bunu telafi etmez.

Kör çözücü artık `reasoning`, `computedValue` ve `selectedOptionText` döndürür.
Son alan seçeneklerden **birebir** kopyalanan metin veya `null` olmalıdır.
Çözüm denetçisi de indeks yerine aynı alanı döndürür; yazar parçası kimlikleri
ve yeterlilik değerlendirmesi korunur. İki ajana da cevap anahtarı verilmez;
kör çözücü ayrıca yazar çözümünü görmez. Karşıt denetçi değişmemiştir.

Gemini yanıt şemasında metin enum'u vardır; backend ayrıca bağımsız runtime
doğrulaması yapar. Şema uyumu doğruluk kanıtı değildir. Bilinmeyen metin,
modelin indeks/değerlendirme üretmesi veya bozuk JSON, ajan şema hatasıdır.
Tekrarlı veya boş seçeneklerde eşleme kapalıdır.

Kod metinden indeksi bulur, kör çözücünün gösterim sırasını kanonik sıraya
çevirir. Boşluk kırpma, Türkçe karakter katlama, Unicode normalizasyonu,
işaret/birim değiştirme veya en yakın seçeneği bulma yoktur. Ham model yanıtı
aynen saklanır. Saklanan indeks, değerlendirme ve alıntılar girdiden yeniden
üretilir; ham yanıtla uyuşmazlık sessizce onarılmaz.

## Olumsuz tutarlılık kontrolü

`selectionAssessment`, modelin üretmediği ayrı kod alanıdır:

| Sonuç | Sınır |
| --- | --- |
| `numeric_match` | İki yalın ASCII tam sayı/ondalık aynı değerde; doğru oldukları kanıtlanmadı. |
| `numeric_conflict` | Hesap sonucu ve seçilen yalın sayı farklı; model tanıklığı çelişkili. |
| `value_without_selection` | Model seçim yapmamış ama verdiği sonuç seçeneklerde mevcut. Seçenek otomatik doldurulmaz. |
| `not_checked` | Bu dar kontrol uygulanamadı; olumlu kanıt değildir. |

Sayısal dil isteğe bağlı eksi işareti, en fazla 80 tam basamak ve 40 ondalık
basamakla sınırlıdır. Büyük değerlerde JavaScript `Number` yuvarlaması yoktur.
Ondalık nokta kullanılır. Virgül, kesir, üs, birim, formül ve Unicode sayılar
yorumlanmaz. Yalnız sayısal karşılaştırmada sondaki sıfırlar ve negatif sıfır
eşdeğer sayılır; seçenek metni eşlemesinde hiçbir normalizasyon yapılmaz.

Çelişkili kör yanıt varsa bu yanıtlardan anahtar hatası veya eksik doğru şık
bulgusu türetilmez; aksi bir arıza yoksa sonuç `NEEDS_REVIEW` olur. Çelişkili
azınlık oyu atılıp mutabakat şişirilmez. Bozuk ham/saklanan kayıt
`INCONCLUSIVE` olur. Gerçek hata/timeout içerik kusuruna çevrilmez.

Model yanlış sonucu ve yanlış seçeneği tutarlı biçimde birlikte verebilir.
Çözüm denetçisi yanlış metin seçebilir. Bu kontrol bunları genel olarak çözmez;
metin seçimi, akademik doğrulama veya bağımsız insan onayı değildir.

## Geçmiş, test ve yayın sınırı

Eski kör @1–@3 ve verifier @1–@6 parser'ları kendi anlamlarıyla korunur.
Bilinmeyen sürümler eski parser'a düşürülmez. Eski raw kayıtlar yeni wire
sözleşmesine çevrilip yeni benchmark gibi gösterilemez. Yeni politika/prompt
kimliği eski benchmark ile yetkili karara terfi edemez.

Yerel testler 4/5 seçenek permütasyonlarını, uçtan uca kayıt/replay akışını,
işaret/ondalık/Türkçe karakter sınırlarını ve ham/saklanan kayıt çelişkilerini
sınar. Geçmiş v5/v6 koşuları ayrı arşivlenmiş kodla karşılaştırılır. Bunlar
ücretsiz geliştirme testleridir; Gemini'nin yeni sözleşmedeki başarısını ölçmez.

Gerçek model doğrulaması için kod, prompt ve kontrol kümesi önceden sabitlenmiş
yeni tam koşu gerekir. Önceki ücretli koşu bitmiştir; yeni çağrılar ayrıca
yetkilendirilmelidir. Önceki bütün harcamalar toplam bütçe içinde kalır.
Başarısız ek yayın koşulları kaldırılmaz veya eşikler gevşetilmez. Üretimdeki
politika, kaynak/yıl kabulü ve Fen sorumlu yayın kabulü ayrıca ele alınır.
