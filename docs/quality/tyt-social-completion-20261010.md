# TYT Sosyal hazırlık — tamamlanma kaydı

## Kapsam

2027 hazırlığı için tam kimlikle sabitlenmiş 25 soru; seçilen nötr cevaplama
düzeninde 20 soru. Resmî 2027 sınav sertifikası, tüm bankanın kabulü veya
kalibre edilmiş seviye ölçümü değildir. Eski sosyoloji içeren pilot açılmaz.

## Kalite kanıtı

Kaynak/yıl kabulü bulunan 25 gerçek revizyonun önceki Gemini sonuçları yeniden
puanlandı: tamamı `APPROVED`, bulgu yok. Aynı 25 soru için yalnız cevap anahtarı
değiştirilmiş kontroller, çalıştırılmadan önce `bounded-social-promotion@1`
protokolüyle sabitlendi. 25/25 kontrol reddedildi; kör çözüm özgün doğru cevabı
geri buldu. 125 mantıksal çağrı, bir sağlayıcı tekrarıyla 126 HTTP isteği; kalıcı
transport hatası yok. 150 istek / 2 USD ihtiyatlı hesaplanan tavan aşılmadı.

Önceki 100 mühendislik regresyonu değiştirilmedi. Birleşik 150 gözlemde TP65,
TN84, FP1, FN0; mevcut terfi eşikleri değişmeden geçti. Bu 150 bağımsız doğal
Sosyal sorusu değildir: önceki 100 çoğunlukla DKAB/matematik, 25 temiz sonuç
önceden görülmüş, temiz/bozuk çiftler bağımlıdır. Toplum geneli doğruluk ya da
bağımsız insan-altın inceleme iddiası yapılamaz. Yetki yalnız 25 sabit pin içindir.

125 canlı ham kayıt önceki makbuzlarla birebir karşılaştırıldı. Mevcut
`fromValidationRunRows`, `deriveVerdict`, `assertPromotionEvidence` ve karar
dönüştürücüsü kullanılarak 25 `question-quality@2` kararı kaydedildi. Kaynak
kabulü veya ikinci uzman uydurulmadı. Özel soru/cevap/kanıt dosyaları git dışıdır:
`secure/social-completion-20261010/`.

## Yayın engeli ve düzeltme

İlk normal yayın işlemi tamamen geri alındı: eski kategori eşleyicisi,
`sosyal/TYT/din_kulturu` için tek kazanım bekliyordu. Yeni katalogdaki birden
çok geçerli kazanım nedeniyle, yayıncının revizyon kazanımlarını kopyalamasından
önce hata veriyordu. 25 kaynak/kalite kaydı kaldı; kısmi yayın olmadı.

Yeni migration yalnız TYT Sosyal'in **özel işlem bağlamıyla yetkilendirilmiş
yayın güncellemesinde** eski tahmini atlar. PID, işlem, soru ve `publish`
bağlamı özel tablodan doğrulanır; GUC beyanı yeterli değildir. Tam soru/revizyon,
onay durumu, içerik hash'i, kategori ve geçerli kazanımlar gerekir. Mevcut yayıncı
onaylı kazanımları kopyalar; kaynak/kalite ve ertelenmiş kapsam kapıları değişmez.
Karantina temizliği, diğer sınavlar ve normal otomatik eşleme yolu korunur.

Native testler eski hata + gerçek 217 yayıncı + 142 özel bağlam + 164 kazanım
doğrulayıcı + 220 eski eşleyiciyi çalıştırır. RBAC/kaynak kabulü dar test
fikstürüdür; tam migration zinciri veya gerçek öğrenci kabulü değildir.
CI native testi atlayamaz. Migration uygulaması ve yayın geri okuması ayrıca
gereklidir; bu kodun merge edilmesi öğrenci ekranını kendiliğinden açmaz.

## Kalan yayın sırası

1. Düzeltme için zorunlu CI, merge, migration ve izin/gövde geri okuması.
2. 25 revizyonun normal RPC yayını; eski revizyonları koruma. Beş pasif soru
   aktifleşir; bu sonuç yayın makbuzunda açık tutulur.
3. 2027 hazırlık politikası/havuz/rol kabulü; genel 2026 keşif kapısını açmadan.
4. Yalnız bu havuzdan öğrenci seçimi, değişmez snapshot, iki 20-soru akışı,
   sınırlı sonuç ekranı ve ayrı etkinleştirme kabulü.

## Canlı yayın geri okuması

#585, tüm 11 zorunlu kontrol sonrası `58fd6fdf` olarak merge edildi. Migration
canlıya uygulandı; fonksiyon gövdesi birebir ve doğrudan anon/authenticated/
service_role çağrıları kapalı. Normal yayın RPC'si 25/25 revizyonu yayımladı:
tamamı aktif, yayın işaretçisi ve kazanım projeksiyonu eşleşiyor. 20 eski taban
revizyon `superseded`; beş yeni sorunun önceki tabanı yok. Veri silinmedi.

#585 incelemesindeki 218 yazım yolu uyarısı canlı tetikleyiciyle karşılaştırıldı:
218 yalnız `content,published_revision_id` günceller; tetikleyici yalnız
`game,exam_ref,category,is_active` değişiminde çalışır. Yeni yerel regresyon
aynı UPDATE'in taslakta geçtiğini, izlenen sütun eklenirse reddedildiğini doğrular.

## Öğrenci akışı ve ayrı etkinleştirme

Yeni migration veri yayımlamaz veya politika eklemez. Tam 25 pin + mevcut
kaynak/yıl/kalite kabulü + gerçek tek-sahip rol kabulü + fonksiyon/izin parmak
izi gerekir. `release_tyt_social_preparation_pool` yalnız kendi havuzunun
doğrulanmış politikasını açar. Genel resmî okuyucu hazırlık politikasını dışlar;
2026 yolu ve eski 12 soruluk sosyoloji pilotu değişmez.

`/arena/tani/sosyal-hazirlik` → hazırlık API'si → mevcut 206 oturum/snapshot
sınırı → mevcut `/api/questions/grade` ilk seçim kaydı → `/api/sessions`
atomik tamamlaması. Anahtar ve çözüm yalnız bu kullanıcının kaydedilmiş
cevabından sonra açılır. Gerekçe/inanç/belge alınmaz; sayfa ve API mevcut
hassas alan analitik/reklam/replay engeline dahildir. Hesap değişiminde uçuşta
kalan yanıtlar atılır. İki saat içinde sunucuda kayıtlı ilk seçimlerle devam
edilebilir. Süre, istemci ölçümüdür; psikometrik uygunluk iddiası yoktur.

Geri çekme: `TYT_SOCIAL_PREPARATION_ENABLED=false` ve dağıtım yeni arayüz/API
erişimini kapatır. Tek sorunun karantinası da yeni oturumları kapatır.
Eski snapshot'ları korumak için politikayı rutin geri çekmede `retired` yapma:
206 doğrulayıcısı tarihi oturumda da `released` durumunu arar. Bu sürüm bunu
yeniden yorumlamaz. Hazırlık tekrarları bağımsız ölçüm değildir.

Tarayıcı testi sentetik auth/API yanıtları kullanır; yerel Postgres testleri
gerçek havuz/rol/206/106 fonksiyonlarını, açık RBAC/kaynak fikstür sınırlarıyla
çalıştırır. Bunlar gerçek öğrenci veya fiziksel tablet kabulü değildir.
