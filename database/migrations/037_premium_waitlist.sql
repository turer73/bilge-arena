-- ============================================================
-- Migration 037: Premium lansman bekleme listesi (waitlist)
-- ============================================================
-- Tam odeme entegrasyonu Asama 3 (12+ ay) icin erteli; bu arada
-- /arena/premium sayfasindaki "Odeme yakinda" alert'i yerine email
-- toplama formu var. Bu tablo o submit'leri saklar.
--
-- Tasarim notlari:
--   * email case-insensitive UNIQUE: ayni email iki kez submit edilirse
--     sessizce idempotent davran (ON CONFLICT DO NOTHING route'da).
--   * kvkk_consent_at NOT NULL: KVKK m.5 acik riza kaniti zorunlu.
--     consent_logs tablosundaki audit'le tutarli.
--   * source: hangi plan butonundan geldigi ('monthly' | 'yearly').
--   * ip_address + user_agent: spam/bot tespiti icin minimal forensic.
--   * contacted_at: admin kullanici tarafindan iletilen kayit isaretleme.
--
-- Veri akisi:
--   anon POST /api/premium/waitlist  (rate-limit + zod validate)
--     -> INSERT INTO premium_waitlist (RLS: anon INSERT izni)
--     -> Resend confirmation email (best-effort, hata sessiz gecer)
--
-- Admin gorunumu:
--   Sonraki adimda /admin/waitlist sayfasi eklenebilir (bu migration'da yok).
-- ============================================================

CREATE TABLE IF NOT EXISTS premium_waitlist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  source text,
  kvkk_consent_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  contacted_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Email case-insensitive UNIQUE: "Ali@x.com" ile "ali@x.com" ayni satir.
-- Idempotent submit: API route'ta ON CONFLICT DO NOTHING ile sessiz basari.
CREATE UNIQUE INDEX IF NOT EXISTS idx_premium_waitlist_email_lower
  ON premium_waitlist (lower(email));

-- Admin liste sorgusu icin (yeni kayitlar once)
CREATE INDEX IF NOT EXISTS idx_premium_waitlist_created_at
  ON premium_waitlist (created_at DESC);

-- Plan kirilim raporu icin
CREATE INDEX IF NOT EXISTS idx_premium_waitlist_plan
  ON premium_waitlist (plan);

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE premium_waitlist ENABLE ROW LEVEL SECURITY;

-- Anon ve authenticated users INSERT yapabilir (acik form, login gerekmez)
CREATE POLICY "premium_waitlist_insert_anyone"
  ON premium_waitlist FOR INSERT
  WITH CHECK (true);

-- SELECT sadece admin (user_roles RBAC ile)
-- Pattern: questions tablosundaki select_admin_rbac ile uyumlu
CREATE POLICY "premium_waitlist_select_admin"
  ON premium_waitlist FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = (select auth.uid())
        AND rp.permission IN ('admin.users.view', 'admin.full')
    )
  );

-- UPDATE sadece admin (contacted_at isaretleme)
CREATE POLICY "premium_waitlist_update_admin"
  ON premium_waitlist FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = (select auth.uid())
        AND rp.permission IN ('admin.users.view', 'admin.full')
    )
  );

-- DELETE yok: kayit silmeye gerek yok, KVKK silme talebi gelirse
-- account/delete akisindaki gibi user_id kullanmadigi icin manuel admin SQL ile.
