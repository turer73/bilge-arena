-- Migration 223: depoda olmayan ikinci disposable-email tetikleyicisini kaldir.
--
-- Uretimde auth.users uzerinde iki BEFORE INSERT tetikleyicisi var (2026-10-17 salt okuma):
--   block_disposable_email_trg  -> block_disposable_email()   048; public.disposable_email_domains tablosu
--   trg_block_disposable_emails -> block_disposable_emails()  hicbir migration olusturmaz; govdede sabit 32 alan adi
-- Tam zincir CI'i bu fonksiyonu uretimde olup zincirde olmayan tek fonksiyon olarak buldu
-- (database/migration-chain/known-production-drift.json, disc #2597).
--
-- Sabit listedeki 7 alan adi tabloda yok. Tetikleyici dogrudan kaldirilirsa bu adreslerle kayit
-- acilir; bu yuzden once tabloya eklenir, sonra yetim tetikleyici ve fonksiyon dusurulur.
-- Etki: o 7 alan adiyla kayit yine reddedilir, yalniz hata 048'in mesaji ve check_violation
-- koduyla gelir. Diger kayitlar degismez (048 tetikleyicisi alfabetik olarak once calisiyordu).
-- Sifirdan kurulan zincirde yetim nesneler yoktur; DROP ... IF EXISTS orada etkisizdir.
--
-- Geri alma gerekmez: kayit kapisi daralmaz, 32 alan adinin tamami tabloda kalir.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

INSERT INTO public.disposable_email_domains (domain, source) VALUES
  ('bitmah.com',     'migration-223-orphan-trigger'),
  ('fakeinbox.com',  'migration-223-orphan-trigger'),
  ('getairmail.com', 'migration-223-orphan-trigger'),
  ('homvela.com',    'migration-223-orphan-trigger'),
  ('kynninc.com',    'migration-223-orphan-trigger'),
  ('mailinator.net', 'migration-223-orphan-trigger'),
  ('tempmail.net',   'migration-223-orphan-trigger')
ON CONFLICT (domain) DO NOTHING;

DROP TRIGGER IF EXISTS trg_block_disposable_emails ON auth.users;
DROP FUNCTION IF EXISTS public.block_disposable_emails();

-- Kapi daralmadi mi: 048 tetikleyicisi etkin ve yetim listenin 32 alan adinin tamami tabloda.
DO $verify$
DECLARE
  v_covered integer;
BEGIN
  IF to_regprocedure('public.block_disposable_emails()') IS NOT NULL THEN
    RAISE EXCEPTION '223: block_disposable_emails() hala var' USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'block_disposable_email_trg'
      AND NOT tgisinternal
      AND tgenabled <> 'D'
      AND tgfoid = 'public.block_disposable_email()'::regprocedure
  ) THEN
    RAISE EXCEPTION '223: 048 tetikleyicisi (block_disposable_email_trg) yok ya da kapali; kayit kapisi korumasiz kalir'
      USING ERRCODE = '55000';
  END IF;

  SELECT count(*) INTO v_covered
  FROM public.disposable_email_domains
  WHERE domain IN (
    'itquoted.com', 'bitmah.com', 'homvela.com', 'kynninc.com',
    'tempmail.net', 'tempmail.com', 'temp-mail.org', 'temp-mail.io',
    'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
    'mailinator.com', 'mailinator.net', 'yopmail.com', 'yopmail.fr',
    'fakeinbox.com', 'fakemailgenerator.com',
    '10minutemail.com', '10minutemail.net',
    'throwawaymail.com', 'mintemail.com',
    'maildrop.cc', 'getairmail.com',
    'sharklasers.com', 'spam4.me', 'trashmail.com',
    'tempinbox.com', 'inboxbear.com', 'emailondeck.com',
    'mohmal.com', 'mailcatch.com', 'dispostable.com'
  );
  IF v_covered <> 32 THEN
    RAISE EXCEPTION '223: yetim listenin % / 32 alan adi tabloda', v_covered USING ERRCODE = '55000';
  END IF;
END
$verify$;

COMMIT;
