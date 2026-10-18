# Bekleyen migration'ların canlı yayını — 18 Ekim 2026

YDT tanılaması yedinci kazanımda eski altı-kazanım CHECK'ine takılabiliyordu.
Güncel master'da bulunan tanılama, Sosyal seçim olayı ve Türkçe kalite politikası
migration'ları kullanıcının açık üçlü yayın onayından sonra aynen uygulandı.
Bu değişiklik depodaki manifest, işlev parmak izi ve DB tiplerini canlıyla eşitler.

| Migration | Canlı ledger version |
|---|---|
| `20261013183312_adaptive_diagnostic_legacy_coverage_repair.sql` | `20261018204344` |
| `20261013184551_tyt_social_learning_epoch_forward.sql` | `20261018204353` |
| `20261014183929_revision_bound_turkce_quality_policy.sql` | `20261018204412` |

Sıra `database/migration-order.json` üzerinden korundu; eski migration içerikleri
değişmedi. Defter 174'ten 177 kayda, public işlev parmak izi 439'dan 446'ya çıktı.
Yeni işlevler altı Sosyal işlevi ve kalite çifti doğrulayıcısıdır. Var olan
işlevlerden yalnız `question_revision_validation_policy` ve
`tg_question_revision_policy_guard` değişti.

## Canlı doğrulama

- PostgreSQL 17.6: YDT salt-okuma ön kontrolü ve bağımsız son kontrol geçti.
  Yalnız eski `adaptive_diagnostic_sessions_check` kaldırıldı; diğer CHECK'ler,
  FK'ler, trigger'lar, kolonlar, sahiplik, ACL ve RLS aynı kaldı.
- Sosyal'deki dört giriş yalnız service_role için çalıştırılabilir; iki yardımcı
  PUBLIC/anon/authenticated/service_role'a kapalı. İşlevler `search_path=pg_catalog`
  kullanıyor. Canlı PostgREST'teki 8 negatif kontrol geçti: anon 401/42501,
  service_role geçersiz kullanıcı girdisi 400/22023; öğrenci kaydı üretilmedi.
- Kalite politikasının 6 izinli/yasak çift kontrolü geçti. Mevcut 28 bağın etkin
  politika ve tek-inceleme-hazırlık sonuçları değişmedi. Global `question-quality@2`
  ve etkin yayın kapısı korundu. Yalnız iki eski CHECK, iki yeni CHECK ile değişti.
- Migration öncesi/sonrası 4478 soru, 5024 revizyon, 4509 kalite kararı ve 28 bağ
  aynı kaldı; kaynak kapsamları ve mevcut hazırlık işlevleri değişmedi.
- İki Sosyal V2 bayrağı production'da `false`; bu yayın özellik etkinleştirmedi.
- Girişli kullanıcının yeni YDT taraması `39bf47ea-2530-41c5-9acb-bf50695e6158`
  tarayıcıdan tamamlandı: **10 cevap, 7/7 kazanım, completed**. Yedinci kazanım
  kaydoldu ve sonraki sorular devam etti. Başlatma ve 10 cevap HTTP 200 döndü;
  sonuçta yedi kazanım özeti gösterildi. Coin bakiyesi 1072 olarak kaldı.

## Yerel/CI kanıtı

- Boş loopback PostgreSQL 16.15: 248 migration, yayından önce ve yeni canlı
  parmak iziyle yayından sonra geçti. 446 işlev, kayıtlı üç açıklanmış fark
  dışında üretimle eşleşiyor. Bu, production verisinin klonu değildir.
- Tanılama 27, Sosyal epoch 18, Fen/Türkçe revizyon politikası 140 test:
  **185 geçti, sıfır hata ve sıfır atlama**. Kapsamlarında sınır, replay,
  actor/ACL, eşzamanlı seçim ve kalite politikası negatifleri var.
- DB tipleri, yayın sonrası `39164822398` workflow'unun taze production artifact'ı
  üzerinden alındı. Bu ilk çalışma eski checked-in tiplerde fark bulduğu için
  beklenen şekilde başarısızdır; yeni tip dosyasında yalnız yedi yeni işlevin
  sözleşmeleri (60 satır) eklenir. Son eşitlik kontrolü güncellenmiş commit üzerinde
  ayrıca yapılır.
- İlk PR CI koşusu, eski 439 işlev / 174 defter kaydı / üç pending dosya
  beklentilerinde durdu. Bu snapshot testleri yeni canlı duruma eşitlendi;
  yedi yeni tam işlev imzası ve üç gerçek ledger kaydı açıkça sabitlendi.
  Sıra, çift kayıt ve bilinmeyen farkları reddeden negatif testler korundu.

## Sınırlar ve geri dönüş

Soru yayını, kaynak kabulü, model denetimi veya Sosyal aktivasyonu yapılmadı.
Mevcut üç üs sorusunun içerik yayını ayrı #2645 kaydıdır. Kullanıcı iki sorunun
özgün üretimini bu oturumda beyan etti; bu beyan kalite kararı veya yayın kabulü
yerine geçmez. Eski #491'in iki düzeltmesi #606/#608 ile zaten taşınmıştır;
eski PR'ı güncel master üzerine birleştirmek gerekmez. #459 ayrı bir model kurulu
özelliğidir ve bu şema yayınının parçası değildir.

Transaction hata verirse kendi adımı geri alınır. YDT'de artık yedi kazanımlı
tamamlanmış kayıt bulunduğundan eski altı sınırı tekrar eklenmez. Sosyal bayrakları
kapalı tutulur. Yeni Türkçe bağları oluşursa eski migration körlemesine yeniden
çalıştırılmaz; mevcut kanıtlar korunarak dar bir ileri düzeltme hazırlanır.
Önceki gövde/izin/şema snapshot'ı ve sonuçlar yerel, Git dışı
`D:/Projelerim/.codex-tmp/ba-pending-release-20261018/` paketinde saklandı.
