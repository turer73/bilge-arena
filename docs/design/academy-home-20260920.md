# Academy ana sayfa — 20 Eylül 2026

## Kapsam

`/` masaüstü ve tablet giriş sayfası yeniden tasarlandı. `/arena` oyun merkezi,
`/arena/calisma` çalışma alanı olarak kaldı. Yeni route, DB migration veya oyun
kuralı eklenmedi. Oda modu/test ortamına ait önceden kirli dosyalar korunmuştur.

- Bilge portresi, kadın/erkek rehber seçimi ve mevcut cihaz-yerel tercih anahtarı.
- Oyunlar ve Ders Çalış için farklı görsel kartlar ve açıklayıcı eylemler.
- Onaylı Kule, Bil ve Fethet, WordQuest görselleri. Yeni görsel üretilmedi.
- Oda modu, sıralama ve kişiselleştirmeye mevcut rotalardan erişim.
- Varsayılan tanıtımda uydurma XP, seri, kullanıcı veya soru sayacı yok.
- Kule/Fethet için misafir giriş yönlendirmesi korunur.
- Tema değişkenleri; altı temada okunabilen ana buton; azaltılmış hareket desteği.

## Korunan sınırlar

`HomeSurface` aynı anda tek ağaç mount eder. `<768px` ve SSR mevcut ana sayfayı
korur; geniş ekranda hydration sonrasında AcademyHome görünür. Dolayısıyla
ilk HTML hâlâ eski yerleşimdir; bu bir SSR/SEO yeniden mimarisi değildir.

Aktivasyon A/B deneyi `NEXT_PUBLIC_ACTIVATION_EXPERIMENT_ENABLED=true` ise
deneyin akışını değiştirmemek için eski yüzey korunur. Yayın planında bu flag
ve deney geçişi ayrıca kararlaştırılmalıdır. Test ortamında yeni yüzey açıldı.

ISR, metadata/canonical/JSON-LD, CMS sorguları ve SectionWrapper öğeleri
korundu. Hero özel başlık/rozet/logo/CTA/mini_stats alanlarını kullanır.
Yayınlanmış diğer bölüm configleri mevcut yönetilen bileşenlerle gösterilir;
yeni varsayılan vitrin config bulunmadığında kullanılır. CMS bölüm editörleri
ve geçmiş array/object veya description/desc uyumsuzlukları bu işte değişmedi.

## Doğrulama

- Node 22: yeni ana sayfa 9 test; navbar, oyun, çalışma, mobil ve aktivasyon
  regresyonları 72 test: toplam 81 başarılı.
- TypeScript kontrolü başarılı. Hedefli ESLint: hata yok; navbar'daki eski
  effect/setState uyarısı devam ediyor.
- Tarayıcı: 1440px koyu, 1024px açık, 768px tablet ve 390px mobil kontrolü.
  Yatay taşma görülmedi; mobilde eski ağaç doğrulandı.
- Bilge seçimi ve sayfa yenilenmesinde tercihin korunması doğrulandı.
- Oyunlar ve Ders Çalış bağlantıları gerçek tarayıcıda ilgili rotalara gitti.
- Altı temada ana buton metin kontrastı: 5.06:1–8.44:1. Bu ölçüm tüm site
  için erişilebilirlik uygunluk sertifikası değildir.
- Yeni yüzeyde bozuk görsel veya tarayıcı hata overlay'i görülmedi.

Önizleme: http://localhost:3137/ (mevcut özel SSH tüneli açıkken).
Görüntüler `docs/design/previews/home-*.png` altında.

Yalnız ana sayfa arayüz dosyaları izole Klipper test kaynağına aktarıldı.
Commit/push/production deploy yapılmadı. Tam production build veya gerçek
CMS verisiyle yayın kabulü yapılmadı. Test ortamındaki eksik solo sınav
veritabanı bu tasarım çalışmasıyla tamamlanmış değildir.
