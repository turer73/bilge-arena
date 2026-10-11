# Fen: yerel sayım ve çözüm-dayanak korumaları

Bu belge @3 politika adayının tarihsel sözleşmesini anlatır. Sonraki yerel
@4 adayında [şık metni seçimi](question-audit-option-selection.md) eklenmiştir;
@3 kayıtları veya başarısız benchmark sonuçları yeniden etiketlenmez.

Bu sürüm yerel adaydır; üretim yayını, yeni ücretli koşu veya öğrenci
kalibrasyonu değildir. Başarısız Fen v5 benchmark'ı başarısız olarak kalır.

## Dar kapsamlı DNA sayımı

`dna-position@1`, yalnız `sequence-evidence.ts` içindeki tam Türkçe soru
gramerini tanır: aynı yönde, soldan 1-tabanlı, ekleme/silme olmadan karşılaştırılan
iki dizi. Üst sınır 128 ASCII A/C/G/T; uzunluklar eşit, fark tam bir konum,
passage null olmalıdır. Karakterler, boşluk, Unicode ve noktalama normalize
edilmez. Ek talimat, farklı yön/başlangıç, başka soru biçimi, birden fazla fark,
indel veya bağlam varsa `null`: desteklenmeyen soru onaylanmış sayılmaz.

Kod iki diziyi konum konum sayar; kaynak metin ve passage'dan yerel SHA-256
üretir. Bu hash DB `contentSha256` yerine geçmez. Cevap anahtarı, yazar çözümü,
seçenek sırası ve model çıktısı sayımı etkilemez. Yeniden doğrulama tam girdi,
hash ve tüm konumları karşılaştırır. Makbuz başka soruya taşınamaz.

Üç ajanın prompt'una aynı kod kaynaklı sayım gider. Bu nedenle yardımcı sayım
bakımından üç bağımsız kanıt değildirler; model mutabakatı doğruluk kanıtı
olarak sunulamaz. Körlük cevap anahtarına/yazar çözümüne göredir.
Sayım ajan çıktısını, hata kaydını veya nihai verdict'i **değiştirmez**.
Çözüm denetçisi kod sayımını yazarın göstermediği çözümün yerine kullanamaz.
Genel DNA, genetik veya müfredat doğruluğu kanıtlanmış değildir. Model etkisi
ancak yeni, önceden sabitlenmiş tam koşuyla ölçülebilir.

## Model iddiası ve kod değerlendirmesi

`solution-verifier@6` / `solution-evidence@3`: model `solutionCompleteness`
alanını üretir; kod bunu **asla** `adequate` → `terse` diye değiştirmez.
Kimliklerden alıntılar çözülür ve ayrı `supportAssessment` üretilir:

| Kod sonucu | Anlamı / işlem |
| --- | --- |
| `answer_only_for_reported_reasoning` | Model soruyu çıkarım olarak sınıflandırmış; yazarın tüm çözümü yalnız seçenek tekrarı. Koşullu `INCOMPLETE_SOLUTION` uyarısı. |
| `missing_cited_support` | Model yeterli diyor ama dayanak seçmemiş. İçerik kusuru uydurmadan inceleme. |
| `answer_only_citation` | Tam çözüm daha uzun ama seçilen kanıt yalnız cevap. İçerik kusuru uydurmadan inceleme. |
| `not_established` | Bu dar kontroller çelişki saptamadı; anlamsal yeterlilik **kanıtlanmadı**. |

Bu kontroller olumsuz sınırlardır, tek başına onay vermez. `questionDemand`
hâlâ model yargısıdır; yanlış `recall` sınıflaması bu kontrolü aşabilir. Bu sınır
testte açıkça gösterilir, gizlenmez. İlgisiz gerçek alıntı ve yanlış hesap da
genel olarak kodla doğrulanmaz.

Bilinmeyen/tekrarlı kimlik, modelin alıntı/değerlendirme alanı üretmesi,
bozuk JSON, timeout ve truncation ajan hatasıdır. İçerik kusuruna çevrilmez.
Saklanan alıntı/değerlendirme tekrar girdiden doğrulanır; bozulmuş değerler
onarılmaz ve ret kararını destekleyen kanıt olarak kullanılamaz.

## Kimlik, tarihçe ve kapılar

Yerel politika `question-quality@3`, kör/adversarial prompt'lar `@3`, verifier
`@6`. Canlı runtime'a veya veritabanına bu değişiklikle yazılmaz. Eski
politika/prompt benchmark'ı yeni yetkili kararı açamaz. Üretim runtime geçişi
ve kabul işlemleri ayrıca değerlendirilmelidir; bu dosya geçiş talimatı değildir.

@1–@5 replay parser'ları korunur. @5'te yalnız-cevap `adequate` şema hatası
olarak kalır; eski başarısız koşu yeniden etiketlenmez. Yeni kuralla eski raw
üzerinde çalışma yalnız geliştirme karşılaştırmasıdır, yeni benchmark değildir.

Ortak terfi kapısı artık pakette beyan edilen `extraReleaseConditionsPassed`
ve `checks` kayıtlarını da kontrol eder: genel istatistik yeşil olsa bile ek
koşul başarısız/eksik/tipçe bozuksa yetkili karar yazılamaz. Eski genel raporlar
ek koşul ilan etmiyorsa mevcut kimlik ve eşik kontrolleriyle okunur. Bu kontrol
rapor imzası veya bağımsız insan doğrulaması yerine geçmez; bütün ek alanları
kötü niyetle silen bir raporu saptayan kriptografik protokol sicili değildir.

Ücretli çağrı ve yayın yok; eski harcama kayıtları, eski canlı soru içerikleri
ve revizyonlar korunur. 28 adayın önceki model onayı, başarısız benchmark'ı veya
eksik Fen sorumlu kabulünü telafi etmez.
