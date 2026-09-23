# Oyun modu görselleri — ilk konsept seti

14 Eylül 2026. Kullanıcının üç kart yorumu üzerine üretilen görseller, sonraki “ekleyelim güzel olmuş” onayıyla yerel masaüstü/tablet oyun kartlarına eklendi. Aşağıdaki konsept notları ilk aşamanın kaydıdır; güncel entegrasyon ve doğrulama sonucu belgenin sonundadır. Oyun motorları değiştirilmedi.

## Önizlemeler

- **Kule:** [tower-concept-v1.png](tower-concept-v1.png), 2170 × 725.
- **Bil ve Fethet:** [conquest-janissary-concept-v2.png](conquest-janissary-concept-v2.png), 2172 × 724.
- **WordQuest:** [wordquest-concept-v1.png](wordquest-concept-v1.png), 2115 × 743.

Yerleşik Imagegen kullanıldı; CLI/API alternatifi kullanılmadı. Ayrı üretim görevleri aynı sanat yönlendirmesiyle çalıştı: lacivert akademi, hacimli anime esintili resimleme, koyu kenarlar, Kule için mavi/mor, fetih için altın, WordQuest için camgöbeği. Creative Production süreci ortak görsel dil ve ayrı aday incelemesi için kullanıldı; doğrudan pano çağrısı bu oturumda erişilemedi, pano oluşturulduğu iddia edilmez.

Kaynak dosyalar değiştirilmeden kopyalandı. Tam son üretim istemleri ve özgün kaynak yolları [prompts.json](prompts.json) içindedir. Yeniçerinin ilk, başlığı kesilmiş adayı seçilmedi; ikinci özgün üretim seçildi. Kaynak resimle yapılan iki kadraj düzenleme denemesi geçersiz çalışma dizini nedeniyle üretimden önce başarısız oldu.

## Kule: gelecekteki oyun tasarımına temel

Korunacak kimlik: sekizgen koyu taş gövde, dışarıdan dolanan mavi ışıklı merdiven, ayrılabilir görünen kat hacimleri, altın ışıklı tepelik, sisli dağ ortamı.

Mevcut Kule kodu salt okunur incelendi: üç can, artan kat sayısı ve zorluk kademeleri var; görseldeki kat sayısı oyun sınırı değildir. Bu tur bu davranışlar değiştirilmedi.

İlerideki tasarım sırası:

1. Bu taslaktaki mimari kimliği kullanıcıyla netleştirmek.
2. Aynı referanstan ayrı zemin, tekrarlanabilir kat, merdiven, tepelik ve uzak plan varlıkları üretmek.
3. Mevcut kat/can/geri bildirim durumlarını bu parçalar üzerinde göstermek; oyun sonu ve zorluk mantığını görsele bakarak yeniden tanımlamamak.
4. Soru ve seçenekleri okunaklı, ayrı bir arayüz yüzeyinde tutmak; soru yazısını illüstrasyona gömmemek.
5. Animasyon istenirse hareketi azalt tercihine ve klavye kullanımına uygun olarak ayrıca tasarlamak.

**Sınır:** Bu PNG tek katmanlı bir konsepttir. Ayrı oyun katları, sprite atlası, şeffaf parçalar veya animasyonlar henüz hazırlanmadı.

## Kart yerleşimi için kontrol notları

- İncelenen mevcut masaüstü kart sanatı yüksekliği 132px, tablet yüksekliği 116px. Bu ölçüler değiştirilmedi.
- Kule tepesi üst kenara yakın; dikey kırpma yapmadan tam siluet korunmalı. Sabit yükseklik ve kontrolsüz cover kullanımı geniş kartlarda tepeyi kesebilir.
- Yeniçeri v2 başlığı tamamen içerir; küçük kartta yüz daha küçük görünür. Gerçek kart boyutunda kontrol edilmeden son yerleşim onaylanmamalı.
- Yeniçeri stilize tarihsel esinlidir; tarihsel kıyafet doğruluğu iddiası yoktur. Fetih bilgi haritası üzerinden anlatılır, çatışma sahnesi değildir.
- WordQuest'in A/B/C harfleri okunur, kitap ve geçit belirgindir. Kenar kütüphane ayrıntıları küçük ölçekte sadeleştirilebilir; sayfalardaki silik doku öğretim içeriği değildir.
- İllüstrasyonlar farklı temalarda yeniden renklendirilmeyecek; kartın metinleri ve kontrolleri mevcut tema değişkenlerini kullanmaya devam edecek.
- Başlık, açıklama ve butonlar gerçek HTML olarak kalmalı; resimde sahte arayüz ve ilerleme sayısı yoktur.
- Henüz tarayıcıya/kartlara entegre edilmedi; gerçek tablet/masaüstü kırpma, performans ve açık tema testi yapılmadı.

## Değişiklik kapsamı

Yalnızca bu yeni tasarım klasörü eklendi. Mobil, soru motoru, istatistik, kurum, veritabanı ve oturum akışı değişmedi. Var olan diğer çalışma dosyaları korunmuştur. Commit, push ve yayın yapılmadı.

## Onay sonrası yerel entegrasyon

- Üç onaylı PNG değiştirilmeden `public/academy/modes/` klasörüne kopyalandı: `tower-v1.png`, `conquest-janissary-v2.png`, `wordquest-v1.png`.
- Yalnızca `DesktopGamesHome` içindeki oyun kartı illüstrasyonları bağlandı. Mevcut misafir giriş bağlantıları, oturum yükleme durumu ve LGS/WordQuest görünürlüğü korunuyor.
- `next/image` ve mevcut optimizasyon ayarları kullanılıyor. Görseller dekoratif, başlıkları ekran okuyucuya tekrar etmiyor.
- Görsel alanı 2.8:1 oran ve en az 140px yükseklik kullanıyor; üst-alt kırpma yapılmıyor. Yeniçeri için yatay odak yüzde 60.
- Tablet incelemesinde saptanan düşük kaynak çözünürlüğü, panorama kırpmasını hesaba katan `sizes` ile düzeltildi. Ham büyük PNG yerine uygun boyutta optimize yanıt kullanılıyor.
- 27 hedefli test geçti. TypeScript, hedefli ESLint, PNG/orijinal hash karşılaştırması ve CSS ayrıştırma kontrolü geçti.
- Bağımsız Playwright tarayıcısında 1240px orman, 834/768px koyu, 1440px açık tema ve 390px mobil kontrol edildi. Yatay taşma ve sayfa JavaScript hatası yoktu. Üç masaüstü oyun bağlantısı değişmedi; mobilde yeni oyun kartları render edilmedi.
- Son çözünürlük düzeltmesi 768px/DPR2, 1240px/DPR1 ve 1440px/DPR1 ölçülerinde tekrar incelendi. Gerçek optimize resim boyutları, görüntü yüksekliği × DPR gereksinimini karşıladı; kule/yeniçeri üstten kesilmedi.
- Yerel optimize üç resim yanıtı 1240px/DPR1 kontrolünde toplam 35.280 bayt, 768px/DPR2 kontrolünde toplam 82.202 bayttı. Bunlar yalnızca illüstrasyon yanıtlarıdır, toplam sayfa boyutu değildir.

Ekran görüntüleri:

- `C:/Users/sevdi/.codex/visualizations/2026/08/25/01a03aa7-0e5c-7b80-99d4-7d63a086637b/game-art-final-1240-orman.png`
- `C:/Users/sevdi/.codex/visualizations/2026/08/25/01a03aa7-0e5c-7b80-99d4-7d63a086637b/game-art-final-768-dark.png`
- `C:/Users/sevdi/.codex/visualizations/2026/08/25/01a03aa7-0e5c-7b80-99d4-7d63a086637b/game-art-final-1440-light.png`

Bu aşamada tam üretim build'i, gerçek öğrenci/kurum hesabıyla oyun testi veya canlı yayın yapılmadı. Mobil kaynakları, oyun motorları, istatistik ve kurum/veritabanı altyapısı değiştirilmedi; ayrı kat varlıkları ve Kule oyun içi yeniden tasarımı sonraki aşamadır.
