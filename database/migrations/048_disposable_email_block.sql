-- Migration 048: Disposable e-posta domain bloklama (signup hardening)
--
-- Bağlam:
--   2026-05-16 botnet saldirisinda jilij18426@itquoted.com ile 1 hesap
--   kayit edildi. itquoted.com bilinen disposable email servisi. Saldirgan
--   benzer servisleri (mailinator, guerrillamail, vs.) kullanmaya devam
--   edebilir. Bu migration auth.users INSERT'lerinde domain check yapan
--   trigger ekler.
--
-- Strateji:
--   1. Kuçük bir blocklist tablosu (~150 satir, en yaygin disposable servisler)
--   2. BEFORE INSERT trigger auth.users uzerinde
--   3. Disposable domain ise RAISE EXCEPTION → Supabase 4xx döner, kayit iptal
--
-- Tradeoff:
--   - Liste manuel maintain edilir. github.com/disposable-email-domains/disposable-email-domains
--     repo'sundan periyodik sync edilebilir (3000+ domain, agresif).
--   - Yanlis pozitif riski: bazi meşru kullanicilar disposable benzeri domain
--     kullanabilir. Cok dusuk olasilik bu app icin (Turkce ogrenci kitlesi
--     genelde gmail/outlook/hotmail kullanir).
--
-- Kombinasyon koruması:
--   Bu trigger + Supabase Captcha (hCaptcha) + 5/5dk rate limit = 3-katmanli
--   defense. Birini bypass etmek diğerlerini atlamaz.
--
-- Etki kontrolu:
--   - Google OAuth: etkilenmez (email Google'dan gelir, disposable degil)
--   - Magic link OTP: email manuel girilir → trigger devreye girer
--   - Mevcut 191 kullanici: etkilenmez (trigger sadece INSERT'te)
--
-- Rollback:
--   BEGIN;
--     DROP TRIGGER IF EXISTS block_disposable_email_trg ON auth.users;
--     DROP FUNCTION IF EXISTS public.block_disposable_email();
--     DROP TABLE IF EXISTS public.disposable_email_domains;
--   COMMIT;
--
-- Test:
--   -- Sahte INSERT (admin SQL editor'den, trigger gerçek auth.users uzerinde):
--   SELECT public.is_disposable_email('test@itquoted.com');  -- true
--   SELECT public.is_disposable_email('user@gmail.com');     -- false


BEGIN;

-- ── 1. Disposable domain blocklist tablosu ──
CREATE TABLE IF NOT EXISTS public.disposable_email_domains (
  domain TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT
);

-- RLS: hicbir rol okuyamaz/yazamaz (sadece postgres + service_role)
ALTER TABLE public.disposable_email_domains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.disposable_email_domains FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.disposable_email_domains TO service_role;

-- Bilinen disposable servisler (2026-05 itibariyla en yaygin ~80 domain).
-- Saldirida kullanilan itquoted.com basta.
INSERT INTO public.disposable_email_domains (domain, source) VALUES
  ('itquoted.com',          '2026-05-16 saldiri'),
  ('mailinator.com',        'top-list'),
  ('guerrillamail.com',     'top-list'),
  ('guerrillamail.net',     'top-list'),
  ('guerrillamail.org',     'top-list'),
  ('guerrillamailblock.com','top-list'),
  ('sharklasers.com',       'top-list'),
  ('grr.la',                'top-list'),
  ('pokemail.net',          'top-list'),
  ('spam4.me',              'top-list'),
  ('tempmail.com',          'top-list'),
  ('temp-mail.org',         'top-list'),
  ('temp-mail.io',          'top-list'),
  ('tempmailo.com',         'top-list'),
  ('tempmail.ninja',        'top-list'),
  ('10minutemail.com',      'top-list'),
  ('10minutemail.net',      'top-list'),
  ('20minutemail.com',      'top-list'),
  ('30minutemail.com',      'top-list'),
  ('throwawaymail.com',     'top-list'),
  ('throwaway.email',       'top-list'),
  ('trashmail.com',         'top-list'),
  ('trashmail.de',          'top-list'),
  ('trashmail.net',         'top-list'),
  ('trashmail.io',          'top-list'),
  ('trashmail.ws',          'top-list'),
  ('dispostable.com',       'top-list'),
  ('discard.email',         'top-list'),
  ('discardmail.com',       'top-list'),
  ('yopmail.com',           'top-list'),
  ('yopmail.fr',            'top-list'),
  ('yopmail.net',           'top-list'),
  ('mintemail.com',         'top-list'),
  ('mt2014.com',            'top-list'),
  ('mvrht.com',             'top-list'),
  ('mytrashmail.com',       'top-list'),
  ('emailondeck.com',       'top-list'),
  ('emailfake.com',         'top-list'),
  ('fakemail.net',          'top-list'),
  ('fakemailgenerator.com', 'top-list'),
  ('inboxbear.com',         'top-list'),
  ('inboxkitten.com',       'top-list'),
  ('maildrop.cc',           'top-list'),
  ('mailcatch.com',         'top-list'),
  ('mailnesia.com',         'top-list'),
  ('mailnull.com',          'top-list'),
  ('mailtothis.com',        'top-list'),
  ('mailueberfall.de',      'top-list'),
  ('mohmal.com',            'top-list'),
  ('moakt.com',             'top-list'),
  ('nada.email',            'top-list'),
  ('nada.ltd',              'top-list'),
  ('owlpic.com',            'top-list'),
  ('rcpt.at',               'top-list'),
  ('sendspamhere.com',      'top-list'),
  ('spamavert.com',         'top-list'),
  ('spambog.com',           'top-list'),
  ('spambox.us',            'top-list'),
  ('spamgourmet.com',       'top-list'),
  ('spamhole.com',          'top-list'),
  ('spaml.com',             'top-list'),
  ('spammotel.com',         'top-list'),
  ('spamspot.com',          'top-list'),
  ('tempemail.com',         'top-list'),
  ('tempemail.net',         'top-list'),
  ('tempinbox.com',         'top-list'),
  ('temporaryemail.net',    'top-list'),
  ('temporaryforwarding.com','top-list'),
  ('thrott.com',            'top-list'),
  ('tmpeml.com',            'top-list'),
  ('tmpmail.org',           'top-list'),
  ('tmpmail.net',           'top-list'),
  ('tmpnator.live',         'top-list'),
  ('zippymail.in',          'top-list'),
  ('wegwerfmail.de',        'top-list'),
  ('wegwerfmail.net',       'top-list'),
  ('wegwerfmail.org',       'top-list'),
  ('einrot.com',            'top-list'),
  ('cuvox.de',              'top-list'),
  ('dayrep.com',            'top-list'),
  ('fleckens.hu',           'top-list'),
  ('gustr.com',             'top-list'),
  ('jourrapide.com',        'top-list'),
  ('rhyta.com',             'top-list'),
  ('superrito.com',         'top-list'),
  ('teleworm.us',           'top-list'),
  ('armyspy.com',           'top-list')
ON CONFLICT (domain) DO NOTHING;


-- ── 2. Yardimci fonksiyon (audit/test icin disaridan cagrilabilir) ──
CREATE OR REPLACE FUNCTION public.is_disposable_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.disposable_email_domains
    WHERE domain = lower(split_part(p_email, '@', 2))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_disposable_email(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_disposable_email(TEXT) TO authenticated, service_role;


-- ── 3. Trigger fonksiyonu ──
CREATE OR REPLACE FUNCTION public.block_disposable_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND public.is_disposable_email(NEW.email) THEN
    RAISE EXCEPTION 'Geçici e-posta adresleri kabul edilmiyor. Lütfen kalıcı bir e-posta kullanın.'
      USING ERRCODE = 'check_violation',
            HINT = 'Gmail, Outlook, Hotmail gibi standart sağlayıcıları deneyin.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.block_disposable_email() FROM PUBLIC, anon, authenticated;


-- ── 4. Trigger auth.users uzerine ──
DROP TRIGGER IF EXISTS block_disposable_email_trg ON auth.users;
CREATE TRIGGER block_disposable_email_trg
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.block_disposable_email();

COMMIT;
