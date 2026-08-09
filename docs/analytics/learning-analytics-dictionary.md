# Bilge Arena Öğrenme Analitiği Sözlüğü

**Sürüm:** 1.0 — 2026-08-08
**Kapsam:** 19 Temmuz araştırması R0.4
**İlke:** Öğrenmenin kanonik ölçümü doğrulanmış veritabanı kayıtlarından yapılır. Plausible yalnız kimliksiz ve kapalı alan listeli ürün-funnel olaylarını alır.

## Kuzey yıldızı

**Haftalık Doğrulanmış Öğrenen (HDÖ):** Europe/Istanbul haftası içinde en az bir `completed_at` değeri olan doğrulanmış attempt'e bağlı, tamamlanmış oturumu bulunan tekil kullanıcı sayısı.

Bu metrik client skoruna güvenmez. Kaynak zinciri `verified_attempts.session_id → game_sessions.id` olup R0.2'nin 091/092 migration'larına bağlıdır. Migration'lar production'a uygulanana kadar yalnız yerel olarak tanımlı ve doğrulanmıştır; production göstergesi olarak kullanılamaz.

```sql
SELECT
  date_trunc('week', va.completed_at AT TIME ZONE 'Europe/Istanbul')::date AS week_start,
  count(DISTINCT va.user_id) AS weekly_verified_learners
FROM public.verified_attempts AS va
JOIN public.game_sessions AS gs
  ON gs.id = va.session_id
 AND gs.user_id = va.user_id
 AND gs.status = 'completed'
WHERE va.completed_at IS NOT NULL
GROUP BY 1
ORDER BY 1;
```

## Olay sözlüğü

| Olay | Ne zaman oluşur? | Plausible'a giden izinli alanlar | Durum / kanonik kaynak |
|---|---|---|---|
| `LearningPlanStarted` | Kullanıcı Bugünün Planı'nı gerçekten başlatınca | `game`, sabit `surface`, `plan_size`, `completed_before`, enum `exam_ref` | **Aktif.** Funnel olayı Plausible; plan gerçeği `daily_plan`. |
| `LearningPlanCompleted` | Başarılı doğrulanmış oturum kaydından sonra planın tüm soru kümesi kapsanınca | `game`, sabit `surface`, `answered_count`, `correct_count`, `accuracy_percent`, sabit `verified=true` | **Aktif.** Funnel olayı Plausible; kanonik tamamlanma `daily_plan.completed_ids`. |
| `DueReviewCompleted` | Due kart kalıcı kimliğiyle doğrulanmış cevap transaction'ına bağlanınca | `game`, enum `result`, enum `overdue_bucket`, sabit `verified=true` | **Rezerve — R1.1.** Mevcut random-question birleştirmesi due kaynağını kalıcı cevap kaydına taşımıyor; bugün emit edilmez ve KPI değildir. |
| `DelayedCorrectnessObserved` | En az 24 saat önce görülmüş, kazanıma eşli bir sorunun yeni doğrulanmış cevabı işlendiğinde | `game`, enum `result`, enum `delay_bucket`, sabit `verified=true` | **DB'den türetilir.** Client emit edilmez; `session_answers` + `question_outcomes`, özet için `user_outcome_state.delayed_correct`. |
| `OutcomeStatusVerified` | Kazanım kanıtı `insufficient/developing/mastered` durumuna yeniden hesaplandığında | `game`, enum `status`, yalnız `evidence_bucket`, sabit `verified=true` | **DB'den türetilir.** Client emit edilmez; `user_outcome_state` + `curriculum_outcomes`. Pilot kapsamı açıkça korunur. |
| `CoachStageViewed` | Koç aşaması sunucudan başarıyla gösterildiğinde veya güvenli biçimde hata verdiğinde | `game`, enum `stage`, enum `result` | **Aktif.** Plausible; soru ID'si, ipucu veya hata metni gönderilmez. |
| `CoachTransferResult` | Koç yardımından sonraki bağımsız transfer sorusu doğrulanınca | `game`, enum `result`, `coach_depth` (0–4), enum `timing`, sabit `verified=true` | **Rezerve — R2.** Transfer katmanı henüz yok; bugün emit edilmez ve KPI değildir. |

Kod kontratı: `src/lib/analytics/learning-events.ts`. Aktif çağrı noktaları `quiz-engine.tsx` ve `bilge-chan-companion.tsx` içindedir.

### Enum sözlüğü

- `exam_ref`: `TYT`, `AYT-SAY`, `AYT-EA`, `AYT-SOZ`, `YDT`, `LGS`, `none`, `other`.
- `stage`: `hint1`, `hint2`, `hint3`, `solution`.
- `result`: `correct`, `incorrect`, `skipped`; Koç aşamasında `shown`, `error`.
- `overdue_bucket`: `due_today`, `1_7d`, `8_30d`, `31d_plus`.
- `delay_bucket`: `1_6d`, `7_29d`, `30d_plus`.
- `status`: `insufficient`, `developing`, `mastered`.
- `evidence_bucket`: `0_2`, `3_4`, `5_9`, `10_plus`.
- `timing`: `same_session`, `next_session`, `later`.

## Gizlilik ve veri minimizasyonu

`trackLearningEvent` gelen nesneyi doğrudan göndermez; her olay için yeni bir nesneyi kapalı alan listesinden yeniden kurar. TypeScript kontrolü aşılmış olsa bile fazladan alanlar düşürülür.

Plausible'a gönderilmesi yasak olanlar:

- `user_id`, kullanıcı adı, e-posta, IP veya cihaz parmak izi;
- `session_id`, `attempt_id`, `question_id`, `outcome_id` ve diğer tekil kayıt kimlikleri;
- soru metni, seçenekler, seçilen/doğru cevap, çözüm, ipucu, prompt, token;
- serbest metin hata mesajı, kategori veya konu adı;
- kesin kanıt sayısı; bunun yerine düşük kardinalli `evidence_bucket` kullanılır.

`exam_ref` bilinmeyen veya serbest metin bir değerse ham hali gönderilmez, `other` olur. Sayısal alanlar sınırlandırılır. Geçersiz oyun veya enum değerinde olay tamamen düşürülür. Sunucu veritabanındaki kullanıcı-bağlı eğitim kayıtları harici analitik payload'ı değildir; raporlar yalnız toplulaştırılmış sorgularla üretilir.

## Destek metrikleri ve sorgulanabilir kaynaklar

| Metrik | Tanım | Kaynak | Bugünkü durum |
|---|---|---|---|
| Plan tamamlama oranı | Tam kapsanmış plan / oluşturulmuş plan | `daily_plan.question_ids`, `daily_plan.completed_ids` | Sorgulanabilir. |
| Doğrulanmış oturum tamamlama | Tamamlanmış verified attempt sayısı ve tekil kullanıcı | `verified_attempts`, `game_sessions` | Yerelde sorgulanabilir; production R0.2 deploy kapısına bağlı. |
| Gecikmeli geri getirme doğruluğu | 24+ saatlik önceki gösterimden sonra doğru / uygun doğrulanmış cevap | `session_answers`, `question_outcomes`; snapshot `user_outcome_state` | Pilot eşlemeler için sorgulanabilir. |
| Ustalaşmış kazanım oranı | `mastered` eşiğindeki kullanıcı-kazanım / kanıtı olan kullanıcı-kazanım | `user_outcome_state`, `curriculum_outcomes` | Pilot kapsamda sorgulanabilir. |
| Koç aşama ilerlemesi | `hint1 → hint2 → hint3 → solution` gösterim oranları | Plausible `CoachStageViewed` | Aktif; tekil öğrenci kohortu kurulmaz çünkü kimlik gönderilmez. |
| Due tekrar tamamlama | Tamamlanmış due kart / sunulan due kart | Gelecek `review_cards` ve doğrulanmış cevap bağı | **Mevcut değil; R1.1 öncesi raporlanmaz.** |
| Transfer başarısı | Koç sonrasında bağımsız soruda doğru sonuç | Gelecek transfer bağı / `CoachTransferResult` | **Mevcut değil; R2 öncesi raporlanmaz.** |

Plan tamamlama:

```sql
SELECT
  plan_date,
  count(*) FILTER (
    WHERE cardinality(completed_ids) >= cardinality(question_ids)
  )::numeric / NULLIF(count(*), 0) AS plan_completion_rate
FROM public.daily_plan
GROUP BY plan_date
ORDER BY plan_date;
```

Gecikmeli geri getirme doğruluğu (yalnız kazanıma eşlenmiş sorular):

```sql
WITH mapped_answers AS (
  SELECT
    current_answer.id,
    current_answer.is_correct,
    current_answer.answered_at,
    EXISTS (
      SELECT 1
      FROM public.session_answers AS previous_answer
      JOIN public.game_sessions AS previous_session
        ON previous_session.id = previous_answer.session_id
       AND previous_session.user_id = previous_answer.user_id
       AND previous_session.status = 'completed'
      JOIN public.verified_attempts AS previous_attempt
        ON previous_attempt.session_id = previous_session.id
       AND previous_attempt.user_id = previous_answer.user_id
       AND previous_attempt.completed_at IS NOT NULL
      WHERE previous_answer.user_id = current_answer.user_id
        AND previous_answer.question_id = current_answer.question_id
        AND previous_answer.id <> current_answer.id
        AND previous_answer.answered_at
          <= current_answer.answered_at - INTERVAL '24 hours'
    ) AS is_delayed
  FROM public.session_answers AS current_answer
  JOIN public.game_sessions AS current_session
    ON current_session.id = current_answer.session_id
   AND current_session.user_id = current_answer.user_id
   AND current_session.status = 'completed'
  JOIN public.verified_attempts AS current_attempt
    ON current_attempt.session_id = current_session.id
   AND current_attempt.user_id = current_answer.user_id
   AND current_attempt.completed_at IS NOT NULL
  WHERE NOT COALESCE(current_answer.is_skipped, false)
    AND EXISTS (
      SELECT 1
      FROM public.question_outcomes AS mapping
      WHERE mapping.question_id = current_answer.question_id
    )
)
SELECT
  date_trunc('week', answered_at AT TIME ZONE 'Europe/Istanbul')::date AS week_start,
  count(*) FILTER (WHERE is_delayed AND is_correct)::numeric
    / NULLIF(count(*) FILTER (WHERE is_delayed), 0) AS delayed_retrieval_accuracy
FROM mapped_answers
GROUP BY 1
ORDER BY 1;
```

Pilot kazanım durumu:

```sql
SELECT
  outcome.game,
  count(*) FILTER (
    WHERE state.attempts >= 5
      AND state.weighted_earned / NULLIF(state.weighted_possible, 0) >= 0.80
      AND state.delayed_correct >= 1
  )::numeric / NULLIF(count(*), 0) AS mastered_outcome_rate
FROM public.user_outcome_state AS state
JOIN public.curriculum_outcomes AS outcome ON outcome.id = state.outcome_id
WHERE outcome.is_active = true
GROUP BY outcome.game;
```

## Kalite kapıları

- Yeni öğrenme olayı önce bu sözlüğe ve kapalı payload kontratına eklenir.
- Soru/cevap veya kimlik alanının gönderilmediğini kanıtlayan negatif test zorunludur.
- `verified=true` yalnız server doğrulamasından sonra oluşabilen çağrı noktasında kullanılabilir.
- Rezerve olaylar gerçek veri bağı kurulmadan dashboard veya hedef metriğe alınamaz.
- Event adı veya semantiği değişirse dashboard sorguları ve bu belge aynı değişiklikte güncellenir.
