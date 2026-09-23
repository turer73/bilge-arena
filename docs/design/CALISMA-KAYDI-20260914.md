# Bilge Arena — yerel tasarım ve kod çalışma kaydı

14 Eylül 2026. Kullanıcının “tüm yaptıklarımızı kaydedelim” talebi üzerine oluşturulan devam noktası.

## Çalışma yeri ve yayın durumu

- Klasör: `D:/Projelerim/bilge-arena-academy-desktop`
- Dal: `feat/academy-desktop-bilge`; mevcut HEAD: `0c219738`.
- Dosyalar yerel çalışma ağacında kayıtlıdır; değişiklikler henüz Git commit'i değildir. Push, merge, deploy ve Sites yayını yapılmadı.
- Yerel inceleme: `http://127.0.0.1:3127/arena`; çalışma ekranı `/arena/calisma`; örnek veri ekranı `/mobil-demo`.
- Başka çalışma alanlarının devam eden kurum veya mobil değişiklikleri bu çalışmaya alınmadı.

## Güncel kararlar ve kayıtlı uygulama

1. Bilgisayar ve tablet tasarımı: 768 px ve üzerindeki ayrı görünüm. Mobil akışın yeniden tasarımı bu aşamanın dışında.
2. Oyunlar (`/arena`) ve Ders Çalış (`/arena/calisma`) farklı bilgi düzeni ve amaç taşır. İlki oyun keşfi, ikincisi günlük plan ve öğrenme yoludur.
3. Mevcut tema/zemin değişkenleri ve kişiselleştirme altyapısı korunur. Rehber karakteri ile hesap profil resmi birbirinden ayrıdır.
4. Yeni taçlı, mavi/camgöbeği, yörüngeli B amblemi; akademi manzarası; altın günlük plan kupası yerel görsel dosyalarındadır.
5. Kadın ve erkek Bilge: iki temel portre ve kişi başına 12 ifade. Destekleyici motivasyon metinleri, galeri ve rehber seçimi kodda bulunur. Rehber tercihi yalnızca tarayıcıda saklanır; cihazlar arası senkronizasyon veya tüm oyun olaylarına otomatik duygu bağlama tamamlandı denmez.
6. Çalışma ekranında kişisel günlük plan üstte; halka içinde ilerleme, öğrenme yolu ve Bilge desteği. Misafir, yükleme ve erişim durumları gerçek ilerleme gibi gösterilmez.
7. Oyun keşfinde Kule, Bil ve Fethet ve WordQuest mevcut rotalarına bağlıdır. Onaylanan kule, yeniçerili harita ve büyülü sözlük çizimleri `public/academy/modes/` içindedir. Kule görseli sonraki oyun içi tasarım için referanstır; oyun motoru bu görsele göre henüz yeniden yapılmadı.
8. Ders oyunlarının ilk renkli/simgeli tasarımı, son kullanıcı düzeltmesiyle **160 px yüksekliğinde küçük ve büyülü** kartlara dönüştürüldü. Matematik, Türkçe, Fen ve Sosyal için dört özgün illüstrasyon üretildi, orijinalleri `public/academy/subjects/` içine kaydedildi ve yerel kartlara bağlandı. Tam promptlar ve hashler de saklandı.
9. Ders seçimi sonrası bilgisayar/tablet oyun hazırlığı ayrı bileşene taşındı: solda mod ve kısa ayarlar, sağda büyülü ders görseli, tur özeti ve ana başlatma eylemi. Bilge rehberi özetin altından başlığın sağına taşındı; geniş ekranda kısa motivasyon metniyle, 768 px tablette yalnız portre olarak görünür. Misafir önizlemesi doğru biçimde 1 soru olarak açıklanır. Sınav/konu giriş bağlantılarının seçimi geri alması ve Pratik moduna geri dönme sorunu yeni masaüstü kontrollerinde giderildi. Mobil ve oyun motoru değiştirilmedi.
10. Altı oyun biçiminin tamamında özgün büyülü sahne bulunur. Son eklenen Blitz şimşek/zaman kristaliyle hızı, Maraton uzun ışıklı akademi yoluyla dayanıklılığı, Boss ise muhafızlı sınama kapısıyla meydan okumayı anlatır. Kart başlıkları ve gerçek soru/süre kuralları HTML olarak korunur; görseller dekoratiftir. Tam prompt, kaynak ve hash kaydı saklandı; 768, 1050 ve 1240 px görsel kontrolleri ile seçili Boss'un daraltılmış dört kart durumu geçti.

## Kaynaklar ve ayrıntılı geçmiş

- [Öğrenme ekranı ve Bilge ilk uygulaması](academy-desktop-handoff-20260914.md) — ilk aşama kaydı; route ayrımı için aşağıdaki sonraki kayıt esas alınır.
- [Oyunlar / Ders Çalış ayrımı ve sonraki yerel uygulama](game-study-screen-separation-20260914.md)
- [Bilge ve manzara üretim geçmişi](academy-prototype-provenance.md)
- [Erkek ifade promptları](bilge-male-prompts-20260914.json)
- [Logo referansı](BRAND-REFERENCE.md)
- [Günlük plan kupası](daily-plan-trophy-provenance.md)
- [Üç oyun modu çizimi ve promptları](game-mode-concepts-20260914/README.md)
- [Ders kartları ilk sürüm ve test kaydı](subject-game-cards-20260914.md)
- [Güncel küçük/büyülü ders kartları ve doğrulama](subject-magic-cards-20260914.md)
- [Dört yeni görselin tam üretim kayıtları](subject-magic-prompts-20260914.json)
- [Güncel masaüstü/tablet oyun hazırlığı ve doğrulama](desktop-game-lobby-20260914.md)
- [Altı mod görselinin üretim promptları ve hashleri](lobby-mode-card-prompts-20260914.json)

## Doğrulama sınırı

Geçmiş aşamaların test/derleme sonuçları ilgili tarihli belgelerde kayıtlıdır. Yeni küçük kartlarda 30 hedefli test, TypeScript ve hedefli ESLint geçti; gerçek tarayıcıda dört bilgisayar/tablet ölçüsü, mobil ayrımı, sınav filtreleri, klavye/dokunma ve hareket azaltma kontrol edildi. Ayrıntılar güncel kart belgesindedir. Yerel tarayıcı ve birim testleri, canlı servis veya kurum pilotu kanıtı değildir. Kurum testi başlatılmadığı için saha verisinin olmaması hata olarak değerlendirilmez.

Bu çalışma tüm eski istek listesinin tamamlandığı anlamına gelmez. Arkadaşlar/paylaşılan profil izinleri, diğer sayfa tasarımları, oyun içi kule yeniden tasarımı ve gerçek hesapla uçtan uca doğrulama ayrıca ele alınmalıdır. API, veri tabanı, soru değerlendirme, ödül/istatistik hesapları ve kurum erişim sözleşmeleri bu görsel düzenlemenin kapsamında değildir.

Son oyun hazırlığı aşamasında 115 hedefli test, TypeScript, hedefli ESLint ve altı varlığın manifest/hash kontrolü geçti. Gerçek tarayıcıda masaüstü/tablet açık-koyu görünümü, Bilge'nin başlık yerleşimi, mobil ayrımı, altı görselin yüklenmesi ve seçili Boss'un daraltıldığında korunması doğrulandı. Giriş yapmış hesapta üst günlük plan/keşif kartlarının yerleşimi henüz doğrulanmadı; ayrıntılar oyun hazırlığı belgesinde kayıtlıdır.

Boss sabit açıklamasındaki “5 zor soru” ifadesi mevcut motor tarafından moda özel bir zorluk filtresiyle garanti edilmiyor. Yeni masaüstü kartında yalnız doğrulanmış 5 soru ve soru başına 45 saniye bilgisi kullanıldı; motor/API değiştirilmedi. Bu ürün sözleşmesi uyumsuzluğu ayrı bir iş olarak ele alınmalıdır.
