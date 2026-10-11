# Kontrollü ölçüm toplama — v1

Bu kod **kalibrasyon sonucu değildir**. Varsayılan kapalı bir veri toplama
altyapısıdır. Matematik TYT ile başlanır; aynı sözleşme LGS'de dört seçenek
zorlar. Sosyal hazırlık, mevcut kısa taramalar, puanlar ve ustalık değişmez.

## Sözleşme

- `measurement_forms`: sıralı 5–30 değişmez soru/revizyon/hash pini; ders,
  sınav/yıl/protokol dahil kanonik PostgreSQL JSON hash'i. Ayrı form kabul
  referansı ve yetkili sahibi. Form `enabled=false` olmadan otomatik açılmaz.
- `measurement_sessions` / `measurement_items`: kimliği doğrulanmış öğrenci,
  ilk seçim, sunucu zamanları, konum, render sürümü/beyanı ve tekrar işaretleri.
  Soru metni/anahtar yeniden yazılmaz; mevcut immutable revizyon kullanılır.
  `verified_attempts` ödül oturumu oluşturulmaz; bu ayrı ölçüm amacı normal
  oyun veya eski v3 psikometri verisiyle kendiliğinden karışmaz.
- Anahtar/çözüm, son cevap kaydedilene kadar SQL RPC sonucunda bile yoktur.
  Public JSON allowlist ayrıca doğrulanır. Tamamlandıktan sonra doğru seçenek
  **metin** olarak verilir; çözümde harf/indeks dayatılmaz.
- Oturum başlatma ve cevap tekrarları idempotent; kullanıcı başına tek aktif
  tur, satır kilidi ve ilk seçim koruması. Boş seçim `-1`, yanlış indeks ret.
- GET kullanıcıya son turu gösterir; eski/çekilmiş form yeni soru vermez.
  Bırakma, form çekilmiş veya süre dolmuş olsa bile mümkündür; çözüm açılmaz.
- Formlar sadece kontrollü operatör kabulüyle içe aktarılabilir: browser ve
  service_role tablo yazamaz. Kaynak/kazanım/kalite için mevcut
  `question_revision_single_review_ready` yeniden çalışır. LGS için ayrıca
  aynı sınav yılına bağlı `source-comparison@2` kabulü gerekir. Bu kod bu
  kabulleri üretmez, kimse adına imza veya yayın kararı yazmaz.

## Gösterim ve veri sınırı

İlk sürüm sade/Unicode metin ve mevcut güvenli `<u>` göstericisidir.
LaTeX, görsel, SVG, tablo veya başka HTML gerektiren içerik form kapısından
geçmez. Bunlar için test edilmiş ayrı renderer gerekir; var olmayan KaTeX
render testi iddia edilmez. Ekran genişliğinde yatay taşma kap içerisinde
kaydırılır. Ekran kaydı, inanç bilgisi, cihaz parmak izi veya reklam telemetrisi
alınmaz; ölçüm yolu hassas alan olarak işaretlidir.

Gösterim onayı ve yardım kullanımı **öğrenci beyanıdır**, harici yardımın
yokluğunun kanıtı değildir. Sekme gizlenmesi işaretlenir; ağ/sekme süresi dahil
sunucu gönderim–cevap aralığı saf düşünme süresi değildir. 1–600 saniye ilk
operasyon filtresidir; psikometrik bilimsel eşik veya doğru/yanlış kararı değil.

`measurement_evidence_v1` özel görünümü tamamlanmamış, boş, önceki kayıtlı
gösterim/cevap, yardım, bozuk render, kesinti, süre ve çekilmiş revizyonları
gerekçeleriyle ayırır. Kayıtlı ilk gösterim, gerçek hayatta ilk görme demek
değildir. Eski sürümdeki cevap da aynı soru kimliğinde tekrar sayılır.
Tur bitene kadarki normal pratik/diagnostic kayıtları ayrıca dışlanır;
sonraki öğrenme çalışmaları geçmiş ölçümü geriye dönük bozmaz.

Normal `/api/questions/grade` ve `/api/coach/hint`, aynı hesabın aktif turundaki
**tüm** form sorularının geri bildirimini engeller. Oturum ID'si normal oyun
denemesi değildir. Başka hesap, misafir erişimi, kitap veya harici asistanın
engellendiği iddia edilmez. Gerçek öğrenci örneklemi bu sınırlara göre incelenir.

## Yayın sırası ve geri dönüş

1. Migration uyum kontrolü ve izole PostgreSQL provası; RPC izinleri: browser yok, yalnız bağlı
   service_role API çağrıları. Native testte dış governance tabloları/helper'ları
   minimal fikstürdür; tam zincir testi yerine geçmez.
   `node database/measurement-release-check.mjs sql preflight` canlı bağımlılıkları
   ve çakışmayı salt-okuma denetler. `sql readback` yedi fonksiyon gövdesinin
   hash'ini, RLS/ACL sınırlarını ve boş/kapalı başlangıcı denetler. Canlı şema
   uyum kontrolü de tam tarihsel migration zinciri provası değildir; form açılışı
   öncesinde gerçek hesap akışı ayrıca doğrulanmalıdır.
2. Kod dağıtımı; `MEASUREMENT_SCHEMA_READY=true` yalnız migration doğrulanınca.
   Bu bayrak grade/coach korumasını açar; yeni tur açmaz.
3. Kaynak/kazanım/kalite kabulü geçmiş güncel revizyonlarla sabit form oluştur;
   hash ve ayrı form inceleme makbuzunu doğrula. Varsayılan release satırı kapalı.
4. Form bazlı açılış + `MEASUREMENT_ENABLED=true`; girişli gerçek hesap ve
   telefon/tablet testi, tur sonu geri bildirim ve kişisel veri sınırı doğrula.
5. Durdurmak için `MEASUREMENT_ENABLED=false`: yeni başlangıçlar durur,
   mevcut tur tamamlanabilir/bırakılabilir. Gerekirse form release kapatılır.
   Aktif turlar bitmeden/iptal edilmeden `MEASUREMENT_SCHEMA_READY` kapatılmaz.
   Tablolar veya geçmiş cevaplar silinmez.

Bu değişiklikte canlı migration, form kabulü, feature-flag açılışı veya
öğrenci hesabı işlemi yapılmamıştır.

## 11 Ekim 2026 başlangıç bulgusu

| Havuz | Aktif | Doğru seçenek sayısı | Kaynak+kazanım+kalite kabulü | Dört şıklı taslak bulunan |
|---|---:|---:|---:|---:|
| Matematik TYT | 630 | 630 | 0 | — |
| Matematik LGS | 86 | 0 | 0 | 82 |
| Türkçe LGS | 53 | 0 | 0 | 53 |
| Fen LGS | 70 | 0 | 0 | 70 |
| Sosyal LGS | 24 | 2 | 2 | 22 |

Tekrarlanabilir salt-okuma sorgusu: `node database/measurement-readiness.mjs sql`.
Aktif olmak kabul edilmiş ölçüm sorusu olmak değildir. İlk Matematik formu için
5–30 soruluk sınırlı içerik/kazanım inceleme paketi gerekir. LGS'de 227 mevcut
taslak korunur. Dört Matematik sorusunda taslak bulunmaması unutulmuş iş
değildir: önceki kapsam incelemesi bunları koni/piramit hacmi ve benzerlikte
alan hesabı sınırları nedeniyle beklemeye almıştır. Yeni kapsam kanıtı veya
uygun yeni soru olmadan bu dört kaydın beklemesi kaldırılmaz.
Beşinci seçenek otomatik silinmez; doğru anahtar ve çeldirici kapsamı incelenir.

Öğrenci verisi geldikten sonra CTT/Wilson/şık davranışı, örneklem çeşitliliği,
boyutluluk, model uyumu ve kesme noktaları incelenir. `calibrated=false` istemci
ve sunucu sözleşmesinde sabittir; yalnız n artması seviye yayınına yol açmaz.

## Yerel doğrulama (11 Ekim 2026)

- Tam uygulama: 509 dosya / 4.851 test geçti.
- Kontrollü ölçüm + Sosyal hazırlık raporu + kapsam sorgusu: 82 test geçti;
  bunların 46'sı izole gerçek PostgreSQL üzerinde (32 yeni akış, 14 rapor).
- TypeScript, ESLint, migration sırası/idempotency ve SECURITY DEFINER izin
  denetimleri geçti. Üretim derlemesi başarılı; ölçüm sayfası dinamik.
- İki tarayıcı senaryosu geçti (TYT ve LGS; 390/768 px). Playwright'ın sabit
  Chromium indirmesi zaman aşımına uğradı; doğrulanmış yerel Chrome
  155.0.8059.39 kullanıldı. CI varsayılan sabit Chromium kullanacak.
- Tarayıcı testi sentetik auth/API yanıtlarıyla çalışır; DB güvenliği ayrı
  native testtedir. Bu, canlı migration zinciri / gerçek hesap / fiziksel
  telefon-tablet / temsil edici öğrenci örneklemi kanıtı değildir.

Bilinen yayın engeli: henüz kabul edilmiş Matematik ölçüm formu yoktur.
Hiçbir ders kalibre edildi olarak işaretlenmedi. CI işlerine testler eklendi;
yerel test sonuçları uzak CI veya deployment sonucu diye sunulmaz.

Yayın öncesi ek kontrol: kullanıcı dışa aktarımı ölçüm oturumu üzerinden yalnız
kendi `measurement_items` cevaplarını da içerir; cevap anahtarı eklenmez.
Hesap silinmesinde oturum ve cevaplar cascade ile silinir, değişmez form kalır.
Bu iki sınır ve fonksiyon/izin geri-okuması native PostgreSQL testindedir.

Ek doğrulama: 35 native PostgreSQL ve 14 yayın sözleşmesi testi geçti.
İlk uzak CI'da hesap dışa aktarımındaki eşdeğer `SET search_path TO 'pg_catalog'`
yazımı statik güvenlik denetçisine takıldı; diğer fonksiyonlarla aynı
`SET search_path = pg_catalog` biçimine getirildi ve regresyon testi eklendi.
Yetki sınırı değiştirilmedi. Windows CLI giriş noktası denetimi nedeniyle
izin taraması ayrıca fonksiyon doğrudan içe aktarılarak çalıştırıldı.

TYT Matematik için altı farklı kategoride, tümü mevcut zorluk etiketi 2 olan
sınırlı aday taslak hazırlandı. Bu, dengeli bir sınav formu veya tüm TYT'yi
temsil eden örneklem değildir. 11 Ekim kullanıcı özgün üretim beyanı kaynak
kaydına işlendi; bağımsız lisans/akademik onay değildir. Eski yayımlı revizyonlar
korundu; yeni taslakların kaynak/kazanım kabulü ve hash'e bağlı kalite kararı
henüz yoktur. Tarihsel kararları yalnız revizyon ID'si eşleşiyor diye taşıma:
602 eski APPROVED kararı güncel DB içerik hash'iyle eşleşmemektedir.
