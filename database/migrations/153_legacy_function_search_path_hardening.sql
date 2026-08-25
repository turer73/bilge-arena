-- Migration 153: Pin the remaining legacy function search paths reported by
-- Supabase Security Advisor. This is intentionally an ALTER-only migration so
-- function OIDs, trigger bindings, expression indexes, and callers stay intact.

ALTER FUNCTION public.update_updated_at()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.check_premium_status()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.generate_referral_code()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.immutable_unaccent(text)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.update_homepage_updated_at()
  SET search_path = pg_catalog, public;
