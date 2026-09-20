# Oyunlar ve Ders Çalış — ayrı ekran tasarım kararı

14 Eylül 2026. Kullanıcının ek isteği üzerine sonraki masaüstü/tablet tasarımlarının bağlayıcı yönü. Bu belge yeni ekranların kodlandığı anlamına gelmez.

## Mevcut durum, doğrudan koddan

- Menüde `/arena` bağlantısının adı “Oyunlar”; mevcut yerel yeni görünüm burada öğrenme yolu gösteriyor.
- `/arena/calisma` ayrı bir `CalismaClient` içeriyor; mevcut ana başlığı “Pratik”. Günlük plan ve mevcut çalışma araçları burada da var.
- Dolayısıyla sorun yalnızca renk değildir: menü adı, sayfa başlığı ve kullanıcının amacı henüz tam örtüşmüyor.

## Hedef ekranlar

| Karar | Oyunlar | Ders Çalış |
| --- | --- | --- |
| Ana soru | Hangi mücadeleyi oynayayım? | Bugün neyi çalışayım? |
| Birinci görünüm | Oyun/mod keşfi ve seçili oyuna giriş | Kişisel günlük plan, kaldığı konu ve öğrenme yolu |
| Yerleşim | Görselli oyun kartları; seçilen oyun için kısa hazırlık alanı | Daha sakin çalışma alanı; konu/kazanım sırası, ilerleme ve destek |
| Ana eylem | Oyuna başla / odaya katıl | Planı incele / çalışmaya devam et |
| Bilge'nin rolü | Oyun kuralı, başlangıç ipucu, uygun sonuç tepkisi | Konu desteği, açıklama, küçük ilerleme motivasyonu |
| Durum dili | Süre, soru sayısı, tur, rakip, oyun kuralı | Tekrar, kazanım, çalışma planı, öğrenme ilerlemesi |
| İkincil bağlantı | Ders çalışmaya geç | Bir oyunla pekiştir |

Ortak olanlar: logo, yazı ailesi, erişilebilir kontroller, seçili sınav kapsamı, renk/zemin tercih sistemi ve kullanıcı hesabı. Fark yalnızca vurgu rengiyle anlatılmayacak; iki ekran farklı siluete ve bilgi önceliğine sahip olacak.

## Sonraki uygulama sırası

1. Önce iki ayrı masaüstü/tablet ekran tasarımını hazırlayıp yan yana değerlendirmek. Genel öğrenme deneyiminde şu an onaylanan üst günlük plan kartını korumak.
2. Hedef menü eşleşmesi: Oyunlar → `/arena`, Ders Çalış → `/arena/calisma`. Ancak mevcut `CalismaClient` ve devam eden kazanım araçları incelenmeden yeni görünümle üzerlerine yazılmayacak. Öğrenme ana ekranının son konumu bu entegrasyonda netleştirilecek.
3. Oyunlar içinde mevcut Kule ve Bil Fethet girişlerine yer vermek; route varlığını işlevin uçtan uca hazır olduğu şeklinde sunmamak. Mod erişim/özellik/rol kısıtlarını korumak.
4. Paylaşılan soru motorunu korurken oyun kurulumu ve çalışma kurulumu sunumlarını ayırmak. Günlük plan ile konu seçimini oyun modları arasına eşdeğer bir kart olarak karıştırmamak.
5. Menü adı, aktif sekme, sayfa başlığı, geri dönüş ve ana eylem aynı amacı göstermeli. Mobil görünüm ve yayın bu aşamanın dışında kalır.

## Yerel uygulama — 14 Eylül, sonraki düzenleme

- 768px ve üstünde `/arena` mod keşfi, `/arena/calisma` günlük plan ve öğrenme yoludur. 768px altındaki mevcut iki ekran korunur.
- Kule, Bil ve Fethet ve ayrı İngilizce kelime oyunu WordQuest mevcut rotalarına bağlanır. Kule/fetih misafir girişleri güvenli `next` hedefiyle oturum açmaya gider; soru motorları değişmez. WordQuest mevcut YDT/LGS görünürlük kapsamını korur.
- Çalışma merkezinin mevcut kazanım önerileri, kurum haftalık programı ve Bilge Asistan bileşenleri yeniden kullanılır. TYT Sosyal cevaplama düzeni tek durumdan günlük plana aktarılır. Günlük plan ikinci kez oluşturulmaz.
- Bilge görünümü ve 12 ifade mevcut kişiselleştirme stüdyosuna taşındı. Tema, profil görselleri ve rehber tercihi ayrı kalır. Tablet gezinmesi bu üç sayfada tutarlıdır.
- Misafirde ilk eylem konu seçimi; giriş gerektiren plan ikincil bağlantıdır. Gerçek kişisel planda üst kart korunur. Tablet çalışma alanı tam genişliktedir.

Kapsam sınırı: API, migration/veritabanı, soru değerlendirme, ödül/istatistik hesapları, kurum rol/erişim sözleşmeleri ve mod motorları değiştirilmedi. Yeni ölçme sistemi veya mod geliştirilmedi. Gerçek kurum hesabı ve öğrenme etkisi bu yerel arayüz testlerinin kanıtı değildir. Commit, push ve deploy yapılmadı.
