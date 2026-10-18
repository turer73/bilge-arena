# Soru kaynak ve kapsam düzeltmesi — 19 Ekim 2026

675 soruluk önceki paketin tamamı için kullanıcı özgün üretim beyanı verdi.
Bu beyan kaynak kökenini açıklıyor; pedagojik inceleme, kaynak kanıtı kabulü,
kalite onayı veya yayın onayı oluşturmuyor.

## Düzeltilenler

- Taslak hazırlayıcı, WordQuest'in `questions.exam_ref = NULL` saklama biçimini
  revizyon kapsamına taşıyordu. Migration 187 bu ayrımı zaten tanımlıyor:
  soru NULL, revizyon YDT olmalı. Hazırlayıcı artık erişime açık
  `resolve_released_curriculum_scope` RPC'sinden doğrulanmış kaydı alıyor;
  kayıt eksik, erişilemez veya çelişkiliyse duruyor. 28 taslakta mevcut YDT
  kazanımları korunarak doğru revizyon kapsamı üretildi.
- Migration 226, AYT-SOZ edebiyatta Divan şiiri mazmun çözümlemesi için dört
  düğüm ve bir **iç beceri** ekledi. Resmî MEB kazanımı iddiası, kapsam yayını
  veya tanılama etkinleştirmesi yok. Bir taslağın eşleme eksiği kapandı.
  Canlı defter: `20261018230450 / 226_ayt_literature_internal_outcome`.
- Değişmez eski kaynak ve revizyonlara dokunulmadan 675 devam taslağı açıldı.
  Yeni kaynaklar özgünlük beyanının SHA-256'sını ve soru kimliğini taşıyor.
  Eski 675 kayıt tarihçe olarak korunuyor; incelemede yeni indeks kullanılmalı.
- 4 LGS kapsam dışı soru ve 6 sosyal sorunun iki kopyası, mevcut
  `quarantine_question_content` RPC'siyle gerekçeli olarak karantinaya alındı.
  Bu 16 kayıt silinmedi; içerikleri ve yayımlı revizyon işaretçileri korunuyor.
  Karantina, emeklilik revizyonunun yayımlandığı anlamına gelmiyor.

Önceki rapordaki “NULL WordQuest genel İngilizce kataloğu bekler” değerlendirmesi
yanlıştı. NULL saklama biçimi zaten kayıtlı YDT kapsamına bağlıydı; sorun
hazırlayıcıdaydı. Eski paket denetim izi için değiştirilmedi.

## Kanıt ve kapsam

Özel paket: `secure/question-quality-followup-20261019/`. Özgünlük beyanı,
eski/yeni revizyon eşlemesi, 675 satırlık ön kontrol ve birebir son kontrol,
karantina planı/sonucu, kaynak PDF makbuzları ve SHA256SUMS burada bulunur.
Önceki paketin 106 dosyasının hash'i yeniden doğrulandı.

[MEB matematik programı](https://mufredat.meb.gov.tr/Dosyalar/201813017165445-MATEMAT%C4%B0K%20%C3%96%C4%9ERET%C4%B0M%20PROGRAMI%202018v.pdf),
basılı s.75–76 (PDF 77–78), benzerlik ile piramit/koni alan-hacim sorularının
sınırlarını açıklar. [ÖSYM 2026 YKS kılavuzu](https://dokuman.osym.gov.tr/pdfdokuman/2026/YKS/basvuru_kilavuz06022026.pdf),
basılı s.46 (PDF 50), TYT felsefe ile AYT felsefe grubunu ayırır.
Karantina kararı, bu kapsam ayrımı ile tek tek okunan soru içeriklerinin
birlikte değerlendirilmesine dayanır.

## Kalan gerçek işler

665 taslağın kazanım eşlemesi tamam. Karantinadaki 10 özgün paket kaydının
formal emeklilik taslakları eşlemesiz kalıyor; ilgisiz kazanım atanmadı.
523 emeklilik önerisi için iki bağımsız insan incelemesi; diğer 152 düzeltme
için uygulanabilir kaynak/kalite kabulü ve yayın adımı hâlâ gerekiyor.
Hiçbir onay veya kalite kararı bu çalışmada üretilmedi.

BA-P2-DUP-519, farklı sınav havuzundaki eşini gerekçe göstererek otomatik
emekli edilmedi. Öneri bu paket açısından reddedildi; bu karar TYT etiketinin
pedagojik uygunluğunu onaylamıyor. Aynı sosyal alt kategorilerde bulunan
19 ek kayıt yalnız tarama adayıdır; tamamı için kusur veya karantina kararı
verilmedi. Ayrı inceleme listesi özel pakette korunuyor.

## Doğrulama

- 67 hazırlayıcı testi ve 15 migration sırası testi geçti.
- PostgreSQL 16.15: 22 governance + 6 grafik testi, atlama yok.
- Boş veritabanına platform, baseline ve 249 migration eksiksiz uygulandı.
- Canlı 226: doğru kapsam kabul, TYT yanlış kapsam ret; yeni kapsam yayını yok.
- Canlı 675 taslak: içerik, metadata, kaynak, kazanım, tür, taban ve onaysız
  taslak durumu ayrı ayrı doğrulandı.

Başarısız ilk yerel deneme Windows ESM yol biçimi nedeniyle başlamadı;
`file:///` ile düzeltildi. İki salt-okuma SQL denemesinde yanlış yardımcı/tablo
adı kullanıldı; hiçbir yazı oluşmadı, gerçek sözleşmeyle tekrarlandı.
PDF çıkarımında Windows çıktı kodlaması hatası UTF-8 ile giderildi.
MEB örnek materyal indirmesi 403 verdi; bunu kabul edilmiş kaynak makbuzu
olarak kullanmadık. Merkezi bug kaydı bir kez zaman aşımına uğradı.
