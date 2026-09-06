# V2 ana öğrenme girişi ve kalan kabul kapıları

## Amaç ve durum

Ana hedef V2'nin tamamlanmasıdır. Beş model soru kalite raporu ayrı bir alt iştir;
V2'nin bütünü değildir. Bu çalışma `cf646f480a5a6fae011015614100be843fe3c46f`
üzerinden `fix/v2-primary-learning-entry` dalındaki yerel değişikliktir.
Bu tur production verisi, bayrak, SQL, model anahtarı ve altyapı değişmedi.

## Bu pakette yapılan

- Girişli Arena'da günlük plan ders sekmelerinden sonraki ilk DOM/görsel bloktur.
  Mobil/masaüstü aynı bileşeni kullanır; gridin sabit satırları planın önüne geçmez.
- Mevcut TodayPlanFocus/TodayPlanCard ve doğrulanmış quiz başlangıcı kullanılır.
  Yeni plan yazarı, tamamlanma RPC'si veya analitik başarı metriği eklenmez.
- Konu seçimi ikinci sıradadır. Koç canlıda kendiliğinden açılıp planı örtmez;
  kullanıcı isteğiyle açılır. Sabit 10 soru/4 dakika iddiaları kaldırıldı.
- Misafir ve demo ana ekranda kişisel günlük plan isteği yapmaz.
- Boş/hatalı plan hazırmış gibi gösterilmez; yeniden dene ve normal çalışma
  seçenekleri vardır. Küçük havuzlar gerçek soru sayısıyla etiketlenir.
- İstek ve yanıt oyun/sınav kimliği eşleşir. Wordquest soru kapsamı NULL kalır;
  diğer açık seçimler oyun sözleşmesinde geçerli ve birebir aynı olmalıdır.
- TYT Sosyal'de mevcut politika aktif ve kaydı bitmiş olmadan plan bileşeni
  bağlanmaz. Çalışma sayfasının politika okuması/kartı çoğaltılmaz. Hesap değişimi
  ve geç dönen PUT yanıtı önceki seçimi yeni hesaba taşımaz.
- Sosyal doğrudan başlatma niyeti seçim beklerken kaybolmaz. URL yalnız bir kez
  tüketilir ve exam_ref korunur. Süresi dolmuş ana ekran bileti tıklanırsa yenilenir.
- Sunucunun izin, kimlik, verified attempt, rate-limit ve politika kontrolleri
  değişmedi. İstemci kapıları güvenlik sınırının yerine geçmez.

## Yerel doğrulama

- Exact Node 22.23.2; tam unit/route koşusu: 457 dosya, 4059 test başarılı.
  Ardından eklenen tek unsupported-explicit-exam testiyle son hedefli koşu
  7 dosya, 112 test başarılıdır; örtüşen test sayıları toplanmaz.
- TypeScript, değişen dosyalarda ESLint ve git diff --check başarılı.
- Bağımsız diff incelemesinde yeni P0/P1 engel bulunmadı.
- Yerel Vite harness gerçek ArenaClient ve plan bileşenlerini sentetik API
  cevaplarıyla render etti. Router hedefi gözlendi; gerçek oturum kaydedilmedi.
- 390x844: belge genişliği/scrollWidth 390, plan y=160..471, ikinci grid y=471.
  1365x900: genişlik/scrollWidth 1365, plan y=252..555.5, ikinci grid y=555.5.
  İki ölçümde de yatay taşma yok ve ana eylem önce geliyor.
- Matematik 15, Türkçe 12, kısmi 5/15 ve 503 fallback senaryoları görüldü.
  Bunlar canlı kapsam veya öğrenme etkisi kanıtı değildir.
- İlk yerel testte GET/PUT fixture ayrımı hatalıydı (GET için fazladan replayed);
  fixture düzeltildi, güvenlik sözleşmesi gevşetilmedi.
- agent-browser CLI yoktu; uygulama tarayıcı aracı kullanıldı. D: cache izin
  hatasında yerel dev server/test çıktısı için izinli çalıştırma kullanıldı.

## V2 kapanış sırası

| Sıra | İş | Kapanış kanıtı |
| --- | --- | --- |
| 1 | Bu ana giriş ve ayrı admin raporu paketlerinin kontrollü yayını | Kesin commit, zorunlu CI, deploy ve girişli smoke |
| 2 | Ders/sınav kapsamı; önce LGS ve TYT Sosyal | Gerçek aktif soru/kazanım/kapsam matrisi, içerik onayı, boş/karantinalı havuz ve rol sınırı testleri |
| 3 | TYT Sosyal seçim anına bağlı tek snapshot | Politika değişimi sırasında personalization/issuance yarış testi ve atomik sözleşme |
| 4 | Yaşa uygun destekli/dengeli/odak deneyimi ve AI kabul kapısı | Merkezi yetenek kararı, yaş/onay/erişim matrisi, gizlilik ve fail-closed testleri |
| 5 | 7–14 gün sonra farklı soruyla bağımsız ölçüm | Server-owned atama, immutable kaynak/sonuç bağı, ipucu/tekrar ayrımı, ayrı metrik ve süre sınırı testleri |
| 6 | Gerçek küçük kurum pilotu | Gerçek öğrenci/öğretmen akışları ve zaman içinde gözlenen sonuçlar; veri yoksa not tested |

Migration 211'in öğrenme kanıtı/program tamamlanma düzeltmesi önceki canlı
kayıtlarla tamamlanmıştır; bu tur ledger yeniden okunmadı ve 211 tekrar çalıştırılmadı.
Eski tek-öğe program tamamlanma ve V1/V2 plan çelişkisi yeniden açık sayılmamalıdır.

24 saat sonra aynı soruda gecikmeli doğru ve üç farklı gün kanıtı, farklı soruyla
7–14 günlük bağımsız kalıcılık ölçümü değildir. Gerçek pilot/ölçüm sonucu zaman
ve saha katılımı gerektirir; kod/test tamamlanmasıyla olmuş kabul edilemez.

## Açık sınırlar

- Tam V2 henüz bitmedi. Bu paketin canlı yayını ve girişli uçtan uca sonucu yok.
- Önceki girişli LGS smoke karantinalanan hatalı soruda durdu; başarılı oturum,
  plan tamamlanması ve kalıcı XP/coin sonucu yeniden doğrulanmalıdır.
- Ana ekran planı mevcut GET'i çağırır; bu uç plan/bilet üretebilir. Quiz açılınca
  kendi yeni biletini alır. Bu çalışma issuance maliyetini azaltmaz; kullanımda
  gecikme/istek sayısı ayrıca izlenmelidir.
- Önceden mevcut markCompleted PATCH'in geç cevabı için bağlam yarışı ayrıca
  ele alınmalıdır. Sunucu mevcut kullanıcı/plan/cevap doğrulamasını korur.
- Kurum ve Sosyal rollout bayrakları açılmadı; içerik/hak onayı adına işlem yapılmadı.
