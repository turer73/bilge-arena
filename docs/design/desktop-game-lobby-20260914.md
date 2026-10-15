# Ders seçimi sonrası oyun hazırlığı — yerel uygulama

14 Eylül 2026 çalışma oturumu. Dal: `feat/academy-desktop-bilge`.

## Yapılan düzenleme

- 768 px ve üzerinde ayrı masaüstü/tablet görünümü: solda oyun biçimi ve kısa soru ayarları, sağda tur özeti ve tek ana başlatma eylemi.
- Klasik, Deneme ve Pratik öncelikli; Blitz, Maraton ve Boss ikincil açılır seçeneklerdir. Seçili ikincil mod kapalı durumda da görünür.
- Altı oyun biçiminin tamamına metinsiz özgün sahneler eklendi: Klasik için mavi eğitim düellosu, Blitz için şimşek ve zaman kristali, Maraton için uzun akademi yolu, Boss için muhafızlı sınama kapısı, Deneme için altın kum saatli sınav masası ve Pratik için camgöbeği kitap/hedefler. İsim, soru ve süre resme gömülmedi; erişilebilir HTML olarak kaldı.
- Önceden onaylanan küçük/büyülü ders görselleri ile seçilebilir kadın/erkek Bilge yeniden kullanılır. Oyun biçimi sahneleri yerleşik Imagegen ile aynı büyülü akademi dilinde üretildi. Yüzey renkleri mevcut tema değişkenlerini kullanır.
- Bilge rehberi sağ özetin altındaki kopuk konumdan oyun hazırlığı başlığının sağına taşındı. 1240 ve 1050 px'de portre, “Bilge yanında” etiketi ve kısa motivasyon metni birlikte görünür; 768 px'de yer kazanmak için metin erişilebilir biçimde gizlenir, portre ve ses düğmesi kalır. Rehber çoğaltılmaz.
- Sınav kapsamı, konu ve zorluk mevcut kontrollü callback'lerle değiştirilir. Süre, can ve soru sayısı mevcut mod yapılandırmalarından okunur.
- Akıllı deneme, ana başlatmayla yarışan ikinci büyük kart yerine ayarların altındaki kapalı açıklama alanındadır. Mevcut kart ve başlatma davranışı korunur.
- Misafir motoru bir önizleme sorusu verdiği için sağ özet ve düğme bunu açıkça söyler. Mod kartlarındaki sayılar tam turun yapısıdır; önizleme ilerleme kaydı veya ödül sözü vermez.
- Başlatma engeli, giriş bağlantısı, kota ve yükleme hatası önceki prop sözleşmelerine bağlıdır. TYT Sosyal V2 açıkken sabit 20 soruluk bölüm ve sabit filtreler korunur. Diğer denemelerde mevcut motorun konu/zorlukla havuz daraltma davranışı doğru açıklanır.

## Giriş bağlantıları ve seçimlerin korunması

Tarayıcı denemesinde `?exam_ref=TYT` giriş bağlantısının, kullanıcının LGS seçimini geri aldırdığı görüldü. Yeni masaüstü kontrolü ilgili URL parametresini Next ile bütünleşen native History üzerinden eşitler. Geçersiz eski konu temizlenir; diğer parametreler ve hash korunur.

`?mode=practice` ile girildikten sonra Klasik seçiminin eski sorgu efektiyle yeniden Pratik yapılması da gerçek tarayıcıda yakalandı. Son çözüm, açık kullanıcı seçimini sorgu güncellendikten sonra mevcut callback'e iletir. Genel bir URL mod API'si eklenmedi; `source` ve program parametreleri korunur. Bu düzeltmeden sonra modun başka bir ayar değişikliğinde de korunduğu tarayıcıda doğrulandı.

## Dosyalar

- `src/components/academy/desktop-game-lobby.tsx`
- `src/components/academy/desktop-game-lobby.module.css`
- `src/components/academy/__tests__/desktop-game-lobby.test.tsx`
- `src/components/game/lobby.tsx`: yalnızca geniş ekran yönlendirmesi ve prop tipi dışa aktarımı; eski JSX `LegacyLobby` içinde aynen bırakıldı.
- `public/academy/lobby-modes/{classic,blitz,marathon,boss,deneme,practice}-v1.webp`: 960×420, web için optimize edilmiş dekoratif sahneler.
- `docs/design/lobby-mode-card-prompts-20260914.json`: tam üretim promptları, özgün kaynak yolları, boyutlar ve SHA-256 değerleri.

Mobil akış, `GameClient`, quiz motoru/hook'ları, API'ler, veri tabanı, ödül/istatistik hesabı ve kurum yetkilendirme/soru sözleşmeleri değiştirilmedi.

## Son doğrulama

- 6 test dosyası, **115 test geçti**: yeni hazırlık ekranı, Bilge başlık yerleşimi ve görsel/erişilebilir ad sözleşmesi, eski lobi, mobil akış, quiz-engine yerleşimi, GameClient sınav kapsamı ve useQuizGame regresyonları.
- `tsc --noEmit --incremental false` geçti.
- Değişen üç TSX dosyasında ESLint geçti.
- Yeni CSS PostCSS ile ayrıştırıldı; `git diff --check` geçti.
- Yerel Chromium: 1240×912 Matematik/orman, 1440×900 Türkçe/açık, 834×912 Fen/koyu ve 768×768 Sosyal/açık. Bu misafir örneklerinde yatay taşma ve sayfa hatası yok; görseller yüklendi; ana başlatma eylemi ilk görünümde erişilebilir.
- 390×844 mobilde mevcut mobil akış var, yeni masaüstü bileşeni yok.
- TYT → LGS → konu → zorluk seçimi ve girişte Pratik → Klasik geçişi gerçek tarayıcıda doğrulandı. İkinci geçişte `source=program` korunuyor; başka ayar değişikliğinden sonra Klasik seçimi devam ediyor.

### Görsel kayıtlar

- [Masaüstü Matematik](previews/lobby-final-1240-matematik.png)
- [Geniş ekran Türkçe](previews/lobby-final-1440-turkce.png)
- [Tablet Fen](previews/lobby-final-834-fen.png)
- [Dar tablet Sosyal](previews/lobby-final-768-sosyal.png)
- [Görselli kartlar — 1240 px koyu](previews/lobby-mode-art-1240-dark.png)
- [Altı mod — 1050 px açık](previews/lobby-mode-art-1050-light-expanded.png)
- [Altı mod — 1051 px koyu](previews/lobby-mode-art-1051-dark-expanded.png)
- [Görselli kartlar — 768 px açık](previews/lobby-mode-art-768-light.png)
- [Altı özgün sahne — 1240 px koyu](previews/lobby-all-six-art-1240-dark.png)
- [Boss seçili ve daraltılmış — 1240 px koyu](previews/lobby-boss-collapsed-1240-dark.png)
- [Altı özgün sahne — 1050 px açık](previews/lobby-all-six-art-1050-light.png)
- [Altı özgün sahne — 768 px açık](previews/lobby-all-six-art-768-light.png)
- [Korunan mobil akış — 390 px açık](previews/lobby-mobile-390-light.png)
- [Bilge başlıkta — 1240 px koyu](previews/lobby-header-bilge-1240-dark.png)
- [Bilge başlıkta — 1050 px açık](previews/lobby-header-bilge-1050-light.png)
- [Kompakt Bilge — 768 px açık](previews/lobby-header-bilge-768-light.png)

Son kart kontrolünde genişletilmiş görünümde altı dekoratif resmin tamamı yüklendi; resimlerin `alt` değeri boş ve kapsayıcıları ekran okuyucudan gizli kaldı. Düğmeler doğal biçimde “Klasik, 10 soru, 30 sn / soru” ve “Boss, 5 soru, 45 sn / soru” gibi adlandırıldı. 1240 px'de kartlar 258×132, 1050 px'de 222×124 ve 768 px'de 128×124 ölçüldü. Başlatma alanının altı sırasıyla 690,5 px, 689,2 px ve 617,2 px idi; yatay taşma yoktu. Boss seçildikten sonra alan daraltıldığında Klasik, Boss, Deneme ve Pratikten oluşan dört kart korundu; Boss seçili kaldı ve sağ özet güncellendi. 390 px mobil DOM'unda yeni masaüstü resimleri bulunmadı.

Son responsive `sizes` hesabından sonra bileşenin 16 testi, TypeScript ve ESLint yeniden geçti. DPR2 tarayıcı kontrolünde 768 px'deki 127 px ve 1050 px'deki 222 px kartların her biri 640 px optimize kaynak aldı; kaynak genişliği iki kat ekran gereksinimini karşılıyor.

Bilge başlık yerleşimi eklendikten sonra bileşenin 17 testi, TypeScript, hedefli ESLint ve CSS/varlık kontrolü geçti. Gerçek Chromium'da 1240, 1050 ve 768 px için rehber başlığın içinde, sağ özette ikinci kopya yok, portre yüklü, başlık çakışması ve yatay taşma sıfırdı. 768 px'de yalnız rehber metni görsel olarak gizlendi.

Tarayıcı sırasında mevcut `/api/backgrounds`, misafir `/api/quests` ve dış analitik çağrıları yerel/ağ kısıtları nedeniyle hata verdi veya iptal oldu. Bunlar yeni kart varlıklarından bağımsızdır. Yeni `/academy/lobby-modes/` görsellerinde başarısız istek, Next hata katmanı veya sayfa JavaScript hatası görülmedi.

## Açık sınırlar ve sonraki iş

- Gerçek oturum açmış hesapla başlatma, soru çözme ve sonuç/ödül kaydı denenmedi. Kurum pilotu yapılmadı; yerel testler bu sonuçların kanıtı değildir.
- QuizEngine'in oturum açmış kullanıcı için lobinin üstünde çizdiği mevcut günlük plan/keşif kartları bu değişikliğin dışında kaldı. Bu yüzden giriş yapmış tüm kullanıcılar için başlatmanın kaydırmadan göründüğü iddia edilmez. Gerçek hesapta üst alanın ayrıca gözden geçirilmesi gerekir.
- Boss sabit tanımındaki “5 zor soru” ifadesi motor tarafından moda özel bir zorluk filtresiyle garanti edilmiyor; motor mevcut kullanıcı/adaptif zorluk seçimini kullanıyor. Yeni masaüstü kartı bu nedenle yalnız doğrulanmış “5 soru · 45 sn / soru” bilgisini verir. Bu ürün sözleşmesi uyumsuzluğu ayrı iş olarak çözülmelidir; görsel aşamada motor değiştirilmedi.
- Tam üretim derlemesi ve canlı kontrol bu aşamada yapılmadı. Push, merge, deploy ve Sites yayını yok; değişiklikler yerel çalışma ağacında, commit yapılmadı.
- Sonraki görsel aşama: soru ve sonuç ekranlarının aynı oyun diliyle ele alınması; değerlendirme, veri kaydı ve kurum sözleşmelerine dokunulmaması.
