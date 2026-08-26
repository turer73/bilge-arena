-- Migration 169: ana sayfa yonetim yazmalarini tek, atomik ve denetlenebilir
-- service-role RPC'sine kapat.
--
-- Onceki durum:
--   * authenticated + AAL2 istemcisi homepage tablolarina dogrudan DML
--     yapabiliyordu; route rate-limit ve admin_logs atlanabiliyordu.
--   * reorder her satiri ayri HTTP/SQL islemiyle guncelliyor, kismi basariyi
--     basari sayiyordu.
--   * toplu publish `key` diye var olmayan bir sutuna yaziyor ve UI'nin
--     gonderdigi yalniz `{action}` payload'i sessiz bir no-op oluyordu.
--
-- Yeni sozlesme:
--   * tablo DML'i tum API rollerine kapali; yazma sadece service_role'a acik
--     SECURITY DEFINER RPC ile yapilir.
--   * actor + request UUID + canonical payload hash bir request ledger'inda
--     tutulur. Ayni anahtar/ayni payload replay edilir; farkli payload reddedilir.
--   * mutasyon, admin_logs kaydi ve request sonucu ayni transaction'dadir.
--   * publish scope=all tum ana sayfayi; scope=selection yalniz verilen kayitlari
--     degistirir. Bos/eksik secim sessiz no-op olamaz.

BEGIN;

CREATE TABLE IF NOT EXISTS public.homepage_admin_mutation_requests (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  operation text NOT NULL CHECK (
    operation IN (
      'section_update',
      'element_create',
      'element_update',
      'element_delete',
      'elements_reorder',
      'publish'
    )
  ),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (actor_id, request_id)
);

CREATE INDEX IF NOT EXISTS homepage_admin_mutation_requests_created_idx
  ON public.homepage_admin_mutation_requests(created_at);

ALTER TABLE public.homepage_admin_mutation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.homepage_admin_mutation_requests
  FROM PUBLIC, anon, authenticated, service_role;

-- Eski dogrudan yazma politikalarinin tum tarihsel adlarini temizle.
DROP POLICY IF EXISTS "homepage_sections_admin_manage" ON public.homepage_sections;
DROP POLICY IF EXISTS "homepage_sections_admin_insert" ON public.homepage_sections;
DROP POLICY IF EXISTS "homepage_sections_admin_update" ON public.homepage_sections;
DROP POLICY IF EXISTS "homepage_sections_admin_delete" ON public.homepage_sections;
DROP POLICY IF EXISTS "homepage_elements_admin_manage" ON public.homepage_elements;
DROP POLICY IF EXISTS "homepage_elements_admin_insert" ON public.homepage_elements;
DROP POLICY IF EXISTS "homepage_elements_admin_update" ON public.homepage_elements;
DROP POLICY IF EXISTS "homepage_elements_admin_delete" ON public.homepage_elements;

-- service_role dahil hicbir PostgREST rolu tabloya dogrudan yazamaz. Definer
-- fonksiyonu tablo sahibi olarak calisir; dolayisiyla bu revoke RPC'yi bozmaz.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.homepage_sections,
  public.homepage_elements
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mutate_admin_homepage(
  p_user_id uuid,
  p_request_id uuid,
  p_operation text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_hash text;
  v_existing public.homepage_admin_mutation_requests%ROWTYPE;
  v_result jsonb;
  v_element public.homepage_elements%ROWTYPE;
  v_updates jsonb;
  v_section_key text;
  v_action text;
  v_scope text;
  v_is_published boolean;
  v_expected integer;
  v_changed_sections integer := 0;
  v_changed_elements integer := 0;
  v_target_id text;
  v_target_type text := 'homepage';
  v_audit_action text;
BEGIN
  -- Bu fonksiyon bilerek authenticated'a acilmaz. Cookie/JWT ile dogrudan RPC
  -- cagrisi proxy/MFA/rate-limit katmanini atlayamaz.
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL
     OR p_request_id IS NULL
     OR p_operation IS NULL
     OR p_operation NOT IN (
       'section_update',
       'element_create',
       'element_update',
       'element_delete',
       'elements_reorder',
       'publish'
     )
     OR p_payload IS NULL
     OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid homepage mutation request' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(p_user_id, 'admin.homepage.edit') THEN
    RAISE EXCEPTION 'homepage edit permission required' USING ERRCODE = '42501';
  END IF;

  v_hash := encode(
    extensions.digest(
      jsonb_build_object('operation', p_operation, 'payload', p_payload)::text,
      'sha256'
    ),
    'hex'
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'homepage-admin-request:' || p_user_id::text || ':' || p_request_id::text,
      169
    )
  );

  SELECT * INTO v_existing
  FROM public.homepage_admin_mutation_requests
  WHERE actor_id = p_user_id AND request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.operation IS DISTINCT FROM p_operation
       OR v_existing.payload_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'homepage request payload mismatch' USING ERRCODE = '22023';
    END IF;
    RETURN v_existing.result || jsonb_build_object('replayed', true);
  END IF;

  IF p_operation = 'section_update' THEN
    IF jsonb_object_length(p_payload) <> 2
       OR NOT (p_payload ?& ARRAY['config', 'sectionKey']::text[])
       OR jsonb_typeof(p_payload -> 'sectionKey') <> 'string'
       OR jsonb_typeof(p_payload -> 'config') <> 'object'
       OR char_length((p_payload -> 'config')::text) > 100000 THEN
      RAISE EXCEPTION 'invalid section update payload' USING ERRCODE = '22023';
    END IF;

    v_section_key := p_payload ->> 'sectionKey';
    IF v_section_key NOT IN ('hero','stats','games','how_it_works','cta','leaderboard','footer') THEN
      RAISE EXCEPTION 'invalid homepage section' USING ERRCODE = '22023';
    END IF;

    UPDATE public.homepage_sections
    SET config = p_payload -> 'config', updated_by = p_user_id
    WHERE section_key = v_section_key;
    GET DIAGNOSTICS v_expected = ROW_COUNT;
    IF v_expected <> 1 THEN
      RAISE EXCEPTION 'homepage section not found' USING ERRCODE = 'P0002';
    END IF;

    v_result := jsonb_build_object(
      'success', true,
      'operation', p_operation,
      'sectionKey', v_section_key,
      'replayed', false
    );
    v_audit_action := 'update_homepage_section';
    v_target_id := v_section_key;
    v_target_type := 'homepage_section';

  ELSIF p_operation = 'element_create' THEN
    IF jsonb_object_length(p_payload) <> 9
       OR NOT (p_payload ?& ARRAY[
         'alignment','altText','content','elementType','imageUrl',
         'placement','sectionKey','size','styles'
       ]::text[])
       OR jsonb_typeof(p_payload -> 'sectionKey') <> 'string'
       OR jsonb_typeof(p_payload -> 'elementType') <> 'string'
       OR jsonb_typeof(p_payload -> 'altText') <> 'string'
       OR jsonb_typeof(p_payload -> 'placement') <> 'string'
       OR jsonb_typeof(p_payload -> 'alignment') <> 'string'
       OR jsonb_typeof(p_payload -> 'size') <> 'string'
       OR jsonb_typeof(p_payload -> 'styles') <> 'object'
       OR jsonb_typeof(p_payload -> 'content') NOT IN ('string','null')
       OR jsonb_typeof(p_payload -> 'imageUrl') NOT IN ('string','null') THEN
      RAISE EXCEPTION 'invalid element create payload' USING ERRCODE = '22023';
    END IF;

    v_section_key := p_payload ->> 'sectionKey';
    IF v_section_key NOT IN ('hero','stats','games','how_it_works','cta','leaderboard','footer')
       OR (p_payload ->> 'elementType') NOT IN ('logo','slogan','banner')
       OR (p_payload ->> 'placement') NOT IN ('above','below','inline')
       OR (p_payload ->> 'alignment') NOT IN ('left','center','right')
       OR (p_payload ->> 'size') NOT IN ('xs','sm','md','lg','xl')
       OR char_length(p_payload ->> 'altText') > 200
       OR char_length(COALESCE(p_payload ->> 'content','')) > 10000
       OR char_length(COALESCE(p_payload ->> 'imageUrl','')) > 500
       OR (
         p_payload -> 'imageUrl' <> 'null'::jsonb
         AND p_payload ->> 'imageUrl' !~ '^https?://[^[:space:]]+$'
       )
       OR char_length((p_payload -> 'styles')::text) > 20000 THEN
      RAISE EXCEPTION 'element create value out of range' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.homepage_elements (
      section_key, element_type, content, image_url, alt_text, placement,
      alignment, size, styles, created_by, updated_by
    ) VALUES (
      v_section_key,
      p_payload ->> 'elementType',
      CASE WHEN p_payload -> 'content' = 'null'::jsonb THEN NULL ELSE p_payload ->> 'content' END,
      CASE WHEN p_payload -> 'imageUrl' = 'null'::jsonb THEN NULL ELSE p_payload ->> 'imageUrl' END,
      p_payload ->> 'altText',
      p_payload ->> 'placement',
      p_payload ->> 'alignment',
      p_payload ->> 'size',
      p_payload -> 'styles',
      p_user_id,
      p_user_id
    ) RETURNING * INTO v_element;

    v_result := jsonb_build_object(
      'success', true,
      'operation', p_operation,
      'element', to_jsonb(v_element),
      'replayed', false
    );
    v_audit_action := 'create_homepage_element';
    v_target_id := v_element.id::text;
    v_target_type := 'homepage_element';

  ELSIF p_operation = 'element_update' THEN
    IF jsonb_object_length(p_payload) <> 2
       OR NOT (p_payload ?& ARRAY['id', 'updates']::text[])
       OR jsonb_typeof(p_payload -> 'id') <> 'string'
       OR (p_payload ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR jsonb_typeof(p_payload -> 'updates') <> 'object'
       OR p_payload -> 'updates' = '{}'::jsonb THEN
      RAISE EXCEPTION 'invalid element update payload' USING ERRCODE = '22023';
    END IF;
    v_updates := p_payload -> 'updates';

    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_updates) AS k
      WHERE k NOT IN (
        'content','imageUrl','altText','placement','alignment','size',
        'styles','sortOrder','isPublished'
      )
    )
       OR (v_updates ? 'content' AND jsonb_typeof(v_updates -> 'content') NOT IN ('string','null'))
       OR (v_updates ? 'imageUrl' AND jsonb_typeof(v_updates -> 'imageUrl') NOT IN ('string','null'))
       OR (v_updates ? 'altText' AND jsonb_typeof(v_updates -> 'altText') <> 'string')
       OR (v_updates ? 'placement' AND (
         jsonb_typeof(v_updates -> 'placement') <> 'string'
         OR v_updates ->> 'placement' NOT IN ('above','below','inline')
       ))
       OR (v_updates ? 'alignment' AND (
         jsonb_typeof(v_updates -> 'alignment') <> 'string'
         OR v_updates ->> 'alignment' NOT IN ('left','center','right')
       ))
       OR (v_updates ? 'size' AND (
         jsonb_typeof(v_updates -> 'size') <> 'string'
         OR v_updates ->> 'size' NOT IN ('xs','sm','md','lg','xl')
       ))
       OR (v_updates ? 'styles' AND jsonb_typeof(v_updates -> 'styles') <> 'object')
       OR (v_updates ? 'sortOrder' AND (
         jsonb_typeof(v_updates -> 'sortOrder') <> 'number'
         OR v_updates ->> 'sortOrder' !~ '^[0-9]{1,5}$'
         OR (v_updates ->> 'sortOrder')::integer > 10000
       ))
       OR (v_updates ? 'isPublished' AND jsonb_typeof(v_updates -> 'isPublished') <> 'boolean')
       OR char_length(COALESCE(v_updates ->> 'content','')) > 10000
       OR char_length(COALESCE(v_updates ->> 'imageUrl','')) > 500
       OR (
         v_updates ? 'imageUrl'
         AND v_updates -> 'imageUrl' <> 'null'::jsonb
         AND v_updates ->> 'imageUrl' !~ '^https?://[^[:space:]]+$'
       )
       OR char_length(COALESCE(v_updates ->> 'altText','')) > 200
       OR (v_updates ? 'styles' AND char_length((v_updates -> 'styles')::text) > 20000) THEN
      RAISE EXCEPTION 'invalid element update values' USING ERRCODE = '22023';
    END IF;

    UPDATE public.homepage_elements
    SET
      content = CASE WHEN v_updates ? 'content'
        THEN CASE WHEN v_updates -> 'content' = 'null'::jsonb THEN NULL ELSE v_updates ->> 'content' END
        ELSE content END,
      image_url = CASE WHEN v_updates ? 'imageUrl'
        THEN CASE WHEN v_updates -> 'imageUrl' = 'null'::jsonb THEN NULL ELSE v_updates ->> 'imageUrl' END
        ELSE image_url END,
      alt_text = CASE WHEN v_updates ? 'altText' THEN v_updates ->> 'altText' ELSE alt_text END,
      placement = CASE WHEN v_updates ? 'placement' THEN v_updates ->> 'placement' ELSE placement END,
      alignment = CASE WHEN v_updates ? 'alignment' THEN v_updates ->> 'alignment' ELSE alignment END,
      size = CASE WHEN v_updates ? 'size' THEN v_updates ->> 'size' ELSE size END,
      styles = CASE WHEN v_updates ? 'styles' THEN v_updates -> 'styles' ELSE styles END,
      sort_order = CASE WHEN v_updates ? 'sortOrder' THEN (v_updates ->> 'sortOrder')::integer ELSE sort_order END,
      is_published = CASE WHEN v_updates ? 'isPublished' THEN (v_updates ->> 'isPublished')::boolean ELSE is_published END,
      updated_by = p_user_id
    WHERE id = (p_payload ->> 'id')::uuid
    RETURNING * INTO v_element;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'homepage element not found' USING ERRCODE = 'P0002';
    END IF;

    v_result := jsonb_build_object(
      'success', true,
      'operation', p_operation,
      'element', to_jsonb(v_element),
      'replayed', false
    );
    v_audit_action := 'update_homepage_element';
    v_target_id := v_element.id::text;
    v_target_type := 'homepage_element';

  ELSIF p_operation = 'element_delete' THEN
    IF jsonb_object_length(p_payload) <> 1
       OR NOT (p_payload ? 'id')
       OR jsonb_typeof(p_payload -> 'id') <> 'string'
       OR (p_payload ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid element delete payload' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.homepage_elements
    WHERE id = (p_payload ->> 'id')::uuid
    RETURNING * INTO v_element;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'homepage element not found' USING ERRCODE = 'P0002';
    END IF;

    v_result := jsonb_build_object(
      'success', true,
      'operation', p_operation,
      'deletedId', v_element.id,
      'replayed', false
    );
    v_audit_action := 'delete_homepage_element';
    v_target_id := v_element.id::text;
    v_target_type := 'homepage_element';

  ELSIF p_operation = 'elements_reorder' THEN
    IF jsonb_object_length(p_payload) <> 2
       OR NOT (p_payload ?& ARRAY['orderedIds', 'sectionKey']::text[])
       OR jsonb_typeof(p_payload -> 'sectionKey') <> 'string'
       OR jsonb_typeof(p_payload -> 'orderedIds') <> 'array'
       OR jsonb_array_length(p_payload -> 'orderedIds') NOT BETWEEN 1 AND 100
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_payload -> 'orderedIds') AS item
         WHERE jsonb_typeof(item) <> 'string'
            OR trim(both '"' from item::text) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       ) THEN
      RAISE EXCEPTION 'invalid reorder payload' USING ERRCODE = '22023';
    END IF;
    v_section_key := p_payload ->> 'sectionKey';
    IF v_section_key NOT IN ('hero','stats','games','how_it_works','cta','leaderboard','footer')
       OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_payload -> 'orderedIds'))
          <> jsonb_array_length(p_payload -> 'orderedIds') THEN
      RAISE EXCEPTION 'invalid reorder targets' USING ERRCODE = '22023';
    END IF;

    -- Ayni bolumdeki butun listeyi kilitle ve tam permutasyon zorunlu tut.
    PERFORM 1 FROM public.homepage_elements
    WHERE section_key = v_section_key
    ORDER BY id
    FOR UPDATE;

    SELECT count(*) INTO v_expected
    FROM public.homepage_elements
    WHERE section_key = v_section_key;

    IF v_expected <> jsonb_array_length(p_payload -> 'orderedIds')
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(p_payload -> 'orderedIds') AS requested(id)
         LEFT JOIN public.homepage_elements e
           ON e.id = requested.id::uuid AND e.section_key = v_section_key
         WHERE e.id IS NULL
       ) THEN
      RAISE EXCEPTION 'reorder must contain every section element exactly once' USING ERRCODE = '22023';
    END IF;

    UPDATE public.homepage_elements AS e
    SET sort_order = requested.ordinality - 1, updated_by = p_user_id
    FROM jsonb_array_elements_text(p_payload -> 'orderedIds')
      WITH ORDINALITY AS requested(id, ordinality)
    WHERE e.id = requested.id::uuid AND e.section_key = v_section_key;
    GET DIAGNOSTICS v_changed_elements = ROW_COUNT;

    IF v_changed_elements <> v_expected THEN
      RAISE EXCEPTION 'atomic reorder failed' USING ERRCODE = '40001';
    END IF;

    v_result := jsonb_build_object(
      'success', true,
      'operation', p_operation,
      'sectionKey', v_section_key,
      'reorderedElements', v_changed_elements,
      'replayed', false
    );
    v_audit_action := 'reorder_homepage_elements';
    v_target_id := v_section_key;
    v_target_type := 'homepage_section';

  ELSE
    -- publish
    IF jsonb_object_length(p_payload) <> 4
       OR NOT (p_payload ?& ARRAY['action','elementIds','scope','sectionKeys']::text[])
       OR jsonb_typeof(p_payload -> 'action') <> 'string'
       OR jsonb_typeof(p_payload -> 'scope') <> 'string'
       OR jsonb_typeof(p_payload -> 'sectionKeys') <> 'array'
       OR jsonb_typeof(p_payload -> 'elementIds') <> 'array' THEN
      RAISE EXCEPTION 'invalid publish payload' USING ERRCODE = '22023';
    END IF;

    v_action := p_payload ->> 'action';
    v_scope := p_payload ->> 'scope';
    IF v_action NOT IN ('publish','unpublish') OR v_scope NOT IN ('all','selection') THEN
      RAISE EXCEPTION 'invalid publish action or scope' USING ERRCODE = '22023';
    END IF;
    v_is_published := v_action = 'publish';

    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_payload -> 'sectionKeys') AS item
      WHERE jsonb_typeof(item) <> 'string'
         OR trim(both '"' from item::text) NOT IN ('hero','stats','games','how_it_works','cta','leaderboard','footer')
    )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_payload -> 'elementIds') AS item
         WHERE jsonb_typeof(item) <> 'string'
            OR trim(both '"' from item::text) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       )
       OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_payload -> 'sectionKeys'))
          <> jsonb_array_length(p_payload -> 'sectionKeys')
       OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_payload -> 'elementIds'))
          <> jsonb_array_length(p_payload -> 'elementIds') THEN
      RAISE EXCEPTION 'invalid publish targets' USING ERRCODE = '22023';
    END IF;

    IF v_scope = 'all' THEN
      IF jsonb_array_length(p_payload -> 'sectionKeys') <> 0
         OR jsonb_array_length(p_payload -> 'elementIds') <> 0 THEN
        RAISE EXCEPTION 'all scope cannot include target lists' USING ERRCODE = '22023';
      END IF;

      UPDATE public.homepage_sections
      SET is_published = v_is_published, updated_by = p_user_id
      WHERE is_published IS DISTINCT FROM v_is_published;
      GET DIAGNOSTICS v_changed_sections = ROW_COUNT;

      UPDATE public.homepage_elements
      SET is_published = v_is_published, updated_by = p_user_id
      WHERE is_published IS DISTINCT FROM v_is_published;
      GET DIAGNOSTICS v_changed_elements = ROW_COUNT;
      v_target_id := 'all';
    ELSE
      IF jsonb_array_length(p_payload -> 'sectionKeys')
         + jsonb_array_length(p_payload -> 'elementIds') = 0 THEN
        RAISE EXCEPTION 'selection scope requires at least one target' USING ERRCODE = '22023';
      END IF;

      -- Hedeflerin tumu var olmadan hicbir sey guncellenmez.
      PERFORM 1 FROM public.homepage_sections s
      JOIN jsonb_array_elements_text(p_payload -> 'sectionKeys') requested(key)
        ON requested.key = s.section_key
      ORDER BY s.section_key
      FOR UPDATE OF s;
      SELECT count(*) INTO v_expected
      FROM public.homepage_sections s
      JOIN jsonb_array_elements_text(p_payload -> 'sectionKeys') requested(key)
        ON requested.key = s.section_key;
      IF v_expected <> jsonb_array_length(p_payload -> 'sectionKeys') THEN
        RAISE EXCEPTION 'homepage section publish target not found' USING ERRCODE = 'P0002';
      END IF;

      PERFORM 1 FROM public.homepage_elements e
      JOIN jsonb_array_elements_text(p_payload -> 'elementIds') requested(id)
        ON requested.id::uuid = e.id
      ORDER BY e.id
      FOR UPDATE OF e;
      SELECT count(*) INTO v_expected
      FROM public.homepage_elements e
      JOIN jsonb_array_elements_text(p_payload -> 'elementIds') requested(id)
        ON requested.id::uuid = e.id;
      IF v_expected <> jsonb_array_length(p_payload -> 'elementIds') THEN
        RAISE EXCEPTION 'homepage element publish target not found' USING ERRCODE = 'P0002';
      END IF;

      UPDATE public.homepage_sections s
      SET is_published = v_is_published, updated_by = p_user_id
      FROM jsonb_array_elements_text(p_payload -> 'sectionKeys') requested(key)
      WHERE requested.key = s.section_key
        AND s.is_published IS DISTINCT FROM v_is_published;
      GET DIAGNOSTICS v_changed_sections = ROW_COUNT;

      UPDATE public.homepage_elements e
      SET is_published = v_is_published, updated_by = p_user_id
      FROM jsonb_array_elements_text(p_payload -> 'elementIds') requested(id)
      WHERE requested.id::uuid = e.id
        AND e.is_published IS DISTINCT FROM v_is_published;
      GET DIAGNOSTICS v_changed_elements = ROW_COUNT;
      v_target_id := 'selection';
    END IF;

    v_result := jsonb_build_object(
      'success', true,
      'operation', p_operation,
      'action', v_action,
      'scope', v_scope,
      'sectionsChanged', v_changed_sections,
      'elementsChanged', v_changed_elements,
      'replayed', false
    );
    v_audit_action := CASE WHEN v_is_published
      THEN 'publish_homepage'
      ELSE 'unpublish_homepage'
    END;
  END IF;

  -- Audit basarisizsa mutasyon da rollback olur: basarili ama izsiz yazma yok.
  INSERT INTO public.admin_logs (
    admin_id, action, target_type, target_id, details
  ) VALUES (
    p_user_id,
    v_audit_action,
    v_target_type,
    v_target_id,
    jsonb_build_object(
      'requestId', p_request_id,
      'operation', p_operation,
      'payloadHash', v_hash,
      'result', v_result - 'element'
    )
  );

  INSERT INTO public.homepage_admin_mutation_requests (
    actor_id, request_id, operation, payload_hash, result
  ) VALUES (
    p_user_id, p_request_id, p_operation, v_hash, v_result
  );

  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.mutate_admin_homepage(uuid,uuid,text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mutate_admin_homepage(uuid,uuid,text,jsonb)
  TO service_role;

-- Migration aninda route-only sinirini kanitla; bir grant/policy kalirsa apply
-- fail eder ve transaction geri alinir.
DO $verify$
DECLARE
  v_role text;
  v_policy_count integer;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(v_role, 'public.homepage_sections', 'INSERT')
       OR has_table_privilege(v_role, 'public.homepage_sections', 'UPDATE')
       OR has_table_privilege(v_role, 'public.homepage_sections', 'DELETE')
       OR has_any_column_privilege(v_role, 'public.homepage_sections', 'INSERT')
       OR has_any_column_privilege(v_role, 'public.homepage_sections', 'UPDATE')
       OR has_table_privilege(v_role, 'public.homepage_elements', 'INSERT')
       OR has_table_privilege(v_role, 'public.homepage_elements', 'UPDATE')
       OR has_table_privilege(v_role, 'public.homepage_elements', 'DELETE')
       OR has_any_column_privilege(v_role, 'public.homepage_elements', 'INSERT')
       OR has_any_column_privilege(v_role, 'public.homepage_elements', 'UPDATE') THEN
      RAISE EXCEPTION 'homepage direct DML still granted to %', v_role;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('homepage_sections','homepage_elements')
    AND cmd IN ('INSERT','UPDATE','DELETE','ALL');
  IF v_policy_count <> 0 THEN
    RAISE EXCEPTION 'homepage mutation RLS policies still exist: %', v_policy_count;
  END IF;

  IF has_function_privilege('anon', 'public.mutate_admin_homepage(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.mutate_admin_homepage(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.mutate_admin_homepage(uuid,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'homepage mutation RPC grant boundary is invalid';
  END IF;
END;
$verify$;

NOTIFY pgrst, 'reload schema';
COMMIT;
