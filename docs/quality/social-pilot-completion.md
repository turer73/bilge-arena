# Sosyal başlangıç pilotu — tamamlanma kaydı

Durum: DB/API/öğrenci akışı ve yerel kabul testleri uygulandı. Kaynak incelemesi
gerçek adaylar üzerinden yürütüldü; yayın kabulü ve canlı dağıtım yapılmadı.
Taban: master ebb39b82 (#544 dahil). Önceki çalışma klasörü değiştirilmedi.

## Bu dalda bulunanlar

- Önceki dört alan / 24 aday / 12 soru hazırlığı güncel ana dala taşındı.
- Kaynak karşılaştırma sözleşmesi ve çevrimdışı hazırlama/doğrulama araçları korundu.
- `npm run social:check -- input.json review-directory current-export.json [holds.json]`
  aday kotasını, görev hash'ini, görev/soru eşleşmesini, güncel aktif revizyonu,
  içerik ve metadata eşitliğini ve ham kaynak raporunu birlikte denetler.
- Hazır olduğu iddia edilen özet rapor kabul edilmez; ham yanıt yeniden değerlendirilir.
- Eksik/bozuk rapor, pasif soru veya revizyon değişikliği ayrı gerekçe üretir.
- Çıktı cevap anahtarı içermez. Tam kaynak kapsamı dahi yayın yetkisi vermez.
- Araç DB'ye veya inceleme paketine yazmaz. Başarılı ön kontrol 0, eksik kaynak
  kapsamı 2, geçersiz paket/çalıştırma hatası 1 çıkış kodu verir.
- Vite ön kontrol araçlarının önbellekleri çalışma klasörünün ignore edilen
  `secure` dizinindedir; ortak node_modules önbelleği değiştirilmez.

## 29 Eylül / 30 Eylül gece kontrolü

- Canlı salt okunur export: eski 31 girdinin tamamı aktif ve yayımlanmış revizyonuyla eşleşiyor.
- Seçili 24 soru ön kontrolde güncel içerik/revizyon uyuşmazlığı vermiyor.
- Mevcut v3 kaynak paketinde 24 yanıt dosyası eksik. Bu, soruların yanlış olduğu
  anlamına gelmez; kaynak kapsamı henüz tamamlanmamıştır.
- Canlı Sosyal/TYT scope hâlâ validating; diagnostic_enabled=false ve tanılama resolver sonucu null.
- Fable #531 ve #542 ana dala alınmış; bu dalda yeniden uygulanmadı.

## Kapsam ayrımı

178 numaralı migration, (game, question_exam_ref) üzerinde benzersiz kayıt tutar.
193 numaralı tanılama sözleşmesi yayımlanmış curriculum scope ve bütün kapsamın
eşleme bütünlüğünü zorunlu tutar. Yeni bir display_exam_ref yazmak 24 soruya
sınırlandırma sağlamaz; aynı TYT soru deposunu ikinci kez kaydetmek de benzersiz
kısıta çarpar. Bu dal mevcut kısıtları veya yayın kapılarını gevşetmez.

İki ayrı ürün kapsamı vardır:

1. Dört alan başlangıç pilotu: sabit aday listesi ve revizyonlarla sınırlı, tam TYT
   puanı/ustalık iddiası taşımayan bir alt-kapsam sözleşmesi gerekir.
2. Tam TYT Sosyal: mevcut resmî bölüm/aday politikaları, din kültürü ve alternatif
   felsefe seçimi, kapsamın gerçek eşlemeleri ve kaynak kabulleri tamamlanmalıdır.

Kaynak araştırmasında bulunan bir URL, açıldığı ve iddiayı desteklediği ayrıca
doğrulanmadan response.json içinde kanıt olarak doldurulmaz. Eski yerel 212–215
migration dosyaları bu dala taşınmadı ve canlıda çalıştırılmadı.

Bu dal dört alanlı alt-kapsamı ayrı `social_discovery_*` tabloları ve üç service-only
RPC ile uygular. Resmî curriculum scope, iki aşamalı içerik governance veya mastery
kapıları gevşetilmez. Aynı soru revizyonları kullanılır; yeni bir soru bankası oluşturulmaz.

## 30 Eylül — çevrimdışı oturum sözleşmesi

`social-pilot-session.ts` mevcut adaptif seçiciyi kullanarak 24 adaydan 12 soruluk
oturumu baştan oynatır. Sıra dışı/tekrarlanan cevapları, farklı revizyon/hash'i ve
geçersiz seçenek indeksini reddeder. Doğruluğu istemciden almaz, sabit anahtardan
hesaplar. Her alanda üç gözlem üretir; ustalık puanı yazmaz. Sonraki soru çıktısı
anahtar ve çözüm içermez. Bu saf sözleşme artık aşağıdaki DB/API entegrasyonunun
sunucu tarafındaki seçimi ve kamuya açık projeksiyonunu da doğrular.
Kaynak kabulü veya yayın yetkisi oluşturmaz.

Kısmi kaynak araştırması `social-pilot-source-notes-20260930.md` dosyasında.
Bu ilk notlar sonradan tamamlanan iki soru-bazlı raporun yerine geçmez.

## 30 Eylül — uygulanan öğrenci akışı

- Migration 216 (dağıtım öncesi 215 çakışması giderildi): draft/released/retired paket, 24 değişmez revizyon snapshot'ı,
  kullanıcıya bağlı 30 dakikalık oturum ve append-only cevaplar.
- `GET/POST /api/study/diagnostic/social-pilot`: gerçek oturum kimliği, fail-closed
  hız sınırlaması, yalnız sunucuda puanlama ve adaptif sonraki soru seçimi.
- Tarayıcıya yalnız mevcut soru, passage ve beş seçenek döner; anahtar/çözüm,
  ham kaynak paketi ve cevap geçmişi döndürülmez.
- İstek kimliği aynı cevabın yeniden gönderilmesini idempotent kılar. Sonraki
  cevaplarla yarışan eski tekrar, eski kaydı değil güncel ilerlemeyi döndürür.
- Refresh tamamlanan sonucu ve son kayıtlı soruyu korur. CAS/row lock eşzamanlı
  cevapları korur; kullanıcı değişiminde önceki hesabın verisi ekrandan kaldırılır.
- Karantina/pasiflik, devam eden oturumda eski içeriği sunmayı ve yeni puanlamayı
  durdurur; daha önce kaydedilen cevaplar/revizyon snapshot'ları değiştirilmez.
- `/arena/tani/sosyal-pilot`: giriş, başlat, tüm şıkları gör, cevapla, yeniden dene,
  kaldığın yerden devam ve dört alanın her birinde üç cevaplık başlangıç gözlemi.
- Sosyal açıklama penceresi yalnız gerçekten released paket bulunduğunda bu
  bağlantıyı gösterir. Resmî TYT tanılama rotasına veya mastery puanına yazmaz.
- Sonuç psikometrik seviye, resmî TYT başarısı veya öğrenme etkisi kanıtı değildir.

## Yerel doğrulama ve CI

Final tam frontend koşusu: 490 dosya / **4.457 test geçti** (1 Ekim, yerel saat
00:01:43 başlangıç). Gerçek yerel PostgreSQL 17.10: **16/16 kabul testi geçti**.
Üretim build'i (final kod, Webpack), TypeScript,
migration sıralaması/idempotency ve SECURITY DEFINER grant/search_path lint geçti.
Kaynak dosya adaptörü 2/2 ve yalnız draft SQL üreten kayıt aracı 6/6 geçti.

PG suite yalnız loopback ve `bilge_social_pilot_test_*` disposable DB kabul eder.
`.github/workflows/ci.yml` aynı suite için ayrı DB yaratıp testi çalıştırır; CI
sonucu burada gerçekleşmiş gibi gösterilmez. Windows node_modules junction'ı
Turbopack'in dosya kökü sınırına takıldığı için yerel build `--webpack` ile
çalıştırıldı; proje build ayarı değiştirilmedi.

Final build tarayıcı koşusunda 390×844, 768×1024 ve 1280×900 genişliklerinde giriş
ekranı yüklendi; yatay taşma, hata overlay'i veya JavaScript hatası görülmedi.
Tek main landmark doğrulandı; mobil ekran görüntüsü özel kanıt klasöründe saklandı.
Kimlik doğrulanmış canlı öğrenci akışı bu kontrolün
kapsamında değildir. Yerel Redis olmadığından diğer production API'lerinin
503 fail-closed yanıtı release kabulü sayılmaz.

## Operatör devir sırası

1. Güncel, güvenilir export ile `social:check` çalıştır. Ham response.json
   raporlarını yeniden değerlendir; eski özet raporu veya URL sayısını kabul etme.
2. `social:registration-draft` yalnız 24 güncel, şemadan geçen rapor için
   **draft** SQL planı üretir. Conflict/coverage uyarıları planı yayına dönüştürmez.
   Plan cevap anahtarı veya çözüm içermez; DB'ye bağlanmaz.
3. Anlam düzeltmeleri yeni içerik revizyonu olarak hazırlanır. Yeni revision/hash
   için kaynak incelemesi yenilenir; eski oynanmış revizyon değiştirilmez.
4. Ayrıca yetkilendirilmiş schema dağıtımında migration 216 uygulanır; kabul
   edilmiş kaynak paketi hash'i, gerçek operatör ve kabul referansı kaydedilir.
5. Kabul sonrası paket `released` yapılır. Trigger o anda bütün aktif yayın
   pinlerini, 24 aday/bant kotasını ve kanonik içerik hash'lerini tekrar kontrol eder.
   Örneğin yalnız sorunun metnini düzeltip eski hash'i bırakmak kabul edilmez.
6. Kod dağıtımı sonrası gerçek kullanıcıyla 12 cevap / refresh / sonuç doğrulanır.
   Retirement, yeni sunmayı durdurur; eski kayıtlar silinmez. Migration veya canlı
   cevap kayıtları rollback gerekçesiyle drop edilmez.

Bu çalışma canlı migration, source acceptance, soru düzeltme yayını, merge veya
deploy işlemi yapmadı. `sourcePackageComplete=false` iken paket yayıma hazır değildir.
Özellikle birbirini kaynak gösteren iki alan adı bağımsız kanıt sayılmadı.

## 1 Ekim — final kaynak paketi ve yayın engeli

- 24/24 gerçek kök, 120/120 seçenek, 24/24 çözüm incelendi.
- Tarih/coğrafya raporu: 4 çelişkili, 8 eksik kanıt; felsefe/sosyoloji: 8 çelişkili,
  4 eksik kanıt. Birleşik genel kaynak kapısı **12 conflicting / 12 insufficient**.
- Eksik yanıt, bozuk şema veya revizyon eşleşmezliği: **0**. Ancak bütün iddiaları
  yeterli kanıtla kapanmış soru: **0**. Okuma tamamlığı, yayın kabulü değildir.
- 82 erişim kaydının 81'inde gerçek kısa pasaj hash'i doğrulandı. Erişilemeyen
  veya içerik desteği bulunmayan kayıt olumlu kanıt sayılmadı; hash tek başına
  olgusal doğruluğu veya bağımsız kaynak sayısını ispatlamaz.
- Tuz Gölü ölçüt farkı son incelemede kesin çelişki değil belirsizlik olarak
  düzeltildi. Eski 13/11 birleşik sayım final karar değildir.
- Genel kaynak kapısındaki kapsam çatışmalarının bir kısmı altı sosyoloji
  adayının resmî TYT varsayımından kaynaklanıyor. Bunlar yanlış anahtarla veya
  bu dört alanlı pilotun tam TYT testi olduğu iddiasıyla aynılaştırılmadı.
- Öncelikli içerik işleri: Hobbes aktarımı; Islahat kronolojisi; Westphalia
  genellemesi; kömür kaynak/rezerv ayrımı; çözümlerdeki aşırı kesin ifadeler.
  Bunlar salt Türkçe karakter düzeltmesi sayılıp mevcut yayın üstüne yazılmaz.

Yeni özel paket: `secure/social-pilot-reviewed-20260930/` (24 ham yanıt).
Final draft planı: `secure/social-pilot-registration-20261001-final.sql`.
Kaynak paket SHA-256: `d3d5320803de426ec90710137ed285a2a09883285f96f513b92b3e3d63bc9980`.
Eski `social-pilot-registration-20261001.sql` superseded olarak işaretlendi.

1 Ekim canlı **BEGIN READ ONLY** kontrolünde 24 adayın aktif olduğu, yayınlanmış
revizyon/pin/category/difficulty değerlerinin ve PostgreSQL kanonik içerik
hash'lerinin hâlâ eşleştiği doğrulandı. Canlı içerik/anahtar dışa dökülmedi.
Özel pin kontrol kaydı `secure/social-current-pin-verification-20261001.json`.

Final draft SQL, gerçek 24 revizyon içeriğiyle yalnız loopback disposable
PostgreSQL'de uygulandı: 24 snapshot oluştu, paket draft kaldı, PostgreSQL
hash/kota kontrolleri geçti; **bütün prova rollback edildi**. Kaynak kabulü ve
publication yapılmadı. Test PostgreSQL'i ve görev tarayıcısı durduruldu.

Sonuç: uygulama değişiklik paketi ve soru bazlı kaynak araştırması tamamlandı;
aday içerik düzeltmeleri/kapsam kanıtı kapanmadığından **pilot canlıya hazır değil**.
Bu durum runtime kapısını gevşeterek veya operatör kabulü uydurularak aşılmadı.

## 1 Ekim — içerik düzeltme paketi

10 aday için revizyon/hash'e bağlı yerel düzeltme önerileri ve tam önce/sonra
inceleme sayfası oluşturuldu. Taslak aracına açık `--offline` modu ve incelenen
taban revizyon/tam içerik fingerprint kontrolü eklendi; export'un zorluk ve sınav
metadata'sı artık preview'da korunuyor. 87 ilgili regresyon testi geçti.

Kömür adayındaki ölçüm tanımı belirsizliği ve müfredat/kaynak kapanışları ayrı
açık kaldı. Canlı revizyon açılmadı veya yayımlanmadı. Eski kaynak raporları
değişmedi; yeni metinler için kabul/pin üretilemez. Ayrıntı:
[Düzeltme paketi](social-pilot-corrections-20261001.md).

## 1 Ekim — ek içerik düzeltmeleri

Yedi ek öneriyle toplam 17/24 aday için yerel revizyon bağlı preview hazırlandı:
tarih 4, coğrafya 4, felsefe 4, sosyoloji 5. Diğer yedi adayın içerik yaması bu
turda önerilmedi; açık kaynak/kapsam/tasarım bulguları kabul edilmiş sayılmadı.
24/24 yerel pin, 17/17 tam içerik fingerprint ve metadata/anahtar korunumu
kontrol edildi. Altı ilgili dosyada 48 regresyon testi yeniden geçti.

Kömür kökü rezerv sıralaması yerine doğrulanabilir yatak–tür eşleşmesine
daraltıldı. Yağış normalinin ölçütü/dönemi açıklandı; MGM tablosu eksik metin
çıkarımı nedeniyle tam PDF sayfasından görsel kontrol edildi. Diğer beş
öneri çözümdeki aşırı kesinlik veya kavram ayrımlarını ele aldı.

Yeni DB revizyonu/publish/pin/source acceptance oluşturulmadı; eski oynanmış
kayıtlar değişmedi. Bu kontrol yerel export'a karşıdır, yeni canlı doğrulama
değildir. Eski 12/12 kaynak raporları yeni metinlere taşınmadı. Ayrıntı:
[Ek düzeltmeler ve 24 adayın durumu](social-pilot-correction-followup-20261001.md).

## 1 Ekim — yeni metinlerin iki-model denetimi

17 düzeltme preview'ı Gemini Pro ve DeepSeek V4 Pro ile mevcut orkestratörden
geçirildi. 170 gerçek/mantıksal çağrıda 0 başarısız sonuç; 102/102 kör örnek
anahtarla ve 34/34 çözümden çıkarılan indeks anahtarla eşleşti. İki modelde de
17/17 `APPROVED` AI etiketi üretildi. Model kararları yayın izni değildir.

Yeni içerik, eski DB UUID'sine değil yerel-preview referansına ve sıralı JSON
fingerprint'ine bağlı tutuldu. 13 değişen çekirdek iddia için kaynak spot kontrolü
yenilendi; dört coğrafya kaydı önceki aynı gün incelemesine dayanır. Tam kaynak
kabulü, müfredat/psikometri kapanışı veya yeni DB revizyonu oluşturulmadı.
Kaynak kullanım koşulları ayrıca kaydedildi. Dört ilgili dosyada 77 test geçti.

Ham koşular ve birleşik rapor yalnız özel `secure/` klasöründedir. Ayrıntı:
[Yeni metinlerin iki-model kalite kontrolü](social-pilot-correction-audit-20261001.md).

## 1 Ekim — güncel master, canlı şema ve eşleme bekleyen taslaklar

#543/#544 ana dala alınmış değişikliklerle birleştirildi. Canlı 215 Türkçe
harf düzeltmesi migration'ı korunarak uygulanmamış Sosyal migration'ı 216'ya
taşındı. 24 canlı pin eşleşiyor; fakat 24 soru/revizyonda kazanım bağı yok ve
kaynaklar hâlâ lisans incelemesi isteyen legacy kayıtlardır. Pilot tabloları
canlıda yok; TYT Sosyal tanılama kapısı kapalıdır.

164'ün mevcut kazanımsız taslak sözleşmesine açık, pin zorunlu ve hızlı yayın
kapalı bir araç modu eklendi. 17 düzeltme gerçek kaynak/provenance korunarak
yalnız yerel taslak planına bağlandı; 24 kazanım katalog adayı kabul edilmeden
ayrı tutuldu. Canlı revizyon, eşleme, kaynak kabulü veya yayın yazması yapılmadı.
Ayrıntı: [Canlı şema ve taslak hazırlığı](social-pilot-live-readiness-20261001.md).
