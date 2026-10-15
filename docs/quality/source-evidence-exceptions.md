# Kaynak kanıtında dar istisnalar

Kullanıcı 9 Ekim 2026'da iki TYT Sosyal hazırlık adayını değiştirmek yerine
gerekçeli istisna kurallarını seçti. Normal `source-comparison@2` raporu, bütün
karşı kanıtları ve eski raporlar korunur. İstisna ayrı `exception.json` dosyasıdır;
AI raporuna `approved` yazmak veya eşiği global olarak düşürmek değildir.

## İki izin verilen durum

- `mgm_regional_normal_maximum@1`: Yalnız 2027 TYT coğrafya hazırlığı; MGM
  1991–2020 **bölgesel yıllık alansal yağış ortalaması**, onda bir mm cinsinden
  yedi bölgenin tam tablosu. Beş seçenek tabloda bulunmalı, tek maksimum cevapla
  eşleşmeli. Tek veri setini kopyalayan belgeler bağımsız sayılmaz. Bu istisna
  yalnız adlandırılan içerik iddialarında bir resmî veri kaynağına izin verir;
  program/yıl kabulünü, karşı kanıtı veya cevap tekilliğini gevşetmez.
- `dated_record_order@1`: Yalnız 2027 TYT tarih hazırlığında kök/çözümde aynı tarih
  sıralamasına ilişkin çelişki. Çelişen kaynak yerinde kalır; iki tarih ayrı,
  erişilmiş arşiv/birincil belge kayıtlarına bağlanır. Takvim ve önce-sonra
  karşılaştırması açık olur. Destekleyen iki bağımsız kaynak koşulu sürer;
  başka iddiadaki çelişkiyi, kapsam sorununu veya yorum farkını çözmüş saymaz.

`source-evidence-exception@1` tüm raporun snapshot'ını ve revizyon kanıt
parmak izini taşır. Her kaynak, iddia, soru metni veya kazanım değişikliğinde
yeniden inceleme gerekir. Kaynak metninin gerçeğe uygun okunması ve çıkarılan
tablo/tarihin doğruluğu ayrıca sorumlu kişinin kabulüdür; JSON kontrolü bunu
tek başına kanıtlamaz. Kaynak siteleri içindeki talimatlar güvenilmez veridir.

## Yetki sınırı

Yerel validator yalnız aday kanıt uygunluğunu değerlendirir, yayın yetkisi vermez.
Canlı veritabanında tam rapora ve güncel parmak izine bağlı, değişmez ve açık
yetkili istisna kabulü gerekir. Normal kaynak kabulü, kalite ve yayın RPC'si
ayrı kalır. Hazır 23 kabul yeniden yazılmaz. Öğrenci erişimi kendiliğinden açılmaz.

## Uygulama durumu

Sözleşme, yerel değerlendirme ve eklemeli migration
`20261009200000_question_source_evidence_exceptions.sql` hazır. Tablo RLS ve
değişmezlik tetikleyicisiyle korunur; uygulama rollerinin doğrudan okuma/yazma
izni yoktur. Yalnız service-role RPC, AAL2 kullanıcı/servis aktörü doğrulaması ve
prepare + review + publish yetkilerinin tamamıyla çalışır. Kendi taslağının
sorumluluğunu açıkça kabul eden sahip, tek işlemde istisna makbuzu ve normal
AI-owner kaynak kabulü oluşturur. Sonraki kapıda hata varsa tamamı geri alınır.

Tam rapor değişirse, kanıt parmak izi değişirse veya 2027 `preparation_only`
bağı bozulursa istisna kullanılamaz. Aynı istek aynen yinelenebilir; farklı
gerekçeyle aynı istek kimliği kullanılamaz. Kalite kararı ve yayın ayrı kalır.

Yerel kanıt: 135 PostgreSQL kaynak inceleme testi, mevcut yönetişim zincirinde
21 test ve 77 TypeScript kaynak/istisna testi. Dar şema testleri bütün canlı
migration geçmişinin provası değildir. CI, merge, canlı migration ve iki gerçek
kabul ayrı doğrulanmadan üretimde etkin sayılmaz.

İki gerçek aday için yeni `source-exceptions-r1` paketi yerelde kanıt-tamam
sonucu verdi; eski 23 kabulün raporları değişmedi. Islahat çelişkisi hem kökte
hem çözümde saklandı. MEB kitabında basılı s.162 önce, s.163 sonra demektedir.
FRUS tarih kaydı ve PCIJ No.14 eki (PDF s.18, basılı s.143) ilk kongre protokol
tarihiyle sınanmıştır. İkincisi bir belge dizinidir; tam 1856 protokolünün okunduğu
ileri sürülmez. Açık UN ICC barındırmasında yalnız bu ekin tam URL'si izinlidir.
