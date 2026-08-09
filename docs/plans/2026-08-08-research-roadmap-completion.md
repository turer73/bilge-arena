# Bilge Arena — 19 Temmuz Araştırması Tamamlama Programı

**Başlangıç:** 2026-08-08
**Kaynak:** 19 Temmuz 2026 ürün araştırması
**Sorumlu / son onay:** Sol
**Uygulayıcı:** DeepSeek API; erişim engelinde Sol, migration düzeltmelerinde Terra
**Bağımsız kontrol:** Terra

## Çalışma protokolü

Her dilim aynı kapılardan geçer:

1. Sol kapsamı, tehdit modelini ve ölçülebilir kabul kriterlerini yazar.
2. DeepSeek yalnız bu kapsam için küçük ve incelenebilir bir patch üretir. API/ortam limiti ilerlemeyi engellerse Sol aynı kapsam ve test kapılarıyla uygular; migration sorunlarında Terra uygulayıcı olabilir.
3. Sol patch'i uygular; type-check, hedefli test, tam test ve gerekiyorsa migration lint çalıştırır.
4. Terra diff'i bağımsız olarak güvenlik, doğruluk, veri bütünlüğü ve test yeterliliği açısından inceler.
5. Sol bulguları doğrular, gerekli düzeltmeleri yaptırır ve son onayı verir.
6. Canlı migration/deployment ayrı bir kapıdır; doğrulanmadan madde “canlı tamamlandı” sayılmaz.

## Başlangıç durumu

- Atomik oturum tamamlama, sunucu notlaması ve XP günlüğü üretimde mevcut; sunucu tarafından önceden verilen tek kullanımlık oturum henüz yok.
- Yanlışlarım ve FSRS V1 mevcut; kalıcı kart/günlük, hata nedeni ve genel rollout tamamlanmadı.
- Bugünün 15'i üretimde; mevcut bileşim `6 due + 4 weak + 5 new`.
- Kazanım haritası üretimde pilot: 1 kazanım, 120 soru eşlemesi.
- Bilge Koç kademeli ipucu pilotu mevcut; teşhis/transfer/eval katmanı eksik.
- Yakın-rakip ligleri, takım görevleri, Kâğıt Modu, öğretmen paneli ve içerik revizyon sistemi yok.

## Uygulama sırası ve tamamlanma ölçütleri

### R0 — P0 kapanış

#### R0.1 Özel sayfa PWA cache güvenliği

**Durum (2026-08-08):** Yerel uygulama ve bağımsız inceleme tamamlandı; henüz commit, PR veya canlı dağıtım yapılmadı.

- Service worker hiçbir HTML navigation yanıtını runtime cache'e yazmaz.
- Eski runtime cache sürümü activate sırasında temizlenir.
- API ve statik asset davranışı korunur.
- Offline navigation yalnız sabit `/offline` fallback'ine düşer.
- Regresyon testi özel `/arena/*` yanıtının cache'e yazılmadığını kanıtlar.
- Kanıt: hedef test `8/8`, tam paket `224/224` dosya ve `2390/2390` test, type-check, scoped ESLint ve `git diff --check` geçti; Terra `APPROVE` verdi.
- Derleme notu: izole worktree'nin paylaşılan `node_modules` junction'ı Turbopack tarafından proje kökü dışına işaret ettiği için reddedildi; uygulama koduna ait bir derleme hatası gözlenmedi, fakat temiz bağımlılık kurulumu ile üretim build'i hâlâ doğrulanmalıdır.

#### R0.2 Sunucu tarafından verilen tek kullanımlık oturum

**Durum (2026-08-08):** Yerel uygulama ve bağımsız inceleme tamamlandı; henüz commit, PR, migration uygulaması veya canlı dağıtım yapılmadı.

- Oyun başlamadan sunucu `verified_attempt`/session kimliği üretir.
- Kimlik kullanıcı, oyun, soru listesi, süre ve son kullanma zamanı ile bağlıdır.
- Tamamlama yalnız sunucunun verdiği soru listesi ve ilk cevaplar için kabul edilir.
- Aynı kimlik ikinci kez ödül üretemez.
- Başlatma ve tamamlama yolları rate-limit, auth ve replay testleriyle kapsanır.
- `091_verified_attempts.sql` özel ticket tablosunu ve yalnız service-role tarafından çağrılabilen üretim RPC'sini; `092_complete_verified_game_session.sql` ise kilitli, süre/kullanıcı/oyun/mod/soru/replay doğrulamalı atomik tamamlama sarmalayıcısını ekler.
- Uygulamadaki random, Bugünün Planı, Akıllı Deneme, Fethet ve Kule başlangıç/notlama yolları ticket taşır; authenticated oturum kaydı ticket olmadan kapalı davranır.
- Bugünün Planı yalnız doğrulanmış session kaydı başarıyla tamamlandıktan sonra işaretlenir; result ekranına geçiş veya başarısız kayıt planı tamamlamaz.
- Kanıt: hedefli son regresyon testi `18/18`, Terra hedef grubu `69/69`, SQL statik testleri `37/37`, tek kullanımlık gerçek PostgreSQL entegrasyonu `6/6`, tam paket `225/225` dosya ve `2431/2431` test, type-check, migration lint (`95` migration), scoped ESLint ve `git diff --check` geçti; Terra `APPROVED` verdi.
- Canlı kapı: migration sırası, production build, deploy/smoke ve rollback henüz uygulanmadı; bu nedenle madde yalnız “yerelde tamamlandı” durumundadır.

#### R0.3 Ödül bütünlüğü

**Durum (2026-08-08):** Yerel uygulama, gerçek PostgreSQL doğrulaması ve bağımsız inceleme tamamlandı; henüz commit, PR, canlı migration uygulaması veya dağıtım yapılmadı.

- Session, cevaplar, soru istatistiği, coin, XP, görev ilerlemesi, rozet ödülü ve öğrenme kanıtı tek atomik işlemde güncellenir veya açık biçimde ayrı idempotent outbox işleri olur.
- Ödül günlüğü append-only olur; kullanıcı rolü INSERT/UPDATE/DELETE yapamaz.
- Her ödül kaydı benzersiz kaynak kimliğine sahiptir.
- Eşzamanlı/replay veritabanı testleri çift ödül üretilmediğini kanıtlar.
- `093_reward_integrity.sql`, doğrulanmış attempt bağlama transaction'ına görev ilerlemesi, rozet/rozet XP'si ve tekil kaynak kimlikli `reward_ledger` kayıtlarını ekler; helper hatası tüm session zincirini geri alır.
- İstemci kontrollü `/api/quests PATCH` yolu `405` ile kapatıldı. Görev claim'i, claim bayrağı + XP + coin + ledger satırlarını tek `claim_daily_quest_reward` RPC'sinde uygular ve replay'de ilk sonucu döndürür.
- `xp_log` authenticated kullanıcılar için salt-okunur hale getirildi; `reward_ledger` client DML'ine ve service-role `UPDATE/DELETE/TRUNCATE` işlemlerine kapalıdır.
- Kanıt: uygulama hedef grubu `73/73`, tam paket `226/226` dosya ve `2435/2435` test, SQL statik testleri `43/43`, type-check, scoped ESLint, migration lint (`96` migration), iki DB test dosyasında `node --check` ve `git diff --check` geçti.
- Tek kullanımlık gerçek PostgreSQL'de gerçek `081→091→092→093` zinciri `5/5` geçti: katalog/ACL/RLS, taze ödül seti, aynı attempt eşzamanlılığı, helper hatasında tam rollback ve eşzamanlı quest claim doğrulandı. İlk koşunun ortaya çıkardığı test-imza kusurları ve görev-ledger MVCC görünürlük kusuru Terra tarafından düzeltildi; son incelemede Terra `APPROVED` verdi.
- Canlı kapı: production migration/deploy/smoke ve rollback uygulaması henüz yapılmadı; bu nedenle madde yalnız “yerelde tamamlandı” durumundadır.

#### R0.4 Öğrenme analitiği sözlüğü

**Durum (2026-08-08):** Yerel uygulama ve bağımsız inceleme tamamlandı; henüz commit, PR veya canlı dağıtım yapılmadı.

- Plan başlatma/tamamlama, due tekrar, gecikmeli doğruluk, kazanım doğrulama, Koç aşaması ve transfer sonucu olayları tanımlanır.
- PII ve soru cevabı analitiğe gönderilmez.
- Kuzey yıldızı ve destek metriklerinin sorgulanabilir veri kaynağı belgelenir.
- [`learning-analytics-dictionary.md`](../analytics/learning-analytics-dictionary.md), kuzey yıldızını “Haftalık Doğrulanmış Öğrenen” olarak tanımlar; plan, gecikmeli geri getirme ve kazanım metrikleri için doğrulanmış DB zincirli sorguları içerir.
- `trackLearningEvent` her payload'ı kapalı alan listesinden yeniden kurar. Kullanıcı/session/attempt/soru/kazanım kimliği, soru veya cevap içeriği, ipucu, token ve serbest hata metni Plausible'a gidemez; bilinmeyen sınav referansı `other` olur.
- `LearningPlanStarted`, yalnız gerçek Bugünün Planı başlangıcında; `LearningPlanCompleted`, tüm plan kapsamı server-doğrulanmış session sonucuyla tamamlandığında emit edilir. `CoachStageViewed`, yalnız sunucu aşaması gösterildiğinde veya güvenli hata durumunda çalışır.
- Due tekrar ve transfer olayları sırasıyla R1.1 ve R2'de kalıcı veri bağı kurulana kadar **rezerve** durumdadır ve KPI olarak raporlanmaz. Gecikmeli doğruluk ile kazanım durumu client event'i yerine kanonik DB kayıtlarından türetilir.
- Terra'nın ilk incelemesindeki iki P1 kapatıldı: analitik başarı sayıları artık replay dahil RPC'nin persisted sonucundan gelir; gecikmeli doğruluk SQL'i hem güncel hem önceki cevabı `verified_attempts → completed game_sessions` zinciriyle sınırlar. Kapanış incelemesinde Terra `APPROVED` verdi.
- Kanıt: ilgili regresyon grubu `72/72`, tam paket `227/227` dosya ve `2441/2441` test, type-check, scoped ESLint ve `git diff --check` geçti.

#### R0.5 Dokümantasyon doğruluğu

**Durum (2026-08-08):** Yerel dokümantasyon güncellemesi ve bağımsız inceleme tamamlandı; henüz commit veya PR yapılmadı.

- 25 Mayıs eski yol haritası arşivlenir veya güncel gerçek duruma yönlendirir.
- Bu belge her birleşen dilimde durum ve kanıt bağlantısıyla güncellenir.
- `2026-05-25-ozellik-yol-haritasi.md` ve `2026-05-25-yapilacaklar.md` başına “tarihsel belge” uyarısı ile bu kanonik plana bağlantı eklendi; eski açık/kapalı işaretlerinin canlı durum olarak kullanılmaması açıklandı.
- R0.1–R0.5 için yerel/canlı sınırı, test kanıtı ve bağımsız inceleme durumu bu belgede ayrı tutulur. R0.5 yönlendirmeleri Terra tarafından doğru bulundu.

### R1 — Öğrenme Döngüsü V2

#### R1.1 Kalıcı FSRS ve Yanlış Defteri

**Durum (2026-08-08):** Yerel uygulama ve doğrulama tamamlandı; henüz commit/PR, canlı migration, backfill, rollout veya deploy yapılmadı.

- `review_cards`, `review_logs` ve kontrollü hata nedeni modeli eklenir.
- Her notlanan ilk cevap atomik olarak kartı günceller; skip kartı değiştirmez.
- Due tarih, stability, difficulty ve retrievability API'de güvenli biçimde sunulur.
- Eski cevap geçmişinden idempotent backfill ve geri alma planı bulunur.
- Genel quiz rollout'u yüzde kapıları ve öğrenme metrikleriyle 5→25→50→100 ilerler.
- Migration 094, pinned `ts-fsrs@5.4.1` ikili geçişini aynı transaction trigger'ıyla uygular; append-only ham log, owner-korumalı kontrollü hata nedeni, bounded cursor backfill ve private operasyon RPC'leri içerir.
- Persistent okuma ayrı `FSRS_PERSISTENT_READ_*` yüzdelik kapısı ve kill switch ile çalışır; eksik kart yalnız o soru için kanonik geçmiş fold'una döner. Yanlışlarım API/UI güvenli FSRS metriklerini ve serbest metinsiz altı hata nedeni seçimini sunar.
- Kanıt: disposable gerçek PostgreSQL 10/10 (parite, concurrency, idempotency, rollback, owner, ACL/RLS); DB statik 4/4; tam paket 228/228 dosya ve 2466/2466 test; type-check, scoped ESLint, 97 migration lint ve `git diff --check` geçti.
- Canlıya geçiş sırası değişmedi: migration/trigger → bounded backfill ve invariant kontrolü → okuma %5→25→50→100. Bu operasyonların hiçbiri bu yerel kapanışta çalıştırılmadı.

#### R1.2 Bugünün 15'i tam bileşim

**Durum (2026-08-08):** Yerel uygulama, gerçek PostgreSQL doğrulaması ve bağımsız inceleme tamamlandı; henüz commit/PR, canlı migration veya deploy yapılmadı.

- Hedef: 5 due + 5 zayıf kazanım + 3 güncel hedef + 1 zorlayıcı + 1 öğrenci seçimi.
- Eksik havuzlar deterministik ve belgeli fallback ile doldurulur.
- Plan öğeleri kaynak türü ve tamamlanma durumuyla ayrı kaydedilir.
- Aynı TR gününde idempotent, sınav türü değişiminde doğru ayrışır.
- `095_daily_plan_items_v2.sql`, sıralı/private öğe snapshot'ı ile atomik create/complete RPC'lerini ekler. V2 ve legacy tamamlama aynı owner-korumalı RPC'den geçer; legacy eşzamanlı union plan sırasını korur.
- Route, bounded due/outcome/question/history adaylarını saf ve deterministik composer'a verir; hedef slot ile gerçek fallback kaynağını ayrı saklar. API güvenli item etiketi döndürür, outcome UUID/source_ref ve cevap içeriği döndürmez.
- Terra'nın iki P1 bulgusu kapatıldı: `exam_ref=NULL` due kapsamı exact `IS NULL` oldu ve legacy PATCH kayıp-güncelleme yarışı DB satır kilidi altına taşındı.
- Kanıt: hedef grup `42/42`, DB statik `4/4`, disposable gerçek PostgreSQL `6/6`, tam paket `231/231` dosya ve `2477/2477` test; type-check, scoped ESLint, `98` migration lint ve `git diff --check` geçti.
- Ayrıntılı tasarım ve rollback sırası: [`2026-08-08-r1-2-todays-15-v2.md`](./2026-08-08-r1-2-todays-15-v2.md). Canlı migration/deploy/smoke henüz uygulanmadı.

#### R1.3 Tam kazanım grafiği

**Durum (2026-08-08):** Yerel uygulama, Sol gerçek-PostgreSQL doğrulaması ve son düzeltmelerin bağımsız Terra yeniden incelemesi tamamlandı. Henüz commit/PR, canlı migration, backfill veya deploy yapılmadı.

- Ders → ünite → konu → kazanım hiyerarşisi kurulur.
- Aktif pilot dersin tüm soruları en az bir kazanımla eşleşir.
- Doğruluk, zorluk, süre, ipucu ve gecikmeli tekrar kanıtı kullanılır.
- Mapping kapsama ve yetim soru kontrolleri CI'da çalışır.
- `096_curriculum_graph_v1.sql`, Bilge Arena iç `ba-tyt-math-v1` taksonomisinde TYT Matematik için course→unit→topic→outcome ağacını, altı kategori leaf'ini, mevcut/gelecek soru auto-mapping'ini ve fail-closed count-only integrity RPC'sini ekler. Resmî MEB kodu iddiası yoktur.
- `097_mastery_evidence_v2.sql`, verified completion sonrası append-only outcome evidence, zorluk/süre/hızlı-yanlış/gecikmeli doğru, attempt'e bağlı kademeli hint, kontrollü guess/careless annotation delta'ları ve 1..1000 bounded idempotent backfill ekler.
- `/api/profile/mastery`, DB/user/attempt/session/answer kimliği veya cevap içeriği sızdırmadan exact TYT kapsamını, güvenli ağacı ve açıklanabilir skor bileşenlerini döndürür. Pilot dışı scope açık `unsupported` olur; runtime parser geç kalan veya bozuk/ek alanlı payload'ı reddeder.
- `/arena/hakimiyet` tam öğrenci haritasını gösterir; çalışma hub'ı en zayıf leaf'i ve haritaya geçişi sunar. Pratik CTA mevcut oyun/kategori/sınav filtrelerini kurar, sahte sabit soru sayısı vadetmez.
- Koç istekleri artık verified `attemptId` taşır; aşama tokeni attempt'e de bağlıdır. Server attempt owner/soru/süre ön kontrolü yapar ve hint yanıtını yalnız owner-korumalı evidence RPC'si başarıyla kaydederse döndürür.
- Kanıt: 096 disposable PostgreSQL `5/5`, 097 disposable PostgreSQL `5/5`, DB statik `8/8`, birleşik uygulama hedef grubu `13/13` dosya ve `90/90` test, tam paket `238/238` dosya ve `2511/2511` test geçti. Type-check, scoped ESLint, migration lint (`100` dosya) ve `git diff --check` temizdir. Tam ESLint `0` hata ile geçti; kapsam dışındaki mevcut kodda `21` uyarı raporladı.
- Ayrıntılı tasarım/rollback: [`2026-08-08-r1-3-outcome-graph.md`](./2026-08-08-r1-3-outcome-graph.md).
- Bağımsız kapı: Terra son deferred-bound ve uygulama bağlantısı dahil 096/097 migration, mastery evidence/API ve UI sınırını yeniden inceledi; P0/P1 bulmadan `APPROVED` verdi.

### R2 — Kişiselleştirme

- Kısa başlangıç tanılaması, kazanım tabanlı adaptif seçim ve yeniden tanılama.
- Bilge Koç: deneme şartı, yanılgı sınıflama, kademeli ipucu, mini örnek, çözüm ve bağımsız transfer sorusu.
- Koç yanıtları yalnız onaylı soru/çözüm/kazanım bağlamına dayanır; kaynak ve eval sonucu izlenir.
- Deneme sınavında süre/strateji analizi ve kontrollü deney altyapısı eklenir.

#### R2.1 Kısa adaptif tanılama

**Durum (2026-08-08):** Exact `matematik + TYT + ba-tyt-math-v1` pilotu için tasarım, yerel uygulama, Sol doğrulaması ve bağımsız Terra incelemesi tamamlandı. Henüz commit/PR, canlı migration, pilot veya deploy yapılmadı.

- En fazla 10 soruluk akış önce altı outcome'u kapsar, sonra dört doğrulama sorusunu oturum içindeki en zayıf outcome'lara yöneltir.
- Zorluk doğru yanıtta bir kademe yükselir, yanlış yanıtta bir kademe düşer; yeniden tanılama son önerilen seviyeden başlayabilir.
- Tanılama coin/XP/seri/lig üretmez, cevap anahtarı açmaz ve normal mastery kanıtından ayrı düşük-güvenli başlangıç tahmini olarak saklanır.
- Kanıt: uygulama hedef grubu `7/7` dosya ve `55/55` test, DB statik `4/4`, disposable gerçek PostgreSQL `5/5`, tam paket `244/244` dosya ve `2563/2563` test geçti. Type-check, scoped ESLint, migration lint (`101` migration) ve `git diff --check` temizdir. Tam ESLint `0` hata ile geçti; kapsam dışındaki mevcut kodda `21` uyarı raporladı. Masaüstü/mobil giriş kapısı tarayıcı kontrolü temizdir; canlı migration olmadığı için imzalı aktif akış tarayıcıda çalıştırılmadı. Terra P0/P1 bulmadan `APPROVED` verdi.
- Ayrıntılı veri, API, güvenlik, test ve rollback sözleşmesi: [`2026-08-08-r2-1-adaptive-diagnostic.md`](./2026-08-08-r2-1-adaptive-diagnostic.md).

#### R2.2 Kontrollü Bilge Koç

**Durum (2026-08-08):** Doğrulanmış deneme kapsamındaki kontrollü Koç için tasarım, yerel uygulama, Sol doğrulaması ve gerçek PostgreSQL koşusu tamamlandı. Henüz commit/PR, canlı migration, gerçek model çağrısı, pilot veya deploy yapılmadı.

- Öğrenci önce normal cevabı etkilemeyen bir ilk seçenek işaretler; ardından olası yanılgı + ilk ipucu, daha açık ikinci ipucu, çözülmüş küçük örnek ve onaylı çözüm sırasıyla açılır.
- DB, yalnız aynı aktif primary outcome ve exact game/exam kapsamındaki onaylı soruyu transfer olarak seçer; transfer cevabı server-side notlanır ve Koç etkililiği için aynı session'da kaydedilir. Coin, XP, seri, lig, görev ve normal mastery etkilenmez.
- İstemci serbest prompt/içerik gönderemez. Ayrı zorunlu `COACH_TOKEN_SECRET` user/attempt/question/session/aşama/expiry/transfer bağını imzalar. UI/API varsayılan-kapalı ayrı kill switch'lere; üçüncü taraf model de ayrıca `COACH_AI_ENABLED=true` açık onayına bağlıdır. Genel Gemini anahtarı Koç AI'ını tek başına açmaz. Model yalnız DB-onaylı soru, çözüm ve outcome bağlamını görür; yerel sızıntı kontrolünden geçmeyen yanıt güvenli fallback'e döner.
- Private/RLS 099 tabloları ilk seçimi değiştirilemez, aşamaları sıralı/idempotent ve event'leri append-only tutar. Service role tablo DML yetkisi almaz; yazma yalnız owner/scope doğrulayan RPC'lerden geçer.
- Kanıt: uygulama hedefi `6/6` dosya ve `46/46` test, DB statik `5/5`, disposable gerçek PostgreSQL `4/4`, TDK `507/507`, tam paket `245/245` dosya ve `2567/2567` test geçti. Type-check, scoped ESLint, migration lint (`102` migration) ve `git diff --check` temizdir. Tam ESLint `0` hata ile geçti; kapsam dışı mevcut kodda `21` uyarı raporladı.
- Yerel gerçek bileşen/fixture API tarayıcı kontrolü 1440×900 ve 390×844 boyutlarında sıralı akışı, kaynak etiketini, en az 44 px hedefleri ve taşmasız görünümü doğruladı; konsol hatası yoktu. Bu, canlı migration/auth/model smoke testi değildir.
- Terra'nın bulduğu gerçek RPC/route `recorded` sözleşme uyuşmazlığı kapatıldı. Gerçek PostgreSQL koşularının ortaya çıkardığı UUID aggregate kusuru ve test fikstürü sızıntısı da kapatıldı; exact-primary ürün kuralı korunmuştur. Son salt-okunur incelemede Terra P0/P1 bulmadan `APPROVED` verdi.
- Ayrıntılı sözleşme ve rollback: [`2026-08-08-r2-2-guided-coach.md`](./2026-08-08-r2-2-guided-coach.md).

#### R2.3 Akıllı Deneme strateji analizi ve kontrollü deney

**Durum (2026-08-08):** Yeni doğrulanmış Akıllı Deneme attempt'leri için tasarım, yerel uygulama, Sol doğrulaması, disposable gerçek PostgreSQL koşusu ve bağımsız Terra incelemesi tamamlandı. Henüz commit/PR, canlı migration, deney aktivasyonu, pilot veya deploy yapılmadı.

- Immutable ordered soru/provenance snapshot'ı atomic issue edilir; start, event, finalize ve exposure ayrı owner-scoped RPC'lerle, varsayılan-kapalı iki uygulama flag'i ve ayrıca draft/disabled deney kapısıyla korunur. Varyant; soru seçimi, notlama, coin, XP, mastery, seri veya süreyi değiştirmez.
- Strateji süresi yalnız server receipt farkından yaklaşık hesaplanır; ağ gecikmesini içerdiği açıkça belirtilir. Eksik, negatif, deadline dışı veya answer-before-open kanıtı `unknownTiming` olur; client zamanı, soru/cevap içeriği ve kimlikler public yanıta çıkmaz.
- Kayıp issue/start HTTP yanıtları immutable snapshot üzerinden canonical replay edilir. Event slotları arrival sırasından bağımsız exact position/formula ile idempotenttir; 40 soru için server-side terminal receipt sequence'i sabit `81` olur.
- Kanıt: R2.3 uygulama hedefi `14/14` dosya ve `115/115` test, DB statik `6/6`, disposable gerçek PostgreSQL `3/3`, tam paket `250/250` dosya ve `2592/2592` test geçti. Type-check, scoped ESLint, migration lint (`103` migration), iki DB test dosyasında `node --check` ve `git diff --check` temizdir. Tam ESLint `0` hata ile geçti; kapsam dışındaki mevcut kodda `21` uyarı raporladı.
- 1440×900 ve 390×844 gerçek tarayıcı kontrolünde panel taşma/kırpılma ve konsol hatası üretmedi; erişilebilir bölge/başlık, yaklaşık süre uyarısı ve en az `6.47:1` metin kontrastı doğrulandı. Bu canlı migration/auth/pilot smoke testi değildir.
- Terra'nın ilk kapanış incelemesinde bulduğu kayıp-response ve receipt-race P1'leri düzeltildi; son salt-okunur incelemede açık P0/P1 kalmadı ve R2.3 yerel onaya uygun bulundu.
- Ayrıntılı veri, API, güvenlik, deney, test ve rollback sözleşmesi: [`2026-08-08-r2-3-mock-strategy-experiments.md`](./2026-08-08-r2-3-mock-strategy-experiments.md).

### R3 — Sosyal öğrenme

**Durum (2026-08-09):** R3.1 yakın-rakip haftalık lig, R3.2 olumlu öğrenme sıralamaları ve R3.3 takım bossu yerelde tamamlandı; R3 yerel geliştirme grubu kapandı ve sıradaki grup R4'tür. Commit/PR, canlı migration, cron aktivasyonu, pilot veya deploy yapılmadı.

- **R3.1 tamamlandı:** Açık rıza veren kullanıcılar sınav/kademe/28 günlük doğrulanmış skill'e göre 20–30 kişilik haftalık kohortlara ayrılır; yalnız doğrulanmış tamamlanmış oturumlar `15/session`, `30/İstanbul-günü` sınırıyla sosyal puan üretir. Ham XP, coin, mastery, seri ve ödül ekonomisi değişmez.
- Owner-only yanıt yalnız ilk üç ve kullanıcının ±2 komşuluğunu döndürür; başka kullanıcıların düşme bölgesi gizlenir. Block veya soft-delete sonrası kimlik redakte edilir, avatar allowlist fail-closed çalışır ve public yanıtta UUID/PII yoktur.
- Kanıt: R3.1 uygulama `17/17`, DB statik `4/4`, disposable gerçek PostgreSQL `2/2`, tam paket `256/256` dosya ve `2609/2609` test geçti. Type-check, scoped ESLint, migration lint (`104`), DB `node --check` ve diff-check temiz; tam ESLint `0` hata/`21` mevcut uyarıdır.
- 1440×900 ve 390×844 tarayıcı kontrolünde taşma/kırpılma yoktur; koyu/açık tema minimum kontrastı sırasıyla `5.24:1`/`4.76:1`, puanlar `5.83–7.17:1` aralığındadır. Component testi açık-rıza etkileşimini doğrular; browser tıklaması in-app etkileşim katmanı sınırlaması nedeniyle canlı tıklama kanıtı sayılmamıştır.
- Terra kapanış incelemesinde açık P0/P1 bulmadı. Ayrıntılı veri, API, güvenlik, mahremiyet, test ve rollback sözleşmesi: [`2026-08-08-r3-1-relative-weekly-leagues.md`](./2026-08-08-r3-1-relative-weekly-leagues.md).
- **R3.2 tamamlandı:** Aynı açık-rızalı R3.1 kohortunda yalnız doğrulanmış owned/completed session'lardan “En Çok Gelişen”, “En Düzenli” ve “En İyi Geri Dönüş” panoları üretilir. Her panoda yalnız olumlu ilk üç ve uygunsa owner satırı görünür; UUID/PII, alt tablo, eksiklik ve ara süresi public yanıta çıkmaz. Ham XP ve ödül ekonomisi değişmez.
- Kanıt: R3.2 uygulama `19/19`, DB statik `4/4`, disposable gerçek PostgreSQL `2/2`, tam paket `260/260` dosya ve `2623/2623` test geçti. Type-check, scoped ESLint, migration lint (`105`), DB `node --check` ve diff-check temiz; tam ESLint `0` hata/`21` mevcut uyarıdır.
- `1280×720` masaüstü ile `390×844` mobil açık/koyu tarayıcı kontrolünde son durumda taşma/kırpılma yoktur; minimum kontrast koyuda `6.47:1`, açıkta `6.70:1`, hata CTA'sı `44px`/`5.17:1`'dir. Terra kapanış incelemesinde açık P0/P1 bulmadı. Ayrıntılı sözleşme ve kanıt: [`2026-08-09-r3-2-positive-learning-spotlights.md`](./2026-08-09-r3-2-positive-learning-spotlights.md).
- **R3.3 tamamlandı:** Aynı R3.1 kohortu, yalnız mevcut doğrulanmış contribution zincirini kullanarak `memberCount × 30` ortak “Unutma Ejderi” hedefini tamamlar. Public ilerleme hedefte clamp edilir; yalnız takım toplamı, aktif üye sayısı ve owner katkısı görünür. Bireysel takım listesi/katkısı, UUID/PII ve yeni XP/coin/ödül yazımı yoktur.
- Kanıt: R3.3 uygulama `25/25`, DB statik `4/4`, disposable gerçek PostgreSQL `3/3`, tam paket `264/264` dosya ve `2645/2645` test geçti. Type-check, scoped ESLint, migration lint (`106`), DB `node --check` ve diff-check temiz; tam ESLint `0` hata/`21` mevcut uyarıdır.
- `1280×720` masaüstü ve `390×844` mobil açık/koyu kontrolde taşma/kırpılma yoktur; minimum kontrast koyuda `5.17:1`, açıkta `5.92:1`, retry `44px` ve semantik progressbar sözleşmesi doğrulandı. Terra kapanış incelemesinde P0/P1/P2 bulmadı. Ayrıntılı sözleşme ve kanıt: [`2026-08-09-r3-3-cohort-team-boss.md`](./2026-08-09-r3-3-cohort-team-boss.md).

### R4 — Erişim, öğretmen ve içerik güveni

**Durum (2026-08-09):** R4.1 Kâğıt Modu, R4.2 Öğretmen Sınıfları ve R4.3 İçerik Güveni yerel geliştirme/doğrulama kapısından geçti; R4 yerel geliştirme grubu kapandı. Commit/PR, canlı migration, hukuki onay, pilot veya deploy yapılmadı.

- **R4.1 yerelde tamamlandı:** Günün owner'a ait immutable planı; kişisel yazdır/PDF paketi, cevapsız QR, optik form, owner-only cevap girişi ve kalıcı depolamaya çıkmayan mobil karalama alanıyla sunulur. Aktif pakette cevap anahtarı yoktur; final notlama server-authoritative'dir. Gözetimsiz kâğıt kanıtı yalnız mastery'ye `0.5` ağırlıkla girer; verified metrik, FSRS, XP, coin, görev, seri, rozet, sosyal puan ve reward ledger yazımı yapmaz.
- Migration `104`, private/RLS snapshot tabloları ile service-role-only ve owner-scoped issue/get/submit RPC'lerini ekler. Strict submit sözleşmesi tam soru kümesini, UUID'leri, tekrar/out-of-pack cevapları ve seçenek sınırlarını fail-closed doğrular; request replay owner ve payload'a bağlıdır.
- Kanıt: R4.1 SQL statik `5/5`, disposable gerçek PostgreSQL `4/4`; son tam DB paketi `21/21` çalışan dosya ve `149/149` çalışan test başarılıdır (`13` dosya/`61` test harici DB değişkeni isteyen opt-in skip). Son tam uygulama paketi `273/273` dosya ve `2680/2680` test geçti. Next.js `16.2.12` ile type-check, npm lock dry-run, migration lint (`107`), scoped lint ve diff-check temizdir; tam ESLint `0` hata/`59` mevcut kapsam-dışı uyarıyla geçmiştir.
- `1280×720` masaüstü ve `390×844` mobil açık/koyu gerçek tarayıcı kontrolünde print/PDF, QR, optik/radio erişilebilir adları, en az `44px` dokunma hedefleri, sticky cevap paneli ve local-only scratchpad doğrulandı; yatay taşma, panel çakışması veya yeni konsol hatası görülmedi. Terra bağımsız kapanış incelemesinde P0/P1/P2 bulmadı. Ayrıntılı sözleşme ve rollback: [`2026-08-09-r4-1-paper-mode.md`](./2026-08-09-r4-1-paper-mode.md).
- **R4.2 yerelde tamamlandı:** Öğretmen sınıfı, fragment-only davet, ayrı notice/consent, server-seçimli ve ödülsüz ödev, son tarih, minimum öğrenci ilerleme agregaları ve sıkı KVKK rol/mahremiyet sınırları varsayılan-kapalı olarak uygulandı. Migration 105 statik `9/9` ve disposable gerçek PostgreSQL `6/6`; tam DB `158/158`, tam uygulama `284/284` dosya ve `2723/2723` test geçti. Exact Next.js `16.2.12` type-check/production build, migration lint (`108`), ESLint (`0` hata) ve diff-check temizdir. Masaüstü/mobil gerçek tarayıcı QA'sında no-store/no-referrer/dar CSP, hydration öncesi fragment temizliği, en az `44px` hedef ve taşmasız öğrenci/öğretmen akışları doğrulandı; temiz dev başlangıcında geçici QA rotası `404` döndü. Terra final incelemesi kabul önerdi; açık P0/P1 ve önerilen P2 kanıt açığı kalmadı. Ayrıntılı sözleşme ve kanıt: [`2026-08-09-r4-2-teacher-classrooms.md`](./2026-08-09-r4-2-teacher-classrooms.md).
- **R4.3 yerelde tamamlandı:** Immutable revizyon/kaynak/lisans/kazanım kanıtı, hazırlayan–iki bağımsız reviewer–yayın ayrımı, legacy rapor backfill'i, owner itiraz/SLA, verified-snapshot psikometri ve append-only sonuç düzeltmesi uygulandı. UGC, AI ve manuel üretim governance taslağına bağlandı; admin/öğrenci yüzeyleri ve güvenli rollout enforcement anahtarı eklendi. Revision replay kimliği, eşzamanlı canonical replay ve legacy report governance bypass P1'leri kapatıldı.
- Kanıt: exact Node `22.23.2`/Next.js `16.2.12` production build ve `176/176` statik üretim adımı geçti; tam uygulama paketi `290/290` dosya ve `2758/2758` test, son R4.3 hedefli paket `3/3` dosya ve `54/54` test başarılıdır. Tam DB statik paketi `23` dosya/`167` test geçti (`15` opt-in gerçek-DB dosyası/`71` test env yokluğu nedeniyle skip); R4.3 disposable PostgreSQL `4/4`, SQL statik `9/9` geçti. Type-check temiz, tam ESLint `0` hata/`24` mevcut uyarı, scoped ESLint `0` hata/uyarı, migration lint `109` ve diff-check temizdir.
- `1280×720` açık ve `390×844` koyu gerçek tarayıcı kabulünde üretim yönetişim/itiraz bileşenleri sabit yerel veriyle; ayrıntı, psikometri, SLA ve karar yüzeyleri açıkken doğrulandı. Yatay taşma veya ürün konsol hatası yoktur; iki görünümde `16` görünür ürün kontrolünün tamamı en az `44px` yüksekliğindedir. Korumalı admin rotasının `/giris` yönlendirmesi ayrıca uygulama içi tarayıcı ve Chrome'da doğrulandı. Terra final yeniden incelemesi açık P0/P1 bulmadı ve kabul önerdi. Yetkili kullanıcı + canlı DB tarayıcı akışı yapılmadı; commit/PR, canlı migration, rollout veya deploy hâlâ yapılmadı. Ayrıntılı sözleşme: [`2026-08-09-r4-3-content-quality.md`](./2026-08-09-r4-3-content-quality.md).

## Genel kalite kapısı

Bir madde yalnız şu koşullarda tamamlanır:

- Kabul kriterlerinin tamamı kod ve test kanıtıyla karşılanır.
- Yeni migration idempotenttir, lint ve veritabanı testinden geçer.
- `npm run type-check`, hedefli testler ve ilgili tam test grubu geçer.
- Terra'nın P0/P1 bulgusu kalmaz.
- Sol diff'i ve canlı doğrulamayı onaylar.
- Production smoke ve geri alma adımı belgelenir.
