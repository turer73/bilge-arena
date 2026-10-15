# Öğrenme ana ekranı ve Bilge — yerel uygulama kaydı

Tarih: 14 Eylül 2026. Bu belge aşağıdaki eski prototip üretim kayıtlarından farklı olarak gerçek uygulamadaki bu yerel çalışmanın durumunu anlatır.

## Kapsam ve çalışma sınırı

- Çalışma alanı: `D:/Projelerim/bilge-arena-academy-desktop`.
- Dal: `feat/academy-desktop-bilge`; başlangıç: `0c219738` (`origin/master` kopyası).
- Tasarım uygulaması: `/arena` öğrenme ana ekranı, 768 px ve üzeri. `/mobil-demo` aynı bileşenin açıkça örnek veri olarak etiketlenen inceleme yüzeyidir.
- Genel giriş/landing sayfası `/` yeniden tasarlanmadı. Kullanıcının “ana sayfa” ifadesi onaylanan Matematik Yolu ekranı olarak ele alındı.
- 768 px altındaki mevcut mobil görünüm, oyun motoru, BilgeChan, profil, kurum/veri tabanı ve diğer sayfaların içerikleri değiştirilmedi.
- `bilge-arena` ve `bilge-arena-visual-polish` çalışma alanlarındaki devam eden değişiklikler alınmadı veya değiştirilmedi. Gelecekte birleştirme sırasında özellikle `mobile-home-demo.tsx` ve `navbar.tsx` birlikte gözden geçirilmeli.
- Commit, push, merge, deploy veya Sites yayını yapılmadı. Daha önce yayımlanmış Sites önizlemesi bu kodun veya yeni erkek ifade setinin güncel hali değildir.
- Yerel Next geliştirme sunucusu `AGENTS.md` ve `CLAUDE.md` rehber dosyalarını otomatik üretti. Bunlar ürün değişikliği değildir; çalışma alanında henüz izlenmeyen dosyalar olarak durur.

## Uygulananlar

1. Akademi manzarası, yeni taçlı/yörüngeli B amblemi ve tek ana eylemli öğrenme kahraman alanı. Konu adımları gerçek mevcut konu bağlantılarını kullanır.
2. Sınav kapsamı ve ders seçimi mevcut veri/tercih akışlarından gelir. LGS/YKS kapsam ayrımı yeniden icat edilmez.
3. Tema ve zemin mevcut `ThemeToggle`, `GlobalBackground` ve `--app-*` değişkenleriyle çalışır. Genel CSS veya mevcut tercih anahtarları değiştirilmez.
4. Bilge destek kartı; kadın/erkek seçimi; 12'şer ifade içeren galeri; duygulara uygun, suçlamayan motivasyon mesajları.
5. Karakter tercihi `bilge-guide-character-v1` altında yalnızca bu tarayıcıda saklanır. Profil resmi, tema veya arka plan tercihi değildir; hesaplar/cihazlar arasında sunucu senkronizasyonu yoktur. Depolama kapalıysa sayfa oturumunda çalışır.
6. Son kullanıcı onayıyla günlük plan masaüstü/tablette öğrenme yolunun ÜSTÜNE taşındı. Kompakt kart; hazır/yükleniyor/erişilemiyor/misafir durumlarını ve gerçek tamamlanma oranını gösterir, tamamlanınca küçülür. `Planı incele` açıklamalı pencereyi açar. Üst kart ve pencere tek `TodayPlanFocus` örneğiyle aynı planı kullanır; açma/kapama ikinci istek oluşturmaz. Gerçek modda plan üst kart için yüklenir; demo gerçek günlük plan çağrısı yapmaz. Ortak bileşenin mevcut varsayılan sunumu ve TYT Sosyal cevaplama düzeni kontrolü korunur.
7. İlerleme erişilemez/yükleniyor/hazırlanıyor durumları görünür; erişilemeyen bilgi sıfır veya tamamlandı olarak gösterilmez. Günlük hedefin mevcut doğru cevap metriği açıkça adlandırılır.
8. Yerel dialog bileşeni, başlıklandırma, Escape/odak geri dönüşü; klavye odak halkaları ve hareket azalt tercihi. Gerçek tarayıcı erişilebilirlik kontrolü henüz yapılmadı.
9. Masaüstü bileşeni dinamik yüklenir. Galeri portreleri galeri açılana kadar ekrana bağlanmaz. Portreler Next Image ile boyutlandırılır; PNG kaynaklar yaklaşık 48 MB tutar ve tamamı ilk açılışta indirilmez.

## Karakter dosyaları ve kaynak kaydı

`public/academy/bilge/female/` ve `public/academy/bilge/male/`: her birinde bir temel portre ve `neseli`, `kutlayan`, `kararli`, `odaklanmis`, `dusunen`, `merakli`, `saskin`, `utangac`, `uzgun`, `yorgun`, `destekleyici`, `hafif-kizgin` dosyaları bulunur.

Erkek ifadeleri Terra ve Luna ile, aynı erkek portresi referans alınarak yerleşik OpenAI imagegen üzerinden üretildi. Görsel kimlik ve özgün dosyalar korunmuştur; set tek tip şeffaf sprite paketi değildir. İfade kataloğu ve destek penceresi tamamlandı; oyun olaylarına otomatik ifade bağlama sonraki ekran tasarımının işidir.

- [Yeni erkek ifade üretim promptları](bilge-male-prompts-20260914.json)
- [Onaylanmış prototip/dişi karakter/manzara geçmişi](academy-prototype-provenance.md)
- [Yeni logo referansı ve sadakat sınırı](BRAND-REFERENCE.md)
- [Temel erkek portresinin eski üretim kaydı](male-portrait-provenance.md)

## Doğrulama

- İlk uygulamada 29 test geçti. Üst plan güncellemesinde 5 dosyada 84 test geçti: masaüstü yerleşimi, gerçek hook ile tek istek/pencere/başlat bağlantısı, yükleme/tamamlanma/erişim ve kapsam değişimi, mevcut günlük plan sözleşmeleri ve mobil ekran. Gerçek ağ yerine yerel test yanıtları kullanıldı.
- `scripts/check-academy-assets.mjs`: 24 ayrı ifade + 2 portre PNG bütünlüğü, dosya varlığı, kare ifade ölçüsü ve CSS ayrıştırması geçti. Farklı dosya hash'i görsel/duygu kalitesinin otomatik kanıtı değildir.
- TypeScript doğrudan kontrolü ve tam `next build --webpack` derlemesi geçti. Derlemede 221/221 statik sayfa üretildi; hedef `/arena` ve `/mobil-demo` route listesinde yer aldı. Derleme yalnızca yerel örnek Supabase adresi/anahtarı ile yapıldı; gerçek servis erişimi veya üretim hazır olma kanıtı değildir.
- ESLint: hata yok. Mevcut navbar'ın route değişimindeki `setState` etkisi uyarısı başlangıç kodunda da var; bu çalışmada değiştirilmedi.
- Yerel `/mobil-demo` HTTP 200 verdi. Bu, ekranın taşma/kontrast/etkileşim testinin yapıldığı anlamına gelmez.
- Tarayıcı görüntü karşılaştırması, gerçek oturumla canlı DB akışı, tüm proje testleri ve üretim ortamı doğrulaması yapılmadı. Sahada kurum testi yürütüldüğü iddia edilmez.
- Windows seçili-sayfa derlemesinin ilk denemesi hedef route üretmedi; ikinci tanı denemesi üretilen route tipleriyle çakıştı. İkisi de tamamlanma kanıtı sayılmadı; bağımlılıklar değiştirilmeden tam yerel derlemeye geçildi.

Yerel örnek ekran: `http://127.0.0.1:3127/mobil-demo` (bu çalışmanın geliştirme sunucusu açıkken). Görsel onay için masaüstü ve tablet genişliklerinde incelenmeli. Yayından önce klavye/dialog, açık-koyu tema, arka plan değişimi, gerçek oturum ve görsel taşma kontrolü ayrıca gerekir.

## Sonraki sayfa tasarımlarının sırası (henüz uygulanmadı)

Kullanıcının son ek talebi: Oyunlar ile Ders Çalış aynı ekranın renk varyasyonları olmayacak; bilgi düzeni, ana eylem ve içerik farklı olacak. [İki ekran için ayrım kararı](game-study-screen-separation-20260914.md). Mevcut `/arena` öğrenme yolu ile menüdeki “Oyunlar” adı arasındaki karışıklık sonraki tasarım adımında çözülecek; bu güncellemede route taşıması yapılmadı.

1. `/arena/[game]`: ders seçiminin ardından kısa oyun kurulumu; tek ana devam/başlat eylemi, ileri/geri hareketinde seçimleri koruma. Masaüstü/tablet üzerinde yan özet, gerçek oyun süre/can/soru kuralları değişmeden.
2. `/arena/calisma`: öğren, soru sor, kazanımı çalış girişlerini ayırma; devam eden kazanım altyapısına çakışmadan bağlanma. Seviye ölçümü ve günlük planın amacı açık anlatılmalı; sonuçsuz kullanıcıya sahte kişiselleştirme sunulmamalı.
3. `/arena/profil`: öğrenim hedefi, kullanıcı avatarı, Bilge rehberi ve görünürlük tercihlerinin ayrımı. Karakterin hesaplar arası kalıcılığı ayrı veri modeli/izin kararı gerektirir.
4. Oyun keşfi ve sosyal sayfalar: Kule/Bil Fethet erişimi, arkadaşlar, paylaşım görünürlüğü ve sıralama. Önce var olan işlev ve yetki sözleşmeleri doğrulanmalı.

Diğer sayfalar için önce görsel tasarım, sonra kod; mobil dönüşüm ve yayın ayrıca ele alınacak. Bu çalışma tüm uygulamanın görsel dönüşümünün bittiği anlamına gelmez.
