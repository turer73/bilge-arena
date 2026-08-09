# R1.1 — Kalıcı FSRS ve Yanlış Defteri Uygulama Planı

**Tarih:** 2026-08-08
**Kanonik üst plan:** [`2026-08-08-research-roadmap-completion.md`](./2026-08-08-research-roadmap-completion.md)
**Durum:** Yerel uygulama ve doğrulama tamamlandı; canlı migration/deploy yetkisi verilmedi.

## Yerel kapanış — 2026-08-08

- Migration 094; kalıcı kartları, immutable ham review loglarını, kontrollü hata nedeni kataloğunu, owner-korumalı annotation RPC'sini, trigger'ı ve bounded backfill RPC'sini ekler.
- Uygulama okuması `FSRS_PERSISTENT_READ_*` kapısıyla persistent kartı kullanır; eksik/bozuk kartta yalnız ilgili soruyu geçmişten katlar. Yanlışlarım API'si soru zorluğunu `difficulty`, FSRS zorluğunu `fsrsDifficulty` olarak ayırır ve kimlik sızdırmadan güvenli metrikleri döndürür.
- Yanlışlarım ekranı yalnız altı katalog kodundan hata nedeni seçtirir; serbest metin, review-log/session/answer kimliği istemciye verilmez.
- Disposable gerçek PostgreSQL kapısı 10/10 geçti: pinned `ts-fsrs@5.4.1` paritesi, out-of-order ve aynı-zamanlı rebuild, eşzamanlı aynı-kart yazımı, idempotency, trigger rollback, owner kontrolü ve gerçek ACL/RLS matrisi.
- Tam uygulama paketi 228/228 dosya ve 2466/2466 test; DB statik testi 4/4, type-check, scoped ESLint, 97 migration lint ve `git diff --check` temizdir.
- Bu kapanış yalnız worktree'dedir. Commit, PR, merge, canlı migration, backfill, rollout veya deploy yapılmadı.

## Mevcut gerçek

- `ts-fsrs@5.4.1` (`FSRS-6.0`, `enable_fuzz=false`) doğru/yanlışı sırasıyla `Good/Again` olarak işler.
- `computeDueMap` her istekte aday soruların tüm `session_answers` geçmişini okuyup yeniden katlar.
- Kalıcı kart, append-only tekrar günlüğü ve kontrollü hata nedeni kaydı yoktur.
- Genel quiz FSRS seçimi mevcut `FSRS_REVIEW_*` kohort kapısıyla yapılır; Bugünün Planı fold yolunu doğrudan kullanır.

## Kararlar

1. **Yazma her zaman açık, okuma kademeli:** Migration uygulandıktan sonra trigger kalıcı kart/günlük üretir. Ürün okuması ayrı `FSRS_PERSISTENT_READ_*` kapısıyla 5→25→50→100 ilerler. Kill switch yalnız okuma kaynağını eski fold'a döndürür; kanonik cevap kayıtlarına dokunmaz.
2. **Aynı transaction:** `session_answers` içindeki skip olmayan her satırın `AFTER INSERT` trigger'ı aynı transaction içinde log ekler ve kartı günceller. Session/ödül transaction'ı geri alınırsa kart ve log da geri alınır.
3. **İdempotent kaynak:** Her `review_logs.answer_id` tektir. Aynı cevap ikinci kez uygulanamaz. `review_cards` anahtarı `(user_id, question_id)` olur.
4. **Algoritma paritesi:** SQL geçişi pinned `ts-fsrs@5.4.1` varsayılan ağırlıkları, iki rating eşlemesi, UTC-gün elapsed hesabı, 1/10 dakikalık learning adımları ve 10 dakikalık relearning adımıyla eşleşir. Gerçek PostgreSQL parite testi TypeScript sonuçlarıyla due/stability/difficulty/state karşılaştırır.
5. **Skip değişiklik yapmaz:** `is_skipped=true` ne log ne kart üretir.
6. **Log append-only:** `review_logs` ve hata nedeni kataloğu client DML'ine kapalıdır. `review_logs` için service-role `UPDATE/DELETE/TRUNCATE` da kapalıdır.
7. **Hata nedeni serbest metin değildir:** Aktif kod kataloğu (`knowledge_gap`, `misread`, `calculation`, `time_management`, `careless`, `guess`) kullanılır. Kullanıcı seçimi ayrı annotation tablosunda tutulur; ham not/prompt alanı yoktur.
8. **Geçmiş cevap silinmez/değişmez:** Backfill yalnız eksik `answer_id` loglarını ekler. Eski cevap yeni karttan daha eskiyse kart, loglardan kronolojik ve deterministik yeniden kurulur.

## Veri modeli

### `review_cards`

- PK: `(user_id, question_id)`
- `due_at`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`
- `reps`, `lapses`, `learning_steps`, `state`
- `last_review_at`, `last_answer_id`, `revision`, `created_at`, `updated_at`
- İndeks: `(user_id, due_at)` ve due havuzu için gerekli filtreler

### `review_logs`

- `id`, `user_id`, `question_id`, `session_id`, `answer_id UNIQUE`
- `rating` (`1=Again`, `3=Good`), `reviewed_at`
- Kartın geçiş öncesi ve sonrası due/stability/difficulty/state/reps/lapses snapshot'ı
- Sıra indeksi: `(user_id, question_id, reviewed_at, answer_id)`

### Kontrollü hata nedeni

- `review_error_reasons`: sabit kod, Türkçe etiket, aktiflik, sıra
- `review_error_annotations`: `review_log_id UNIQUE`, owner `user_id`, `reason_code`, zamanlar
- Yazma yalnız auth + owner doğrulayan service-role RPC/API üzerinden

## SQL işlevleri

- `fsrs_review_transition(...)`: tek kart + `Again/Good` için deterministik sonraki durum.
- `apply_review_answer(answer_id)`: log idempotency, kart satır kilidi, incremental geçiş; geçmişe eklemede rebuild.
- `rebuild_review_card(user_id, question_id)`: logları kronolojik katlar; backfill ve kurtarma yolu.
- `trg_update_review_card()`: skip'i atlar, `apply_review_answer(NEW.id)` çağırır.
- `backfill_review_cards(cursor, batch_size)`: tamamlanmış session cevaplarını bounded batch ile işler, cursor ve sayaç döndürür; service-role-only.
- `set_review_error_reason(user_id, review_log_id, reason_code)`: yalnız Again logunun owner'ı için kontrollü annotation upsert.

## Uygulama okuma yolu

1. Persistent-read kohortunda due bilgisi `review_cards` üzerinden O(k) okunur.
2. Kohort dışında mevcut `session_answers → foldQuestionCard` yolu değişmeden kalır.
3. Kart bulunmayan soru, backfill tamamlanana kadar fold fallback alır; eksik kart sessizce “due değil” sayılmaz.
4. `/api/review/wrong-answers` güvenli olarak yalnız şunları ekler: `dueAt`, `stability`, `fsrsDifficulty`, hesaplanmış `retrievability`, düşük kardinalli `reviewState`, kontrollü `errorReason`. Mevcut `difficulty` soru zorluğudur.
5. API kullanıcı/session/attempt/review-log kimliği veya başka kullanıcı verisi döndürmez.

## Backfill

1. Migration + trigger uygulanır; persistent read kapalı kalır.
2. Bounded script cursor ile batch çağırır. Yeniden başlatılabilir ve aynı cevapları ikinci kez uygulamaz.
3. Aşağıdaki invariants sıfır olmalıdır:
   - skip kaynaklı log;
   - aynı `answer_id` için birden fazla log;
   - logu olup kartı olmayan user/question;
   - kart `reps` ile log sayısı farkı;
   - son logdan farklı `last_answer_id`.
4. TypeScript fold ile örneklem parity raporu alınır.
5. Ancak bundan sonra persistent read %5 açılır.

## Rollout ve metrikler

- `%5` en az 24 saat: 5xx, p95, kart/fold parity, due havuz boyutu, quiz tamamlama.
- `%25` en az 24 saat: aynı metrikler + delayed retrieval doğruluğu.
- `%50` en az 48 saat: aynı metrikler + plan tamamlama ve kullanıcı geri bildirimi.
- `%100`: en az 7 gün; fold fallback kaldırılması ayrı karar.
- `FSRS_PERSISTENT_READ_KILL_SWITCH=true` yeni deploy ile tüm okumaları fold'a döndürür.

## Test kapıları

- Statik SQL: RLS/ACL, append-only, source uniqueness, trigger, skip guard, backfill bound/cursor.
- Gerçek PostgreSQL: fresh Again/Good, learning→review, review→relearning, same answer replay, concurrent same-card sessions, trigger failure rollback, out-of-order backfill/rebuild.
- TypeScript/PostgreSQL parite: due, stability, difficulty, state, reps, lapses.
- API: auth/owner, safe fields, persistent/fold cohort ayrımı, missing-card fallback, reason-code allowlist.
- Tam Vitest, type-check, migration lint, scoped ESLint, `git diff --check`.

## Geri alma

1. Önce persistent-read kill switch açılır ve deploy edilir.
2. Trigger kapatılır; yeni tabloların yazması durur. Session ve ödül yolu eski davranışta kalır.
3. Gerekirse 094 nesneleri ileri migration ile kaldırılır. `session_answers` değişmediği için kart/loglar yeniden üretilebilir.
4. Production'da kart/log tablosu silinmeden önce audit snapshot'ı alınır; bu işlem ayrı canlı yetki gerektirir.
