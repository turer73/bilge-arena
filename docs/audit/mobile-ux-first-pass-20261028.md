# Mobil UX: ilk uygulama paketi

28 Ekim 2026. Araştırma: D:/Projelerim/bilge-arena-incelemeler/mobil-ux-arastirma-2026-10-28/arastirma.md.
Başlangıç sürümü: a72047fd. CLAIM: 104881 ve kapsam ekleri 104883/104884.

## Davranış

- Bir cevap gönderildiğinde seçilen şık hemen işaretlenir; şık rozeti bekleme
  göstergesine dönüşür ve seçenekler kilitlenir. Durum mesajı ekran okuyucuya
  duyurulur. Mesaj şıkların altında olduğu için beklemeye geçişte şıklar kaymaz.
- Doğrulama başarısızsa seçim korunur; tekrar deneme aynı kanonik seçimi gönderir.
  Soru süresi bu kilitli durumda yeniden başlatılmaz. Sınavın genel süresi
  bağımsız olarak devam eder. Puan ve doğruluk yalnız sunucu yanıtından gelir.
- Oyundan çıkıldıktan sonra sonuçlanan eski gönderim veya süre dolumu isteği
  yeni oyunun cevap kilidini açamaz.
- Mobil lobi başlangıç düğmesi kısa kapsam/konu/seviye özetinin yanında,
  ayrıntılı ayarlardan önce gelir. Mobil keşif kartı lobiden sonraya taşınır.
  Cevaplama düzeni gibi gerekli başlangıç kapıları korunur.
- Mobil lobide Aa bulunur; tercih oyun ekranına taşınır. Aktif pratikte
  okuma ayarı soru süresini duraklatır. Yardım da açıksa süre onun kapanmasını
  bekler. Sınavda sürenin devam ettiği açıkça belirtilir.
- Okuma/yardım açıkken ikinci bir hareketsizlik duraklatması oluşturulmaz.

## Doğrulama

- Node 22 ile ilgili oyun/hook testleri, tip kontrolü ve değişen dosyaların lint
  kontrolü çalıştırıldı. Mevcut tamamlanma effect'i için lint uyarısı bulunuyor.
- İki Playwright senaryosu yerel sunucuda geçti: başlangıç/Aa/sayaç ve
  geciken yanıt/hata/aynı seçimle tekrar deneme. Bu dosya Chromium CI smoke
  komutuna da eklendi.
- Yerel 360×640 misafir lobisinde başlangıç düğmesi 290–344 CSS px aralığında;
  yatay taşma yok. Görüntü: D:/Projelerim/.codex-tmp/mobile-ux-first-pass-20261028/lobby-360x640.jpg.
- Yerel tarayıcıda büyük yazı tercihinin oyuna geçmesi ve Aa açıkken sayacın
  sabit kalması gözlendi. Gecikme/hata/başarı yolu yerel örnek soruyla incelendi.
- Zorunlu pre-push kapısı ayrıca üretim derlemesini ve tüm birim testlerini koşar.
  Son kapı çıktısı ve uzaktaki CI durumu PR üzerinde raporlanır.

## Sınırlar ve kurulum notları

Yerel görünüm misafir hesabı ve örnek soru kullanır; önceki canlı rapordaki
oturum açmış kullanıcı ölçümüyle eşlenmiş bir A/B sonucu değildir.
Fiziksel telefon, Safari, yüzde 200 tarayıcı yakınlaştırması ve gerçek
sunucuda oturum kaydetme kabulü bu pakette yapılmadı. Oturum geri yükleme bu
paketin kapsamı dışındadır.

Kurulumun ilk npm ci çağrısı sistemdeki Node 24 ile engine uyarısı verdi.
Doğrulama ve önizleme projenin istediği Node 22 ile yürütüldü. Yerel önizleme
gerçek servis anahtarı kullanmaz; backgrounds/consent uçlarında eksik anahtar
nedeniyle 500 görüldü. Soru ve notlandırma senaryoları yerel fixture yanıtlarıyla
test edildi. İlk CDP denemelerinde resourceType/temizleme kısıtlarıyla karşılaşıldı;
XHR kalıpları ve boş patterns dizisiyle yerel yakalama temizlendi.

İlk zorunlu tam testte 5737 geçti, iki test başarısız oldu; 60 test mevcut
koşulları nedeniyle atlandı. İki hata, ses kontrolü olmayan Aa düğmesinin eski
erişilebilir adını arayan düello/sosyal-pilot testleriydi. Tam ad beklentileri
güncellendi; ölçekleme kontrolleri korunuyor. Bu başarısız push kaydı
D:/Projelerim/.codex-tmp/mobile-ux-first-pass-20261028/push.log içinde korunur.

Araştırmadaki discovery 2976 için aday düzeltmedir; üretim kabulü değildir.

## 29 Ekim önizleme kontrolü

PR #709'un 90477560 sürümünde CI geçti; Vercel önizlemesinin kaynak commit'i
ayrıca doğrulandı. 360×640 tarayıcıda misafir akışı, büyük yazı tercihi ve
klavyeyle Aa kapatma incelendi. Önizlemenin gerçek sorusunda bağlantı kesilip
geri açıldı: seçim korundu, aynı cevabın tekrarı sunucu tarafından kabul edildi.
Bu kontrol oturum açmış kullanıcıya ait oturum kaydetme kabulünü kapsamaz.

İki kusur bulundu (discovery 2980, takip CLAIM 104887): başarısız gönderimde
hem panel hem toast aynı hatayı gösteriyordu; tekrar denemeden sonra ilk seçili
şık yapışkan başlığın arkasında kalabiliyordu. Aday düzeltmede yinelenen toast
kaldırıldı ve tekrar gönderim başlamadan seçili şık görünümün ortasına getirildi.
Hata paneli, seçenek kilidi ve sunucunun notlandırma yetkisi korunuyor.

Hook/bileşen testleri, yinelenen toast oluşmamasını ve tekrar gönderimin
seçili şıkkı görünür alana getirmesini denetler. Üçüncü Chromium senaryosu,
büyük yazıyla ilk seçeneği işaretleyip hata/başarı sonrasında seçilen şıkkın
başlık ve sonuç paneli arasında kalmasını denetler. Bu senaryodaki notlandırma
yanıtı bir arayüz fixture'ıdır; içerik doğruluğu kanıtı değildir.

Takip düzeltmesinde Node 22 ile ilgili 73 birim/bileşen testi ve üç yerel
Chromium senaryosu geçti. Derleme ve tam test kapısının son çıktısı PR'dadır.
İlk takip commit denemesinde tip kontrolü, test dublörünün yalnız `idle`
döndürecek şekilde dar tanımlandığını yakaladı; `selected` durumu da tanıma
eklendi. Başarısız kapı çıktısı mobile-ux-review-20261029/commit.log içinde korunur.
