# Sosyal pilot: ek düzeltmeler ve 24 adayın durumu

Bu paketteki 17 yeni metnin ardından tamamlanan iki-model denetimi:
[Gemini Pro / DeepSeek V4 Pro kontrolü](social-pilot-correction-audit-20261001.md).
Bu sonuçlar kaynak kabulü veya canlı yayına dönüştürülmedi.

## Sonuç

1 Ekim 2026'da ilk 10 öneriye **7 kaynak destekli düzeltme önerisi** eklendi.
Toplam 17 soru için yerel önce/sonra inceleme çıktısı var. Diğer 7 soru için
bu turda zorunlu içerik değişikliği önerilmedi; bu, kabul veya yayın kararı değildir.

| Alan | Düzeltme preview | Şimdilik içerik yaması yok | Aday |
|---|---:|---:|---:|
| Tarih | 4 | 2 | 6 |
| Coğrafya | 4 | 2 | 6 |
| Felsefe | 4 | 2 | 6 |
| Sosyoloji | 5 | 1 | 6 |
| Toplam | 17 | 7 | 24 |

Veritabanında oluşturulan yeni revizyon: **0**. Mevcut soru, oynanmış cevap,
puanlama kaydı veya pilot pini değiştirilmedi. Canlı yayın, migration, push,
merge ve deploy yapılmadı.

## Ek yedi öneri

| Başlık | Önerilen düzeltme | Ayrı kalan kontrol |
|---|---|---|
| Kömür | Rezerv sıralaması yerine ders materyalinde desteklenen yatak–tür eşleşmesi soruluyor; kaynak/rezerv ve kendine yeterlilik genellemeleri çıkarıldı | Yeni hedef beceri ve güçlük; zayıf çeldirici |
| Tuz Gölü | Çözümden tarihsiz büyüklük sıralaması çıkarıldı; bölge, tuzluluk ve mevsimsel alan değişimi korundu | Yeni çözümün kaynak kabulü |
| Yağış | Bölgesel alansal yıllık ortalama ve 1991–2020 normal dönemi belirtildi; il, istasyon ve tek yıl ölçümü ayrıldı | Tek resmî ölçüm zinciri; kaynak kabulü |
| Doğu uç noktası | İl sorusunun çözümündeki gereksiz hassas koordinat çıkarıldı | Yer adı kanıtı; geodezik ölçüm yapıldığı iddia edilmiyor |
| Epoché | Askıya alma, dünyanın varlığını inkâr etmekten ayrıldı | Yeni çözüm ve seçeneklerin birlikte kontrolü |
| Sosyolojinin kapsamı | Disiplinleri tek araştırma nesnesine kapatan genelleme çıkarıldı | Genel keşif / resmî sınav kapsamı ayrımı |
| Tabakalaşma | Açık sistem, eşit fırsat veya yalnız bireysel başarıyla özdeşleştirilmedi | Uzun doğru şık; kapsam ve güçlük |

Kömür sorusunun eski anahtarı yanlış ilan edilmedi. Yeni kök, farklı dönem ve
tanımlardaki kaynak/rezerv toplamlarını karşılaştırmak yerine daha dar bir
olguyu ölçüyor. Bu, basit yazım düzeltmesi değil anlam/ölçme hedefi değişikliğidir.
Zorluk etiketinin korunması eşdeğer güçlük kanıtı değildir.

Başlıca bu turda incelenen dayanaklar:

- [MEB coğrafya materyali, basılı s.138](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/cografya/11/unite2/bolum2/files/basic-html/page62.html),
  [TKİ Soma havzası](https://eli.tki.gov.tr/soma),
  [TKİ işletme açıklaması](https://tki.gov.tr/sanayi) ve
  [Afşin-Elbistan saha kaydı](https://tki.gov.tr/haberler/afsin-elbistan-collolar-komur-sahasinin-kurumumuza-devri-gerceklesti).
  TKİ bağlantıları aynı kurum zinciridir, üç bağımsız tanık sayılmaz.
- [NASA Tuz Gölü incelemesi](https://science.nasa.gov/earth/earth-observatory/disappearing-lake-tuz-149211/),
  [MEB okul dışı öğrenme kaydı](https://okuldisiogrenme.eba.gov.tr/mekan-detay/tuz-golu-5119) ve
  [Konya coğrafya kaydı](https://konya.ktb.gov.tr/TR-370533/cografi-konum.html).
  Tarihsiz sıralama ve kaynaklar arasındaki sayısal derinlik farkı olumlu kanıt sayılmadı.
- [MGM 2025 yağış değerlendirmesi](https://www.mgm.gov.tr/FILES/arastirma/yagis-degerlendirme/2025yagisdegerlendirmesi.pdf),
  fiziksel/basılı s.9, Tablo 2. Normal ve yıllık ölçüm sütunları tam sayfa
  görüntüsünden karşılaştırıldı. Harf aralıkları metin çıkarımını bozduğundan
  PDF inceleme becerisinin yönlendirmesiyle görsel kontrol kullanıldı.
- [Iğdır coğrafya kaydı](https://igdir.ktb.gov.tr/TR-55671/cografya.html) ve
  [Tarım TV Dilucu kaydı](https://www.tarimtv.gov.tr/tr/video-detay/sinir-hattindaki-meralar-besicilikte-degerlendiriliyor-17506):
  yer adı desteği; koordinat hassasiyeti kanıtı değil.
- [SEP Husserl](https://plato.stanford.edu/entries/husserl/),
  [OpenStax sosyolojinin konusu](https://openstax.org/books/introduction-sociology-3e/pages/1-1-what-is-sociology) ve
  [OpenStax tabakalaşma](https://openstax.org/books/introduction-sociology-3e/pages/9-1-what-is-social-stratification).

MGM PDF byte SHA-256:
`4f8974914f34c51a252622188e5f3ac672684c8652deb46ce2a3102012be2366`.
Bu hash erişilen dosyayı tanımlar; ikinci bağımsız ölçüm veya insan kabulü değildir.
Kitap/PDF sayfaları ve soru bankası metinleri Git'e eklenmedi.

## Bu turda yama önerilmeyen yedi aday

- Tarih: Tanzimat ve saltanat kronolojisi. Çekirdek tarih korunuyor; ek tarihsel
  bağlam, özgün karar sayfası ve müfredat kanıtı ayrı açıklar.
- Coğrafya: ölçek hesabı ve delta. Önceki ölçek hesabı korunuyor; delta için kıyı
  koşullarını açıklama önerisi ve yerel örneklerin kanıtı takip listesinde.
- Felsefe: mantığın konusu ve refleksif düşünce. Geçerlilik/doğruluk ayrımını
  açıklama, çeldirici gücü, güçlük ve kapsam açıkları korunuyor.
- Sosyoloji: toplumsal kontrol. Norm/değer/yaptırım ayrımları açıklama önerisi;
  resmî TYT kapsam çatışması ayrı değerlendirilir.

Bu kayıt yalnız bu düzeltme turunun tasarrufudur; önceki kaynak bulgularını
silmez ve yedi soruya otomatik geçiş izni vermez.

## Özel çıktılar ve yeniden üretim

İlk paket korunur: `secure/social-correction-proposals-20261001.json` ve
`secure/social-correction-drafts-20261001/`.
Ek paket: `secure/social-additional-correction-proposals-20261001.json` ve
`secure/social-additional-correction-drafts-20261001/`.
Birleşik 24 aday durumu: `secure/social-correction-disposition-20261001.json`.

```powershell
node database/prepare-question-revision-drafts.mjs --offline `
  --rows secure/social-current-20260929.json `
  --proposals secure/social-additional-correction-proposals-20261001.json `
  --out-dir secure/social-additional-correction-drafts-20261001
node secure/verify-social-correction-pack-20261001.mjs
```

Öneri sözleşmesindeki `ready`, yalnız dosyanın hazırlanmış olmasıdır. Araç
`preview` üretir. Export kazanım ve gerçek kaynak kaydını taşımadığından
üretim payload'ı tamamlanmış sayılmaz; `INTERNAL` fallback'i kaynak kabulü değildir.

17/17 preview ve 24/24 yerel taban pinleri kontrol edildi. Tam içerik için
sıralı kompakt JSON fingerprint'i kullanılır; PostgreSQL `jsonb::text` yayın
hash'iyle aynı değildir. Cevap indeksleri ve export metadata'sı korundu,
tekrarlanan soru yok ve kaynak export değişmedi. Bu kontrol güncel canlı durum
sorgusu değildir.

Bu turda altı ilgili dosyada **48 regresyon testi geçti**: taslak aracı, pilot
preflight, kayıt planı, kaynak adaptörü/sözleşmesi ve revizyon–kazanım SQL kapısı.
Bunlar yeni metnin olgusal doğruluğunun, DB revizyon kabulünün veya canlı
öğrenci akışının testi değildir. Önceki 87 testlik koşu ayrı tarihsel kayıttır.

## Sıradaki kapı

Yeni metinlerin kaynak/kapsam değerlendirmesi ve bağımsız kör kontrolü,
gerçek kaynak/kazanım kayıtlarıyla tamamlanmalı. Yetkili yeni revizyon oluşturma
ve yayın sonrasında yeni UUID/hash için kaynak paketi ve pilot pinleri yenilenmeli.
Eski 12 conflicting / 12 insufficient sayımı eski revizyon raporlarına aittir;
17 yeni metne kopyalanamaz. Bu turda iki uzman şartı eklenmedi veya mevcut
canlı yetki politikası değiştirilmedi.
