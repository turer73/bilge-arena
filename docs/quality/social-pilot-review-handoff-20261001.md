# Sosyal pilotu — yerel inceleme teslimi

**Sonraki adım gerçekleştirildi:** [17 gerçek taslak, 170 ham kanıt ve yeni kaynak görevleri](social-pilot-draft-progress-20261001.md).
Bu belgedeki canlı yazım yapılmadığı bilgisi önceki yerel teslim anını anlatır;
güncel durum bağlantıdaki son DB kontrolündedir. Yeni içerik yayını yoktur.

1 Ekim 2026. Bu belge soru incelemesinin yerel teslimini kapatır; canlı pilotun
açıldığı veya kaynak/insan kabulünün tamamlandığı anlamına gelmez.

## Son paket

| Alan | İncelenen aday | İçerik düzeltmesi | İçeriği korunan |
| --- | ---: | ---: | ---: |
| Tarih | 6 | 4 | 2 |
| Coğrafya | 6 | 4 | 2 |
| Felsefe | 6 | 4 | 2 |
| Sosyoloji | 6 | 5 | 1 |
| Toplam | 24 | 17 | 7 |

Her soru kökü, beş seçeneği ve çözümü yeniden okundu. **120 seçenek için ayrı
gerekçe**, **24 soru için gerçekten ölçülen beceri önerisi** kaydedildi. Bunlar
AI editoryal değerlendirmesidir; 120 bağımsız kaynak doğrulaması veya bir insanın
imzası olarak yorumlanamaz. Genel kategori kazanımı tek başına pedagojik kabul
sayılmadı. Yaş ve psikolojik durum hakkında çıkarım yapılmadı.

Son dosyalar, cevabı ve özel banka içeriğini korumak için `secure/` altında:

- `social-correction-proposals-v2-20261001.json`: güncel 17 öneri.
- `social-correction-drafts-v2-20261001/report.json`: yazmasız içerik önizlemesi.
- Aynı klasörde `live-draft-plan.json`: gerçek legacy kaynak ve eski revizyon
  pinleriyle 17 taslak planı. Hiçbiri oluşturulmuş DB revizyonu değildir.
- `social-correction-audit-v2-20261001/`: değişen tabakalaşma sorusunun ham yeni
  Gemini/DeepSeek koşuları.
- `social-review-handoff-v2-20261001/report.json`: 24 soru, 120 seçenek gerekçesi,
  beceri önerileri, kaynak geçmişi, model sonuçları ve açık kabul sınırları.
- Aynı klasörde `review-sheet.md`: soru ve şıkların tamamıyla okunabilir teslim.
- Aynı klasörde `manifest.json`: dosya bayt hash'leri; 16 eski içerikte geçerli
  ham koşular ile bir yeni içerikte yeni koşular ayrı ayrı bağlıdır.
- `social-final-live-check-20261001.json`: 14:27–14:28 UTC salt okunur DB kontrolü.

## Son içerik düzeltmesi ve model kontrolü

Tabakalaşma sorusunun önceki düzeltmesi yalnız çözümü değiştirmişti. Kök ve
doğru şık hâlâ açık sınıf/kapalı sınıf ile meritokrasi kavramlarını karıştırmaya
açıktı. **v2'de kök ve bütün seçenekler açık/kapalı toplumsal tabakalaşma ve
hareketlilik üzerinden yeniden yazıldı.** B indeksi korundu. Açık sistemin
herkese eşit fırsat veya yalnız kişisel performansla başarı getirdiği iddiası
kullanılmadı. Önceki 16 önerinin içerik ve metadata payload'ları aynı kaldı.

Yeni ayrım [MEB Sosyoloji, basılı s.167](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/sosyoloji1/sec/unite2/files/basic-html/page113.html)
ve [OpenStax, tabakalaşma ve meritokrasi bölümleri](https://openstax.org/books/introduction-sociology-3e/pages/9-1-what-is-social-stratification)
okunarak karşılaştırıldı. Kaynak metinleri dış LLM denetimine gönderilmedi;
modeller yalnız özgün soru adayını gördü. Açık erişim, ticari çoğaltma veya kitap
korpusunu AI sistemine aktarma izni olarak kaydedilmedi.

Son 17 adayın her biri `gemini-2.5-pro` ve `deepseek-v4-pro` tarafından
`APPROVED`: **102/102 kör örnek anahtarla, 34/34 çözüm denetimi anahtarla
eşleşiyor; başarısız sonuç yok.** Yeni metin için iki sağlayıcıda toplam
10 ek gerçek HTTP isteği yapıldı. Önceki 170 istekle toplam 180 istektir;
son paket 180 bağımsız oy içermez. Değişen soru için eski model sonucu yeni
fingerprint'e taşınmadı. Model birliği kaynak kabulü veya kalibrasyon değildir.

## Kaynak ve ölçme sınırları

- MEB Sosyoloji PDF'sinin URL'sinde `2023` olsa da **kapağı 2006**:
  [Sosyal Bilimler Lisesi, 9–10. sınıf öğretim programı](https://mufredat.meb.gov.tr/Dosyalar/20233151497595-Sosyoloji%20(1-2).pdf).
  B.4/B.5 tabakalaşma/hareketlilik karşılaştırması ilgili eski ders çerçevesini
  gösterir; güncel TYT kohortu veya başka lise programı kabulü değildir.
  Aramada bulunan 2026 adresi açılırken 404 döndü. PDF metni okundu, web sayfa
  görüntüsü alınamadı; PDF tablosu görsel olarak doğrulanmış sayılmadı.
- TDV ve MEB'in benzer pasajları, TKİ alt sayfaları, aynı MGM tablosunun
  kopyaları ayrı bağımsız tanık olarak çoğaltılmadı. MGM yağış iddiası için
  tek resmî ölçüm zinciri olduğu açık bırakıldı.
- Önceki kaynak raporları eski içerik ve TYT kapsam iddialarına bağlıdır.
  12 çelişkili / 12 eksik geçmiş rapor silinmedi veya otomatik yeşile çevrilmedi.
  Yeni adaylarla karıştırılmaması için teslimde tarihsel kayıt olarak işaretlendi.
- Vestfalya sorusunda belge pasajı, yağış sorusunda tablo verilmediğinden
  bunlar mevcut hâlleriyle yalnız belge/veri çözümleme becerisi ölçüyor diye
  sunulamaz. Ön bilgi ihtiyacı ve okuma yükü kabul sırasında ayrıca seçilmelidir.
- Refleksif düşünce ve bazı diğer maddelerin kolay elenen çeldiricileri için
  uyarı var. Yazar zorlukları korundu; gerçek öğrenci verisiyle ölçülmüş sayılmadı.
- Dört alan keşfi ayrı amaçtır; sosyoloji resmî TYT'de ayrı bir bölüm gibi
  sunulmaz. Resmî TYT tanılaması açılmadı.

## Son canlı durum ve kalan uygulama sırası

14:27–14:28 UTC kontrolünde **24/24 taban revizyon/hash eşleşiyor**, sorular
aktif ve yayımlanmış eski içerikleri aynı. Yeni içeriklerin hiçbiri yayımlanmadı.
Yayımlanmış bu revizyonlarda kazanım bağı hâlâ **0**. 216'nın dört pilot tablosu
canlıda yok. TYT Sosyal release'i `validating`, `diagnostic_enabled=false`;
genel kalite kapısı açık ve `question-quality@2` gerekli.

Kalan işler, ilgili yetki ve kabul kayıtları olmadan yapılmış gösterilemez:

1. Yetkili operatörle güncel **v2** öneriler için önce yazmasız canlı kontrol,
   sonra ayrı yetkilendirilmiş taslak oluşturma. `expectedBase` canlıda yeniden
   denetlenir; 215'in harf düzeltmesi hızlı yayın yolu bu semantik değişikliklere
   uygulanmaz.
2. Gerçek yeni revizyon UUID'si ve PostgreSQL hash'i oluştuktan sonra kaynak
   raporlarını o metne hazırlama ve kabul etme; soru bazlı kazanımları kabul edip
   bağlama. Yerel fingerprint PostgreSQL `jsonb::text` hash'i değildir.
3. Gerçek revizyonla kalite koşusunu çalıştırma. Canlı semantik revizyon yolu
   mevcut bağımsız stage onaylarını hâlâ istiyor; kullanıcı kimliğine bürünerek
   veya SQL ile insan imzası uydurarak geçilmez.
4. İçerik yayını sonrası pilot aday pinlerini yenileme; 216 schema ve uygulama
   dağıtımı, kabul edilmiş kaynak paketinin kaydı ve pilot release'i.
5. Kimlik doğrulanmış öğrenciyle başlatma, cevap, devam/tekrar ve bitirme kabulü;
   eski revizyon/cevapların korunumu. Bu fiziksel/canlı kabul yerel testten ayrı.

Yazmasız kontrol için tek güncel paket:

```powershell
npm run revision:drafts -- --proposals secure/social-correction-proposals-v2-20261001.json --user-id <operator-uuid> --mapping-pending-drafts --out-dir secure/social-v2-live-check
```

`--apply` eklemek canlı taslak yazımıdır; kaynak/insan kabulü veya yayın değildir.
Bu teslimde canlı yazım, push, PR, merge veya deploy yapılmadı. Eski revizyon ve
oynanmış cevaplar değiştirilmedi.

## Bu teslimde tekrar çalıştırılan kontroller

- Taslak/kaynak/pilot araçları: 5 dosya, **53 test geçti**.
- Kaynak sözleşmesi ve Sosyal öğrenci akışı/API: 8 dosya, **96 test geçti**.
- Toplam **149 regresyon testi**; değişmeyen bütün bankayı veya bütün test
  paketini yeniden çalıştırdığımız iddiası yok. İlk araç test komutu yanlış
  Node test çalıştırıcısıyla başlatılmıştı; doğru Vitest config'iyle tekrar
  çalıştırıldı ve geçti.
- Teslim manifestindeki **42 dosyanın SHA-256 hash'i**, 24 canlı pin ve 120
  şık bağlamı doğrulandı. Yeni model koşusunda 10 HTTP çağrısı, 0 başarısız sonuç.
- Özel üç hazırlama/koşu/kapatma betiğinin Node sözdizimi kontrolü geçti.
- Önceki büyük frontend/DB/PostgreSQL/build sonuçları tarihsel raporda korunur;
  bu turda üretim build'i veya disposable PostgreSQL yeniden çalıştırılmadı.
