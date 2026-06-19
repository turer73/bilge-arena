-- Migration 076: error_reports pending atomik-dedup (partial unique index)
--
-- Kaynak: PR#242 Codex review P2c. POST /api/questions/report read-before-insert
-- ATOMIK degildi -> eszamanli istekler (hizli tiklama / coklu sekme / retry) ayni
-- (user_id, question_id) icin cift 'pending' rapor uretebiliyordu (#379 idempotency
-- + kuyruk-spam korumasi ihlali). DB-seviyesi partial-unique garanti eder.
--
-- Sadece status='pending' kapsar: bir rapor resolved/rejected olduktan sonra ayni
-- kullanici ayni soruyu yeniden raporlayabilir (yeni regresyon icin mesru).
--
-- Route tarafi: insert 23505 (unique_violation) -> idempotent already_reported
-- (index uygulanmadan once no-op; read-check fallback korunur).

-- 1) Mevcut cift-pending'leri temizle (en eski created_at korunur) — index-oncesi sart,
--    yoksa CREATE UNIQUE INDEX mevcut duplikalarda fail eder.
DELETE FROM public.error_reports
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY user_id, question_id ORDER BY created_at, id
    ) AS rn
    FROM public.error_reports
    WHERE status = 'pending'
  ) dups
  WHERE dups.rn > 1
);

-- 2) Atomik dedup garantisi (idempotent — IF NOT EXISTS).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_error_reports_pending_user_question
  ON public.error_reports (user_id, question_id)
  WHERE status = 'pending';
