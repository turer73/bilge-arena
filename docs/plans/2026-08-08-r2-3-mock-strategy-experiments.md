# R2.3 — Akıllı Deneme Strateji Analizi ve Kontrollü Deney Altyapısı

**Tarih:** 2026-08-08
**Kapsam:** Yeni altyapıyla üretilen Akıllı Deneme attempt'leri; ilk kontrollü revision Matematik pilotu
**Durum:** Tasarım, yerel uygulama, Sol doğrulaması, disposable gerçek PostgreSQL koşusu ve bağımsız Terra P0/P1 incelemesi tamamlandı. Canlı migration, deney aktivasyonu, commit/PR ve deploy yapılmadı.

## Ürün sonucu

Standart deneme sonucu iki varyantta da korunur. Kontrollü deney gerçekten aktif olduğunda:

- `control` mevcut sonuç ekranını görür;
- `treatment` aynı ekrana ek olarak kısa, sabit kurallı bir strateji paneli görür;
- assignment deneme ilk kez sunucuda başlatılırken attempt'e sabitlenir;
- exposure ancak atanmış yüzey başarıyla render edildikten sonra ayrıca ve idempotent kaydedilir;
- varyant coin, XP, soru seçimi, cevap anahtarı, notlama, mastery, seri veya deneme süresini değiştirmez.

Panel soru içeriği ve seçenekleri döndürmez. Yalnız sunucuya ulaşan olaylardan elde edilen düşük kardinalli sinyalleri kullanır:

- açılış / orta / kapanış bölümlerinde planlanan, cevaplanan ve doğruluğu kanonik oturumdan doğrulanan sayı;
- soru açılışı ile kabul edilen cevap isteğinin sunucuya ulaşması arasındaki yaklaşık tempo;
- cevapsız veya zaman kanıtı eksik soru sayısı;
- sabit eşiklerle `rushed_wrong` ve `stuck` sayıları;
- en fazla üç deterministik öneri.

Bu süreler ağ gecikmesini içerir; “kesin düşünme süresi” değildir. Serbest AI metni kullanılmaz.

## Kanonik veri ve fail-closed kuralları

Eski `session_answers.time_taken_sec`, istemcinin toplu session payload'ında gönderdiği telemetridir. R2.3 bunu doğrulanmış süre veya strateji kanıtı saymaz.

Yeni pilotta kanıt zinciri şudur:

1. Personalized mock route'u tek transaction içinde mevcut `verified_attempts` ticket'ını ve Akıllı Deneme metadata/item snapshot'ını üretir.
2. Snapshot; ordered question IDs, `exam_ref`, `blueprint_version`, `source_bucket`, planlanan süre ve question-set hash içerir. Soru metni, seçenek veya cevap anahtarı içermez.
3. Kullanıcı oyuna girmeden authenticated start endpoint'i çağrılır. DB ilk gerçek `started_at` ve `deadline_at` değerlerini bir kez yazar; replay aynı sonucu döndürür.
4. `question_opened`, `answer_submitted` ve `exam_submitted` olaylarında server receipt timestamp'i DB tarafından yazılır. Client yalnız idempotency UUID, beklenen sequence ve item position gönderebilir; timestamp gönderemez.
5. Cevap doğruluğu yalnız `complete_verified_game_session` ile oluşan kanonik `session_answers` kaydından gelir.
6. Analytics finalizer yalnız tamamlanmış `verified_attempts.session_id` bağını doğrulayıp exam attempt'i bağlar. Finalizer arızası ana session/ödül transaction'ını geri almaz; idempotent retry ile onarılır ve o zamana kadar panel fail-closed kalır.
7. Public response user/session/attempt/question ID, event timestamp'i, soru metni, seçenek veya cevap anahtarı döndürmez.

Generic `mode=deneme` ve eski Akıllı Deneme kayıtları R2.3 pilotuna dahil değildir.

## Kontrollü deney sözleşmesi

Migration 100 şu private/RLS yapıları kurar:

- verified exam attempt metadata ve ordered item snapshot;
- append-only strategy events;
- versioned experiment revisions;
- attempt'e sabitlenmiş immutable assignment;
- assignment + attempt için tekil gerçek exposure.

`mock_strategy_analysis_v1` migration ile `draft` ve disabled oluşur. Client varyant, allocation veya experiment revision seçemez. Atama stable hash ile server-side yapılır ve ilk start'ta attempt'e pinlenir. Assignment (intent-to-treat) ve exposure (per-protocol) ayrı ölçülür.

Raw tablolar authenticated/anon rollere kapalıdır. Service role da doğrudan INSERT/UPDATE/DELETE/TRUNCATE yapmaz; yalnız scope doğrulayan `SECURITY DEFINER` RPC'leri kullanır. Audit satırları silinmez veya yeniden yazılmaz.

## API ve UI

- Personalized mock generation, iki app flag'inden biri kapalıyken mevcut verified-attempt yolunu aynen korur; ikisi açıkken atomic verified-exam issue RPC'sini kullanır ve `strategyEligible` döndürür. WordQuest exam-ref zinciri dışında kaldığı için legacy yolda kalır.
- `POST /api/study/mock-strategy/start`: oyunu göstermeden attempt'i başlatır ve replay-safe start sonucunu verir.
- `POST /api/study/mock-strategy/events`: yalnız soru açılışı gibi non-answer receipt olaylarını yazar.
- Grade route, kabul ettiği ilk cevap için `answer_submitted` receipt olayını best-effort yazar; analytics hatası notlamayı bozmaz.
- Session başarıyla kaydedildikten sonra experiment assignment olmasa bile verified exam finalize edilir. Yalnız aktif assignment varsa owner-scoped GET public analysis sözleşmesini döndürür.
- Exposure, control veya treatment yüzeyi render edildikten sonra ayrı POST ile kaydedilir.

Server kill switch `MOCK_STRATEGY_ENABLED=true`, build-time UI switch `NEXT_PUBLIC_MOCK_STRATEGY_ENABLED=true` olmalıdır. İkisi varsayılan kapalıdır ve atomic exam issuance için ikisi de gerekir. DB experiment revision ayrıca active/disabled kapısını geçmelidir; assignment yoksa deneme normal tamamlanır ve yalnız metadata finalize edilir.

## Analiz kuralları

- Ordered item listesi açılış / orta / kapanış olarak olabildiğince eşit üç parçaya bölünür.
- Bir item'ın yaklaşık süresi, aynı position için `question_opened.server_received_at` ile `answer_submitted.server_received_at` farkıdır.
- Eksik, negatif, deadline dışı veya çelişkili event kanıtı sıfır sayılmaz; `unknownTiming` olarak işaretlenir.
- `rushed_wrong`: doğrulanmış yanlış ve server-receipt farkı 15 saniyeden kısa.
- `stuck`: server-receipt farkı en az 90 saniye.
- Öneriler sabit öncelik sırasındadır ve en fazla üç tanedir. Tanı, zekâ veya başarı hükmü üretilmez.

## Ölçüm

Birincil sonuç önceden tanımlı `next_mock_completion_14d`; guardrail `verified_session_completion_rate`tir. Sonuç sorguları yalnız DB zincirini kullanır:

`experiment assignment/exposure → verified exam attempt → verified_attempts → completed game_sessions`

Client/Plausible kohortu kaynak kabul edilmez. Minimum örneklem ve analiz penceresi dolmadan kazanan ilan edilmez; bu dilim otomatik rollout veya winner seçmez.

## Test kapıları

- Saf analiz: segment sınırları, eksik event, rushed/stuck eşikleri, öneri sırası ve public veri sızıntısı.
- Route: default-off flags, auth, strict body/query, owner/active/deadline/item scope, replay ve analytics'in core grade/session'ı bozmaması.
- Gerçek PostgreSQL (`081 → 091 → 092 → 100`): atomic issue, immutable snapshot, start replay/deadline, event sequence/idempotency, wrong owner, assignment stability, draft/paused/disabled, exposure, finalize ve RLS/ACL.
- UI/hook: start tamamlanmadan oyun yok, session kaydından önce analiz yok, control'de mevcut ekran korunur, treatment paneli ve render sonrası tek exposure.
- Hedef/tam Vitest, type-check, scoped/tam ESLint, migration lint, `git diff --check`, masaüstü/mobil/a11y ve Terra P0/P1 kapanış incelemesi.

## Yerel tamamlanma kanıtı (2026-08-08)

- R2.3 hedef uygulama grubu `14/14` dosya ve `115/115` test; DB statik testleri `6/6`; disposable gerçek PostgreSQL entegrasyonu `3/3` geçti.
- Tam Vitest paketi `250/250` dosya ve `2592/2592` test ile geçti. Type-check, scoped ESLint, migration lint (`103` migration), iki DB test dosyasında `node --check` ve `git diff --check` temizdir. Tam ESLint `0` hata ile geçti; kapsam dışındaki mevcut kodda `21` uyarı raporladı.
- Kayıp issue/start yanıtında farklı request UUID ile canonical replay, answer-before-open yarışı, exact event-slot idempotency ve 40 soru için terminal sequence `81` gerçek PostgreSQL testinde doğrulandı.
- 1440×900 ve 390×844 gerçek tarayıcı kontrolünde panel taşma/kırpılma ve konsol hatası üretmedi; yaklaşık süre uyarısı ve erişilebilir bölge/başlık sözleşmesi doğrulandı. Ölçülen metin kontrastları en az `6.47:1` idi.
- Terra son salt-okunur incelemede açık P0/P1 bulmadan R2.3'ü yerel onaya uygun buldu.

## Canlı kapı ve rollback

Canlı sıra: migration → iki app flag kapalı deploy → DB/ACL smoke → experiment revision için ayrı onaylı activation → server flag → küçük allocation → public UI flag. Rollback önce iki app flag'i kapatır, sonra revision'ı `paused` yapar. Assignment/exposure audit kayıtları korunur; normal deneme sonucu, ödül ve mastery etkilenmez.
