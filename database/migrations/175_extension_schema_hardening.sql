-- Migration 175: move relocatable extensions out of the exposed public schema.
-- Existing indexes keep their OID dependencies; immutable_unaccent is rebound
-- to the relocated dictionary/function in the same transaction.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
REVOKE CREATE ON SCHEMA extensions FROM PUBLIC;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

DO $move_extensions$
DECLARE
  v_extension text;
  v_schema text;
  v_relocatable boolean;
BEGIN
  FOREACH v_extension IN ARRAY ARRAY['pg_trgm','unaccent'] LOOP
    SELECT n.nspname, e.extrelocatable
      INTO v_schema, v_relocatable
    FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = v_extension;

    IF NOT FOUND THEN
      RAISE EXCEPTION '175 prerequisite missing extension: %', v_extension;
    END IF;
    IF NOT v_relocatable THEN
      RAISE EXCEPTION '175 extension is not relocatable: %', v_extension;
    END IF;
    IF v_schema <> 'extensions' THEN
      EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', v_extension);
    END IF;
  END LOOP;
END
$move_extensions$;

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = pg_catalog, extensions
AS $func$
  SELECT extensions.unaccent('extensions.unaccent', $1)
$func$;

DO $verify$
DECLARE
  v_invalid_indexes integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('pg_trgm','unaccent') AND n.nspname <> 'extensions'
  ) THEN
    RAISE EXCEPTION '175 verification: extension remains in public schema';
  END IF;

  IF public.immutable_unaccent('ÇÖZÜM') <> 'COZUM' THEN
    RAISE EXCEPTION '175 verification: immutable_unaccent result invalid';
  END IF;

  SELECT count(*)::integer
    INTO v_invalid_indexes
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'idx_profiles_display_name_unaccent_trgm',
      'idx_profiles_username_unaccent_trgm',
      'idx_questions_question_trgm',
      'idx_questions_question_unaccent_trgm',
      'idx_questions_sentence_trgm',
      'idx_questions_sentence_unaccent_trgm'
    )
    AND NOT i.indisvalid;

  IF v_invalid_indexes <> 0 THEN
    RAISE EXCEPTION '175 verification: % trigram indexes invalid', v_invalid_indexes;
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
