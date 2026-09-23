# Bilge Arena — tasarım ve görsel üretim kaydı

## Mevcut tema/zemin sistemiyle uyum

14 Eylül güncellemesi: `D:/Projelerim/bilge-arena` HEAD `0f31c17605f2aa7fbe9ba95dbdc1a28a9c4faea7` kaynak kodu salt okunur incelendi. `globals.css` içindeki altı tema ve `--app-*` değişkenleri `dist/source-theme-tokens.css` dosyasına aynen alındı. `ThemeToggle` tema kimlikleri/etiketleri, `bilge-theme` anahtarı ve statik 12 arka plan kataloğu kullanılıyor. Burası bağımsız bir önizleme olduğundan otomatik canlı kaynak senkronizasyonu yoktur.

Tema ve sayfa zemini bağımsızdır. Zemin anahtarı `bilge-arena-zemin-v1`; profil kartı anahtarı `bilge-arena-profile-background-v1` okunmaz/yazılmaz. Tercihler Sites alan adının tarayıcı depolamasına aittir; bilgearena.com hesabına ve veritabanına bağlanılmaz. Mağaza seçenekleri yalnızca görsel tasarım örneğidir; satın alma veya sahiplik verilmez. Canlı uygulamaya aktarımda mevcut `useUIStore`, `GlobalBackground`, `resolveOwnedSelection`, profil senkronizasyonu ve dinamik video kataloğu korunmalıdır. Önizleme dinamik video kataloğunu taklit etmez veya ona erişmez.

Açık tema için mevcut açık-zemin logosu kullanılır. Hareketi azalt tercihi zemin animasyonlarını durdurur. İllüstrasyonların renkleri ve Bilge kimliği değiştirilmez; koyu resim üstündeki yazı açık kalır. İfade görsellerinin bir kısmı opak laciverttir; şeffaf üretim varlığı oldukları iddia edilmez.

Bu çalışma canlı Bilge Arena deposundan bağımsızdır. Mobil uygulama değiştirilmedi. Tüm ilerleme değerleri örnek veridir. A ve B aynı ders kapsamını kullanır; görsel ağırlıkları farklıdır. Sites yalnızca özel tasarım incelemesi içindir.

## Üretim yolu

Güncel logo: kullanıcının son marka panosuna göre taçlı, cyan/altın yörüngeli ve yıldızlı B amblemi, `BİLGE ARENA` beyaz/turkuaz yazı ve `ÖĞREN · KAZAN · YÜKSEL` alt satırı kullanılır. `brand-crest-orbit.png` gerçek alfa içerir. Üretim promptları, sadakat sınırı ve doğrulama [BRAND-REFERENCE.md](BRAND-REFERENCE.md) dosyasındadır. Aşağıdaki eski şeffaf kalkan/HTML marka açıklaması önceki dengeleme adımını anlatır; o dosyalar korunmuş ancak masaüstü başlığında yeni amblem kullanılmaktadır.

### Masaüstü/tablet görsel dengelemesi

`desktop-polish.css` yalnızca 768 px ve üzeri için yüklenir. Altı kaynak tema ve on iki zemin tercihi korunur; `--studio-*` sunum değişkenleri mevcut `--app-*` değerlerinden türetilir. Kartlar ve ikincil metinler nötrleştirilir, vurgu rengi aktif ders/konu ve ana eylemde yoğunlaştırılır. Kaynak tema dosyası veya kalıcı tercih anahtarları değiştirilmez. Zemin örtüsü bu tasarımda yüzde 86'dır; bu, canlı uygulamanın yüzde 75 örtüsüne önerilen bir görsel farktır ve otomatik canlı değişiklik değildir.

Masaüstü logosu, mevcut `icon-transparent.svg` dosyasının aynısı olan `brand-mark.svg` ile HTML marka yazısından oluşturulur. Yeni bir kalkan çizilmedi, orijinal logo dosyaları değiştirilmedi. Mobil önizlemenin önceki logo görseli ve açık/koyu seçim davranışı korunur. Üst kale şeridi düşük opaklıklı gri tonlu bir mimari izdir; aynı görselin ikinci kez ana illüstrasyon gibi görünmesi azaltılır. Bilge portresi daha küçük, destekleyici bir alan kaplar; motivasyon metni, galeri ve 12 ifade korunur. Yeni raster üretimi yapılmadı.

Doğrulama: yerel dosya/JS/CSS kontrolleri ve tek HTTP açılış kontrolü; tarayıcı görsel regresyon testi istenmedi ve yapılmadı. Canlı Bilge Arena deposu, mobil uygulama ve gerçek öğrenci verisi değişmedi.

Ders seçimi satırının sağında referans PNG'deki gibi kenarları zemine karışan akademi manzarası kullanılır. Mevcut manzara varlığı yeniden kullanılır; yeni görsel indirmesi veya üretimi yoktur. İki eksenli alfa maskesi, seçili tema ve bağımsız arka planın görünmesini sağlar. Dekoratif katman butonları engellemez, satır yüksekliğini artırmaz ve yalnızca 768 px üzerindeki masaüstü/tablet önizlemesinde görünür. B yönünde ve açık temada opaklık azaltılır. Mevcut motivasyon yazısı korunur.

Yerleşik OpenAI imagegen kullanıldı. Renderhane/API CLI kullanılmadı. Üretilmiş arayüz ekran görüntüsü kullanılmaz: metinler, logolar, butonlar ve yerleşim HTML/CSS olarak oluşturuldu. Akademi manzarası ve Bilge görselleri raster üretimdir. Logo ve Inter Bold mevcut Bilge Arena görsel dosyalarından alınmıştır.

## Manzara promptu

Use case: stylized-concept. Text-free panoramic website hero illustration for Bilge Arena, a premium fantasy learning academy. A majestic fantasy academy castle on a distant mountain in the RIGHT third, a winding softly luminous blue path leading up through mist to the academy. Layered mountain silhouettes and a deep atmospheric valley at night; distant mountain edges dissolve into indigo fog. High-quality hand-painted premium game environment illustration, rich painterly depth, elegant restrained fantasy, intricate yet readable architectural silhouette. 16:9 wide landscape panorama. Reserve the LEFT 55 percent as calm dark navy mist and subtle low-detail atmospheric negative space for a real HTML headline to be placed later; do not paint text. Main castle focal point confined to right third. The softly blue-lit winding path starts low in the middle-right and leads the eye towards the castle. Wonder, aspiration and quiet discovery. Soft cool atmospheric moonlight, small warm golden window lights, delicate blue path glow. Midnight navy, deep indigo, muted slate blue, restrained electric blue along the path, small warm gold accents. No people, characters, text, logos, UI, frames, watermarks or neon grid.

## Bilge portre yönü

Use the supplied Bilge Arena reference as a character identity anchor: navy-blue gathered ponytail, amber eyes, gold hair clip, navy high-collar academy jacket with gold trim and B crest. Preserve face and proportions. Friendly confident smile, upper-body 3:4 portrait, hands outside frame, subtle dark academy window background. Premium anime illustration. No UI, text, watermark or sexualization.

## İfade setinin ortak promptu

Using the generated Bilge portrait as the sole identity reference, preserve identical face, facial proportions, amber eyes, navy-blue ponytail, gold hair clip, navy-gold academy jacket and B crest. Create one square upper-body bust with the specified expression, consistent framing and premium anime rendering. No text, UI, watermark, extra characters or sexualization. A genuine transparent background was initially requested. If returned as baked checkerboard, a single background-only repair uses solid midnight navy #0d1930, retaining character and expression. Genuine transparent outputs are preserved. These images are a mixed opaque/transparent preview set, not a uniform production-ready transparent sprite pack.

## İfade değişkenleri

- neseli: joyful warm open smile.
- kutlayan: celebrating with one small victory fist by the shoulder.
- kararli: determined, confident eyebrows and small closed-mouth smile.
- odaklanmis: focused, attentive eyes and neutral closed lips.
- dusunen: thoughtful, finger near chin when natural.
- merakli: curious slight head tilt and raised eyebrow.
- saskin: pleasant surprise, open eyes and small O mouth.
- utangac: shy gentle blush and soft closed-mouth smile.
- uzgun: gentle disappointment and concern, no tears.
- yorgun: tired soft eyelids, still kind.
- destekleyici: warm, reassuring and empathetic.
- hafif-kizgin: playful frustration at a difficult puzzle, no threat, aggression or blaming the viewer.

## Kullanım sınırları

Yüz ifadeleri otomatik duygu tanıma değildir. Öğrencinin duygusunu tahmin eden veri işleme yoktur. Yanlış cevaba kızgın Bilge gösterilmez. Üzgün Bilge, öğrencinin rehberi hayal kırıklığına uğrattığı izlenimini vermek için kullanılmaz. Yorgun/üzgün bağlamları yalnızca açıkça söylenen ihtiyaca empati için değerlendirilir. Motivasyon metinleri gerçek başarı veya öğrenme garantisi vermez.
