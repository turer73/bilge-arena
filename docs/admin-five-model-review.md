# Admin beş model raporu

## Bu aşamanın kapsamı

`/admin/soru-kalite` ekranında, otomatik doğrulama listesindeki kanıt ayrıntısında
ve içerik yönetişimi revizyon ayrıntısında **İnsan onayı · Beş model raporu** bulunur.
Hedef modeller: **DeepSeek, Gemini, Terra, Luna, Sol**. Ders veya sınav türüne özel
bir istisna yoktur; incelenen sorunun gerçek seçenekleri kullanılır.

Bu değişiklik yalnız mevcut kayıtların yöneticiye sunulmasıdır. Veritabanı şeması,
RPC'ler, RLS, MFA, yetkiler, özellik bayrakları, mevcut otomatik politika,
kalibrasyon ve yayın kapıları değişmez. Yeni migration veya servis gerekmez.
Raporu açmak model çağrısı yapmaz, ücretli tarama başlatmaz ve veri yazmaz.

## Rapor nasıl okunur?

- `N/5`, aynı sorunun seçili revizyonu ve içerik hash'i için geçerli kaydı olan
  farklı model sayısıdır. Aynı modelin üç örneği üç model sayılmaz.
- Yalnız `blind_solver` kayıtları bağımsız çözüm kanıtı olarak ele alınır.
  Karşı görüş incelemesi ve çözüm denetçisi rolleri ayrı model yerine geçmez.
- Model kimliği, kısa çözüm özeti, seçtiği cevap ve kayıt zamanı ayrı gösterilir.
  Sağlayıcının ham yanıtı, prompt, özel girdi anlık görüntüsü ve hata gövdesi
  tarayıcıya gönderilmez.
- Eksik kayıt **çalıştırılmadı / kayıt yok** anlamındadır. Ağ hatası, soru kusuru
  değildir. Yanlış revizyon/hash/politika veya geçersiz çıktı tamamlanmış sayılmaz.
- Uzlaşma ve bankadaki anahtarla eşleşme farklı bilgilerdir. Beş model aynı yanlış
  cevabı verebilir; `5/5` bilimsel doğruluk veya insan onayı garantisi değildir.
- Revizyon ayrıntısı o revizyona aittir. Soru kimliğinden açılan rapor mevcut
  yayınlanmış revizyonu esas alır; kaydedilmemiş editör değişikliklerini denetlemez.
- Sorgu sınırına ulaşılması, tamlık iddiasını engeller; sessizce eksik sonuçla
  bütün modeller doğrulanmış sayılmaz.

## İnsan kararı ve yayın

Rapor gözden geçirildikten sonra mevcut içerik yönetişimi alanındaki insan
incelemesi kullanılır. Sistemdeki iki aşamalı, farklı yetkili inceleyici kuralı
ve ayrıca yayın izni **aynen korunur**. Bir model çıktısı insan inceleyici adına
kaydedilemez; otomatik uzlaşma yayınlama işlemini tetiklemez. Bu rapor yeni bir
beş-model veritabanı yayın engeli de eklemez: mevcut politika olduğu gibi kalır.

İçerik düzeltilirse eski çözüm raporu yeni revizyona taşınamaz. Yeni revizyonun
kaynak/kullanım hakkı, kazanım ve diğer mevcut önkoşulları ayrıca sağlanmalıdır.
Rapor, insan tarafından yapılmamış kaynak veya kullanım hakkı doğrulamasını
yapılmış gibi kaydetmez.

## Çalıştırma sınırı

Mevcut audit depolaması kullanılır; `question_validation_runs` dışına yeni bir
kanıt deposu oluşturulmaz. Kayıt bulunmayan modeller açıkça eksik gösterilir.
Bu teslimat yeni bir beş-model otomatik çalıştırıcısı, Codex uygulamasından
sunucuya sonuç aktarımı veya toplu soru taraması içermez. Sohbette alınan tekil
model cevapları kendiliğinden güvenilir production kayıtları değildir.

Yeni gerçek koşular için sağlayıcı erişimi, maliyet sınırı ve mevcut kayıt
sözleşmesi ayrıca doğrulanmalıdır. Yerel testlerde kullanılan örnek raporlar
sentetiktir; canlı soru bankasının doğrulandığı iddiasında kullanılamaz.

## Yerel doğrulama — 2026-09-06

- Çalışma ağacı: `D:\Projelerim\bilge-arena-five-model-review`.
- Dal: `feat/admin-five-model-quality-review`; taban `cf646f48`.
- Node 22.23.2: 460 test dosyası / 4.067 test başarılı.
- Yeni rapor ve ilgili yönetici panelleri: 38 hedefli test başarılı.
- TypeScript, değişen dosyaların ESLint kontrolü ve `git diff --check` temiz.
- Bağımsız son incelemede P0/P1 engel bulunmadı.
- Gerçek bileşenle, yerel sentetik önizlemede 3/5 eksik, 5/5 aynı cevap,
  görüş ayrılığı ve erişim hatası görünümleri kontrol edildi. 390 piksel
  mobil viewport'ta yatay taşma yoktu. Bu kontrol production smoke değildir.
- İlk ek regresyon testi, doğru seçenek bulunamayan başarılı çözümün
  “cevap kaydı yok” yazdığını yakaladı; ayrı insan incelemesi uyarısıyla düzeltildi.
- Commit/push, PR, deploy, migration ve production veri yazma yapılmadı.
  Beş modelin gerçek toplu koşusu başlatılmadı; bu rapor ekranı henüz canlı değil.
