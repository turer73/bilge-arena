# Bilge Arena görsel iyileştirme: durum ve kalan işler

Tarih: 24 Eylül 2026. Kaynak: kullanıcının 17 bölümlük “Bilge Arena Görsel İyileştirme Yolu” planı. Bu belge uygulama ve doğrulama takibidir; canlıya alınmış veya öğrenme etkisi kanıtlanmış bir sonuç beyanı değildir.

## Durum ilkesi

- **Kodda**: Aday çalışma alanında mevcut; yayınlandığı anlamına gelmez.
- **Doğrulandı**: Belirtilen otomatik test veya görsel kabul yapıldı.
- **Canlı**: Üretim dağıtımı ve gerçek kullanıcı akışı ayrıca doğrulandı.
- Her madde ancak kendi kabul ölçütü ve kanıtı kaydedilince kapatılır. Önizleme, mock veri ve yerel test canlı kabul yerine geçmez.

## Uygulama sırası

### 1. Yönetim ve soru kalitesi — önce bunu bitir

Mevcut adayda: teknik kimlikleri kısaltma/kopyalama, Türkçe durum ve bulgu etiketleri, sabit filtreler, kanıt görünümü, karar eylemlerini ayırma, yönetim ikonları ve küçük metinleri büyütme üzerinde yerel değişiklikler var. Kurum/öğretmen özetlerindeki küçük metinler ve teknik gerekçe kodları da iyileştirildi.

24 Eylül yerel doğrulama: Son değişikliklerden sonra 485 test dosyası ve 4.346 test, tip denetimi, üretim derlemesi ve `git diff --check` geçti; lint 0 hata ve 21 uyarı verdi. Soru düzenleme penceresinin klavye odağı/Escape akışı regresyon testiyle doğrulandı.

Kullanıcının dört yönetici ekranı görüntüsü `bilgearena.com` canlı sitesinden alındı. Canlıda ham bulgu kodları, tam UUID'ler ve eski itiraz görünümü hâlâ mevcut. Bunlar aday dalın görsel kabulü değildir. Adayda teknik kodlar varsayılan listede Türkçe etiketlerle sunuluyor; tam kod/kimlik kanıt ayrıntısında veya kopyalamada korunuyor. Canlı TYT Sosyal göstergesi `0/1316` eksik kanıt gösteriyor; bu gerçek yayın hazırlığı eksikliğidir, görsel düzeltmeyle kapanmaz. Yerel adayda `.env.local` ve yetkili yönetici oturumu bulunmadığından oturum açılmış masaüstü/tablet önizlemesi yapılamadı. Bu nedenle başlık tamamlanmış sayılmıyor; kullanıcı onayıyla aday dalı yalnız önizleme için commit edilip push edilebilir. PR, merge ve canlı dağıtım ayrı karardır.

Kapanış ölçütleri:

- [ ] Değişen yönetim/kurum ekranlarında masaüstü ve tablet görsel kabulü; uzun kimlik, filtre, kanıt ve karar durumlarını gerçekçi örneklerle kontrol et.
- [ ] Kritik olmayan kırmızı eylemleri ve 44×44 px altındaki karar/dokunma hedeflerini tarayıp düzelt.
- [ ] Görünür teknik kodların Türkçe karşılığını, tam kimliğe erişimi ve kopyalama davranışını kontrol et.
- [x] İlgili testler, tam test paketi, tip denetimi, lint ve üretim derlemesini **son değişikliklerden sonra** yeniden çalıştır.
- [ ] Aday dalı güncel `origin/master` ile karşılaştır; yeni değişiklikleri ve kullanıcıya ait kirli dosyaları koru.
- [ ] Kapsam ve commit SHA açıkça kaydedildikten sonra yalnız aday dalını push et. PR/merge/deploy ayrı karardır.

### 2. P0 — öğrenci odağı ve ortak görsel dil

- [ ] **Profil:** üst ve istatistiklerde tekrarlanan altını azalt; ham “doğru oranı”nı öğrenci ana kartından çıkar; son gelişim/tekrar/kazanım kanıtlarıyla “Öğrenme Özeti” oluştur. XP ve seviye korunur. Veri yoksa başarı uydurma.
- [ ] **Ana görev:** Öğren/Pratik yüzeylerinde günlük planın tek baskın CTA olmasını sağla. “Konuya git” ve diğer seçenekleri ikincil düzeye indir; misafir/plan kullanılamıyor durumlarını ayrı doğrula.
- [ ] **Yüzey sistemi:** ana kart, standart kart, bilgi kutusu, uyarı kutusu ve tıklanabilir satır için ortak token/sınıf sözleşmesi kur; kalın kenarlık/kabartma gölgeyi seçili/aktif durumlarla sınırla.
- [ ] **Tipografi ve ikon:** öğrenci mobil/masaüstü yardımcı metnini okunur ölçeğe getir; navigasyon ve durum ikonlarını birleştir. Ders rengi, durum rengi ve CTA renginin anlamını ayır.
- [ ] **Rol ve ödül dili:** kurum/sınıf kartlarını yalnız yetkili kullanıcıya göster; altın/coin, XP ve seviyeyi ekranlar arasında tutarlı adlandır.
- [ ] **Soru ekranı:** geniş ekranda soruyu merkezî ve baskın tut; zamanlayıcı/can görünür ama ikincil olsun; boş sağ alanı gereksiz panellerle doldurma.

### 3. P1 — ekran bazlı düzenleme

- [ ] **Pratik/Bugünün 15’i:** plan dağılımını rozet yığını yerine kısa, açıklanabilir özetle göster; mobil kaydırma ve CTA erişimini doğrula.
- [ ] **Bilge Asistan:** ana tipografiyle uyum, kısa yanıt blokları, görünür öğrenci giriş alanı ve anlaşılır AI uyarısı sağla.
- [ ] **Lig ve oda:** lig durumunu kanıtla birlikte göster; oda boş durumuna bağlamsal eylemleri ekle, üstteki kararlarla gereksiz tekrar yapma.
- [ ] **Kurum/öğretmen:** karar güvenli kanıt, karşılaştırma, filtre ve açıklamayı yoğun veride tablo/grafikle sun; tek öğretmen puanı üretme.
- [ ] **Soru Kalitesi:** gerçek durum/kanıt çeşitleri ve klavye ile karar akışını görsel kabulden geçir.

### 4. P2 — kişiselleştirme ve olgunlaştırma

- [ ] LGS/YKS için doğrulanabilir yoğunluk seçenekleri ve öğrenci tarafından seçilebilen Odak görünümü tasarla; maskot, parlama ve XP/lig vurgusu azaltılabilsin.
- [ ] Karakter kullanım rehberi yaz: bağlam, boyut, poz, konuşma uzunluğu ve yanlış cevapta suçluluk üretmeme sınırları.
- [ ] Açık/koyu tema eşlemesini tipografi, köşe, ikon, durum, CTA ve navigasyon düzeyinde belgeleyip uygula.
- [ ] Boş durumlar, mikro animasyon, kişiselleştirilebilir pano ve küçük lig grupları için ayrı kullanıcı kabulü tanımla.

### 5. Çapraz erişilebilirlik ve kabul

- [ ] Gerçek render üzerinde normal/koyu kontrastı ve renk körlüğünde durum ayırt edilebilirliğini ölç.
- [ ] 360/390 px mobil, 768/834 px tablet, masaüstü; büyük font ve %200 yakınlaştırmada taşma/örtüşme kontrolü yap.
- [ ] En az yaklaşık 44×44 px dokunma alanı, klavye sırası/odak, Escape ve odak iadesi, azaltılmış hareket, zamanlayıcının renk dışı uyarısı ve dikkat dağıtıcıları kapatma akışını doğrula.
- [ ] Her ana ekrana planın 17. bölümündeki on soruluk karar kontrolünü uygula; ekran görüntüsü, ölçüm ve açık sorunları kaydet.

## Yayın sınırı

Bu görsel planın kapanması; CI, veritabanı, canlı dağıtım ve gerçek kullanıcı etkisiyle ayrı ayrı değerlendirilir. Tasarım değişikliklerini sırayla tamamla, ardından ertelenen işlevsel/altyapı hatalarını ayrı hata listesinde ele al. Commit veya push, merge ve canlıya alma anlamına gelmez.
