-- Migration 071: XP ledger + seviye + guvenlik fix
--
-- (Prod'a MCP ile 3 parca halinde uygulandi: xp_ledger_level_security_fix +
--  xp_log_reason_expand + xp_log_reason_add_daily_login. Bu dosya kanonik birlestirme.)
--
-- KOK NEDEN: trg_xp_apply trigger'i apply_xp_to_profile() icinde NEW.xp_amount
--   okuyordu ama xp_log kolonu 'amount' → her xp_log insert trigger-hatasiyla fail
--   (tabloda 0 kayit). 3 sonuc:
--   (1) xp_log ledger olu (audit yok),
--   (2) seviye/level_name HIC guncellenmiyor (mantik sadece olu trigger'daydi →
--       1000+ XP'li 10 kullanici 'Acemi' takili kaldi),
--   (3) cift-XP landmine (biri trigger'i duzeltirse increment_xp ile cift sayar).
--   AYRICA: increment_xp 'authenticated' EXECUTE aliyordu → kullanici kendine
--   rpc('increment_xp',{...}) ile XP verebilirdi (SECURITY DEFINER self-grant).
--
-- FIX: tum mantigi increment_xp'e tasi (XP + seviye + ledger atomik), trigger kaldir,
--   increment_xp'i service_role-only yap, reason CHECK'ini genislet, mevcut
--   seviyeleri backfill et. Geriye uyumlu: eski 2-arg cagri default'larla calisir.
--   Kod tarafi: 6 route'taki dublike manuel xp_log insert'leri kaldirildi
--   (increment_xp tek ledger-yazici); dogru reason+reference gecirildi.

BEGIN;

-- 1) increment_xp: 4-arg (reason/reference) + seviye + ledger
DROP FUNCTION IF EXISTS increment_xp(uuid, integer);

CREATE FUNCTION increment_xp(
  p_user_id uuid,
  p_amount integer,
  p_reason text DEFAULT 'session_complete',
  p_reference_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  new_total INT;
  new_level INT;
  new_name  VARCHAR(32);
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'XP miktari pozitif olmali: %', p_amount;
  END IF;

  UPDATE profiles SET total_xp = COALESCE(total_xp, 0) + p_amount
  WHERE id = p_user_id
  RETURNING total_xp INTO new_total;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil bulunamadi: %', p_user_id;
  END IF;

  IF new_total >= 20000 THEN new_level := 5; new_name := 'Efsane';
  ELSIF new_total >= 10000 THEN new_level := 4; new_name := 'Usta';
  ELSIF new_total >= 4000 THEN new_level := 3; new_name := 'Uzman';
  ELSIF new_total >= 1000 THEN new_level := 2; new_name := 'Cirak';
  ELSE new_level := 1; new_name := 'Acemi';
  END IF;

  UPDATE profiles SET level = new_level, level_name = new_name
  WHERE id = p_user_id AND level != new_level;

  INSERT INTO xp_log (user_id, amount, reason, reference_id)
  VALUES (p_user_id, p_amount, p_reason, p_reference_id);
END;
$func$;

REVOKE ALL ON FUNCTION increment_xp(uuid, integer, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_xp(uuid, integer, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION increment_xp(uuid, integer, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_xp(uuid, integer, text, uuid) TO service_role;

-- 2) Kirik trigger + fonksiyonu kaldir (landmine + olu kod)
DROP TRIGGER IF EXISTS trg_xp_apply ON xp_log;
DROP FUNCTION IF EXISTS apply_xp_to_profile();

-- 3) reason CHECK genislet (callerlarin dogru reason gecmesi icin)
ALTER TABLE xp_log DROP CONSTRAINT IF EXISTS xp_log_reason_check;
ALTER TABLE xp_log ADD CONSTRAINT xp_log_reason_check
  CHECK (reason IN (
    'correct_answer', 'streak_bonus', 'speed_bonus', 'session_complete',
    'badge_earned', 'daily_quest', 'level_up_bonus', 'admin',
    'referral', 'challenge_win', 'daily_login'
  ));

-- 4) Mevcut donmus seviyeleri total_xp'den yeniden hesapla (10 kullanici)
UPDATE profiles SET
  level = CASE
    WHEN total_xp >= 20000 THEN 5 WHEN total_xp >= 10000 THEN 4
    WHEN total_xp >= 4000 THEN 3 WHEN total_xp >= 1000 THEN 2 ELSE 1 END,
  level_name = CASE
    WHEN total_xp >= 20000 THEN 'Efsane' WHEN total_xp >= 10000 THEN 'Usta'
    WHEN total_xp >= 4000 THEN 'Uzman' WHEN total_xp >= 1000 THEN 'Cirak' ELSE 'Acemi' END
WHERE level IS DISTINCT FROM (CASE
    WHEN total_xp >= 20000 THEN 5 WHEN total_xp >= 10000 THEN 4
    WHEN total_xp >= 4000 THEN 3 WHEN total_xp >= 1000 THEN 2 ELSE 1 END);

COMMIT;
