-- =============================================================================
-- Bilge Arena Oda Sistemi: 26_rooms_acl_hardening test (TDD)
-- =============================================================================
-- Hedef: 26_rooms_acl_hardening.sql sonrasi
--          - katalog: authenticated/anon yazma yetkisi yok, snapshot sutunu
--            kapali, view security_invoker + non-superuser sahip + guncellenemez,
--            yazma politikalari kaldirilmis, varsayilan yetkiler temiz,
--            RPC EXECUTE yalniz authenticated
--          - davranis (SET LOCAL ROLE authenticated + JWT sub): tur gorunurlugu
--            round_index ile sinirli, cevap/aciklama reveal (sync) veya kendi
--            cevabi (async) sonrasi, uye olmayan hicbir sey gormez, dogrudan
--            yazmalar 42501, RPC yazma yollari hala calisiyor
--
-- Onceki testlerden farki: 2..25 testleri bilge_arena_app (owner, BYPASSRLS)
-- olarak calisir ve RLS'i hic sinamaz. Bu test PostgREST'in yaptigi gibi
-- authenticated rolune gecer.
--
-- Kullanim (SUPERUSER: SET ROLE anon icin gerekli; her sey ROLLBACK edilir):
--   docker exec -i bilge-arena-db psql -U ba_admin -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/26_rooms_acl_hardening_test.sql
--
-- Beklenen RED (26 uygulanmadan): Test 1.1'de 'room_members INSERT' ile abort.
-- Beklenen GREEN: tum NOTICE 'OK Test X.Y' satirlari, exit 0.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'Bu test superuser ile calismali (SET ROLE anon/authenticated)';
  END IF;
END $$;

-- =============================================================================
-- Section 1: Katalog
-- =============================================================================

-- Test 1.1: authenticated/anon icin INSERT/UPDATE/DELETE/TRUNCATE yok
-- (room_reactions INSERT haric, sutun bazli ve politikali)
DO $$
DECLARE
  v_tbl TEXT;
  v_role TEXT;
  v_priv TEXT;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'room_members', 'rooms', 'room_answers', 'room_rounds', 'room_audit_log',
    'room_round_question_view', 'questions', 'room_reactions'
  ]
  LOOP
    FOREACH v_role IN ARRAY ARRAY['authenticated', 'anon'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
        CONTINUE WHEN v_tbl = 'room_reactions' AND v_role = 'authenticated'
                      AND v_priv = 'INSERT';
        IF has_table_privilege(v_role, 'public.' || v_tbl, v_priv)
           OR (v_priv IN ('INSERT', 'UPDATE')
               AND has_any_column_privilege(v_role, 'public.' || v_tbl, v_priv)) THEN
          RAISE EXCEPTION 'ASSERT FAILED Test 1.1: % hala % % yetkisine sahip', v_role, v_tbl, v_priv;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'OK Test 1.1: authenticated/anon oda tablolarina yazamaz';
END $$;

-- Test 1.2: room_rounds sutun bazli SELECT; snapshot kapali (Realtime apply_rls
-- ayni has_column_privilege ile payload'i suzer)
DO $$
DECLARE v_col TEXT;
BEGIN
  IF has_table_privilege('authenticated', 'public.room_rounds', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.2: room_rounds tablo-genis SELECT acik';
  END IF;
  IF has_column_privilege('authenticated', 'public.room_rounds',
                          'question_content_snapshot', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.2: question_content_snapshot authenticated''a acik';
  END IF;
  FOREACH v_col IN ARRAY ARRAY['id', 'room_id', 'round_index', 'question_id',
                               'started_at', 'ends_at', 'revealed_at', 'closed_at']
  LOOP
    IF NOT has_column_privilege('authenticated', 'public.room_rounds', v_col, 'SELECT') THEN
      RAISE EXCEPTION 'ASSERT FAILED Test 1.2: room_rounds.% SELECT kapali (istemci kirilir)', v_col;
    END IF;
  END LOOP;
  IF has_any_column_privilege('anon', 'public.room_rounds', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.2: anon room_rounds okuyabiliyor';
  END IF;
  RAISE NOTICE 'OK Test 1.2: room_rounds snapshot sutunu kapali, diger sutunlar acik';
END $$;

-- Test 1.3: view security_invoker, sahibi non-superuser, guncellenemez, yalniz SELECT
DO $$
DECLARE
  v_owner TEXT;
  v_super BOOLEAN;
  v_opts TEXT[];
  v_mask INT;
BEGIN
  SELECT pg_get_userbyid(c.relowner), r.rolsuper, c.reloptions
    INTO v_owner, v_super, v_opts
    FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
    WHERE c.oid = 'public.room_round_question_view'::regclass;
  IF v_super THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.3: view sahibi superuser (%)', v_owner;
  END IF;
  IF v_owner <> 'bilge_arena_app' THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.3: view sahibi % (bilge_arena_app beklendi)', v_owner;
  END IF;
  IF v_opts IS NULL OR NOT ('security_invoker=true' = ANY(v_opts)) THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.3: view security_invoker=true degil (%)', v_opts;
  END IF;
  v_mask := pg_relation_is_updatable('public.room_round_question_view'::regclass, false);
  IF v_mask <> 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.3: view hala guncellenebilir (mask=%)', v_mask;
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.room_round_question_view', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.3: authenticated view SELECT kapali';
  END IF;
  IF has_table_privilege('anon', 'public.room_round_question_view', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.3: anon view okuyabiliyor';
  END IF;
  RAISE NOTICE 'OK Test 1.3: view security_invoker, sahip=%, guncellenemez', v_owner;
END $$;

-- Test 1.4: yazma politikalari kaldirildi; room_rounds SELECT gorunurluk helper'i kullaniyor
DO $$
DECLARE
  v_bad TEXT;
  v_qual TEXT;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('rooms', 'room_members', 'room_answers', 'room_rounds', 'room_audit_log')
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.4: yazma politikasi kaldi: %', v_bad;
  END IF;

  SELECT string_agg(qual, ' | ') INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'room_rounds' AND cmd = 'SELECT';
  IF v_qual IS NULL OR v_qual NOT LIKE '%can_view_room_round%' THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.4: room_rounds SELECT politikasi round gorunurlugu icermiyor (%)', v_qual;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
             AND tablename = 'room_rounds' AND policyname = 'room_rounds_select_members') THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.4: eski room_rounds_select_members duruyor (permissive OR ile gorunurlugu deler)';
  END IF;
  RAISE NOTICE 'OK Test 1.4: yazma politikasi yok, room_rounds SELECT can_view_room_round ile';
END $$;

-- Test 1.5: public varsayilan yetkileri authenticated/anon'a bir sey vermiyor
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text, ', ') INTO v_bad
  FROM pg_default_acl d, aclexplode(d.defaclacl) a
  WHERE d.defaclnamespace IN ('public'::regnamespace, 0)
    AND a.grantee IN ('authenticated'::regrole, 'anon'::regrole);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 1.5: varsayilan yetki hala acik: %', v_bad;
  END IF;
  RAISE NOTICE 'OK Test 1.5: public varsayilan yetkileri temiz';
END $$;

-- Test 1.6: RPC EXECUTE yalniz authenticated; helper'lar DEFINER + non-superuser sahip
DO $$
DECLARE
  v_fn TEXT;
  v_owner TEXT;
  v_super BOOLEAN;
  v_definer BOOLEAN;
  v_config TEXT[];
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.join_room(character)', 'public.leave_room(uuid)',
    'public.kick_member(uuid,uuid)', 'public.start_room(uuid)',
    'public.cancel_room(uuid,text)', 'public.advance_round(uuid)',
    'public.reveal_round(uuid)', 'public.submit_answer(uuid,text)',
    'public.submit_answer_async(uuid,text)', 'public.advance_round_for_member(uuid)',
    'public.is_room_member(uuid)', 'public.is_room_host(uuid)',
    'public.can_view_room_round(uuid,smallint)', 'public.room_round_visible_content(uuid)'
  ]
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ASSERT FAILED Test 1.6: anon % calistirabiliyor', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'ASSERT FAILED Test 1.6: authenticated % calistiramiyor (istemci kirilir)', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.can_view_room_round(uuid,smallint)', 'public.room_round_visible_content(uuid)'
  ]
  LOOP
    SELECT pg_get_userbyid(p.proowner), r.rolsuper, p.prosecdef, p.proconfig
      INTO v_owner, v_super, v_definer, v_config
      FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
      WHERE p.oid = v_fn::regprocedure;
    IF v_super OR v_owner <> 'bilge_arena_app' THEN
      RAISE EXCEPTION 'ASSERT FAILED Test 1.6: % sahibi % (superuser=%)', v_fn, v_owner, v_super;
    END IF;
    IF NOT v_definer THEN
      RAISE EXCEPTION 'ASSERT FAILED Test 1.6: % SECURITY DEFINER degil', v_fn;
    END IF;
    IF v_config IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(v_config) c WHERE c LIKE 'search_path=%'
    ) THEN
      RAISE EXCEPTION 'ASSERT FAILED Test 1.6: % search_path sabit degil', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK Test 1.6: RPC EXECUTE anon kapali, helper''lar DEFINER/bilge_arena_app';
END $$;

-- =============================================================================
-- Fixture (superuser; FORCE RLS superuser'i baglamaz). Tumu ROLLBACK edilir.
--   H = host, P = oyuncu, O = disaridan
--   S = sync oda, A = async oda, L = lobby oda
-- =============================================================================
INSERT INTO public.questions (external_id, game, category, difficulty, content, is_active)
VALUES
  ('t26-q1', 'matematik', 't26-acl', 2,
   '{"question":"t26 q1","options":["a","b","c","d"],"answer":0,"explanation":"cevap a"}'::jsonb, TRUE),
  ('t26-q2', 'matematik', 't26-acl', 2,
   '{"question":"t26 q2","options":["a","b","c","d"],"answer":1,"explanation":"cevap b"}'::jsonb, TRUE),
  ('t26-q3', 'matematik', 't26-acl', 2,
   '{"question":"t26 q3","options":["a","b","c","d"],"answer":2,"explanation":"cevap c"}'::jsonb, TRUE),
  ('t26-q4', 'matematik', 't26-acl', 2,
   '{"question":"t26 q4","options":["a","b","c","d"],"answer":3,"explanation":"cevap d"}'::jsonb, TRUE),
  ('t26-q5', 'matematik', 't26-acl', 2,
   '{"question":"t26 q5","options":["a","b","c","d"],"answer":0,"explanation":"cevap a2"}'::jsonb, TRUE);

INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('26000000-0000-4000-8000-000000000051', 'Z26SYN',
   '26000000-0000-4000-8000-00000000000a', 'T26 Sync', 't26-acl', 2, 5, 4, 20, 'sync', 'lobby'),
  ('26000000-0000-4000-8000-000000000052', 'Z26ASY',
   '26000000-0000-4000-8000-00000000000a', 'T26 Async', 't26-acl', 2, 5, 4, 20, 'async', 'lobby'),
  ('26000000-0000-4000-8000-000000000053', 'Z26LBY',
   '26000000-0000-4000-8000-00000000000a', 'T26 Lobby', 't26-acl', 2, 5, 4, 20, 'sync', 'lobby');

INSERT INTO public.room_members (room_id, user_id, role, is_active)
VALUES
  ('26000000-0000-4000-8000-000000000051', '26000000-0000-4000-8000-00000000000a', 'host', TRUE),
  ('26000000-0000-4000-8000-000000000051', '26000000-0000-4000-8000-00000000000b', 'player', TRUE),
  ('26000000-0000-4000-8000-000000000052', '26000000-0000-4000-8000-00000000000a', 'host', TRUE),
  ('26000000-0000-4000-8000-000000000052', '26000000-0000-4000-8000-00000000000b', 'player', TRUE),
  ('26000000-0000-4000-8000-000000000053', '26000000-0000-4000-8000-00000000000a', 'host', TRUE);

-- =============================================================================
-- Section 2: Sync oda
-- =============================================================================
SET LOCAL ROLE authenticated;

-- H start_room (authenticated EXECUTE yolu, PostgREST ile ayni)
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000a', true);
DO $$
BEGIN
  PERFORM public.start_room('26000000-0000-4000-8000-000000000051'::uuid);
  RAISE NOTICE 'OK Test 2.0: start_room (sync) authenticated rolunden calisti';
END $$;

-- Test 2.1: index=0 iken P hicbir tur goremez (start_room 5 turu bastan yaratti)
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000b', true);
DO $$
DECLARE v_t INT; v_v INT;
BEGIN
  SELECT count(*) INTO v_t FROM public.room_rounds
    WHERE room_id = '26000000-0000-4000-8000-000000000051';
  SELECT count(*) INTO v_v FROM public.room_round_question_view
    WHERE room_id = '26000000-0000-4000-8000-000000000051';
  IF v_t <> 0 OR v_v <> 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 2.1: index=0 iken tablo=% view=% tur gorunuyor', v_t, v_v;
  END IF;
  RAISE NOTICE 'OK Test 2.1: baslamamis turlar gorunmuyor (tablo=0 view=0)';
END $$;

-- H advance_round -> round 1
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000a', true);
DO $$ BEGIN PERFORM public.advance_round('26000000-0000-4000-8000-000000000051'::uuid); END $$;

-- Test 2.2: P yalniz round 1'i gorur; cevap ve aciklama reveal'dan once NULL
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000b', true);
DO $$
DECLARE
  v_t INT;
  v_row public.room_round_question_view%ROWTYPE;
  v_n INT;
BEGIN
  SELECT count(*) INTO v_t FROM public.room_rounds
    WHERE room_id = '26000000-0000-4000-8000-000000000051';
  IF v_t <> 1 THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 2.2: index=1 iken % tur gorunuyor (1 beklendi)', v_t;
  END IF;
  SELECT count(*) INTO v_n FROM public.room_round_question_view
    WHERE room_id = '26000000-0000-4000-8000-000000000051';
  SELECT * INTO v_row FROM public.room_round_question_view
    WHERE room_id = '26000000-0000-4000-8000-000000000051' AND round_index = 1;
  IF v_n <> 1 OR v_row.round_id IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 2.2: view % satir, round 1 yok', v_n;
  END IF;
  IF v_row.question_text IS NULL OR v_row.options IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 2.2: soru/secenek bos (istemci kirilir)';
  END IF;
  IF v_row.correct_answer IS NOT NULL OR v_row.explanation IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 2.2: reveal oncesi cevap=% aciklama=%',
      v_row.correct_answer, v_row.explanation;
  END IF;
  PERFORM set_config('t26.s_round1', v_row.round_id::text, true);
  RAISE NOTICE 'OK Test 2.2: yalniz round 1 gorunur, cevap/aciklama gizli';
END $$;

-- Test 2.3: snapshot sutunu dogrudan okunamaz
DO $$
DECLARE v_snap JSONB;
BEGIN
  BEGIN
    SELECT question_content_snapshot INTO v_snap FROM public.room_rounds
      WHERE room_id = '26000000-0000-4000-8000-000000000051' LIMIT 1;
    RAISE EXCEPTION 'ASSERT FAILED Test 2.3: snapshot okundu (%)', v_snap;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK Test 2.3: question_content_snapshot 42501';
  END;
END $$;

-- Test 2.4: uye olmayan O hicbir sey goremez (tablo, view, helper RPC)
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000c', true);
DO $$
DECLARE v_t INT; v_v INT; v_c INT; v_m INT;
BEGIN
  SELECT count(*) INTO v_t FROM public.room_rounds
    WHERE room_id = '26000000-0000-4000-8000-000000000051';
  SELECT count(*) INTO v_v FROM public.room_round_question_view
    WHERE room_id = '26000000-0000-4000-8000-000000000051';
  SELECT count(*) INTO v_c
    FROM public.room_round_visible_content(current_setting('t26.s_round1')::uuid);
  SELECT count(*) INTO v_m FROM public.room_members
    WHERE room_id = '26000000-0000-4000-8000-000000000051';
  IF v_t + v_v + v_c + v_m <> 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 2.4: uye olmayan tablo=% view=% rpc=% uye=% goruyor',
      v_t, v_v, v_c, v_m;
  END IF;
  RAISE NOTICE 'OK Test 2.4: uye olmayan tur/icerik/uye goremez';
END $$;

-- Test 2.5: view ve room_rounds uzerinden yazma yok (eski superuser view yolu)
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000b', true);
DO $$
BEGIN
  BEGIN
    UPDATE public.room_round_question_view SET revealed_at = NOW()
      WHERE round_id = current_setting('t26.s_round1')::uuid;
    RAISE EXCEPTION 'ASSERT FAILED Test 2.5a: view UPDATE gecti';
  EXCEPTION WHEN insufficient_privilege OR object_not_in_prerequisite_state
            OR feature_not_supported THEN NULL;
  END;
  BEGIN
    DELETE FROM public.room_round_question_view
      WHERE round_id = current_setting('t26.s_round1')::uuid;
    RAISE EXCEPTION 'ASSERT FAILED Test 2.5b: view DELETE gecti';
  EXCEPTION WHEN insufficient_privilege OR object_not_in_prerequisite_state
            OR feature_not_supported THEN NULL;
  END;
  BEGIN
    UPDATE public.room_rounds SET revealed_at = NOW()
      WHERE id = current_setting('t26.s_round1')::uuid;
    RAISE EXCEPTION 'ASSERT FAILED Test 2.5c: room_rounds UPDATE gecti';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'OK Test 2.5: view/room_rounds UPDATE+DELETE reddedildi';
END $$;

-- Test 2.6: P submit_answer (RPC yolu acik); sync'te cevap hala gizli
DO $$
DECLARE v_ans TEXT;
BEGIN
  PERFORM public.submit_answer('26000000-0000-4000-8000-000000000051'::uuid, '0');
  SELECT correct_answer INTO v_ans FROM public.room_round_question_view
    WHERE round_id = current_setting('t26.s_round1')::uuid;
  IF v_ans IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 2.6: sync odada cevap verince reveal oncesi cevap acildi';
  END IF;
  RAISE NOTICE 'OK Test 2.6: submit_answer RPC calisti, cevap reveal''a kadar gizli';
END $$;

-- H reveal_round
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000a', true);
DO $$ BEGIN PERFORM public.reveal_round('26000000-0000-4000-8000-000000000051'::uuid); END $$;

-- Test 2.7: reveal sonrasi P cevap+aciklama gorur; round 2 hala gorunmez
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000b', true);
DO $$
DECLARE v_ans TEXT; v_exp TEXT; v_t INT;
BEGIN
  SELECT correct_answer, explanation INTO v_ans, v_exp FROM public.room_round_question_view
    WHERE round_id = current_setting('t26.s_round1')::uuid;
  IF v_ans IS NULL OR v_exp IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 2.7: reveal sonrasi cevap=% aciklama=%', v_ans, v_exp;
  END IF;
  SELECT count(*) INTO v_t FROM public.room_rounds
    WHERE room_id = '26000000-0000-4000-8000-000000000051';
  IF v_t <> 1 THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 2.7: reveal state''te % tur gorunuyor (1 beklendi)', v_t;
  END IF;
  RAISE NOTICE 'OK Test 2.7: reveal sonrasi cevap+aciklama acik, sonraki tur kapali';
END $$;

-- Test 2.8: room_members dogrudan INSERT/UPDATE/DELETE yok
DO $$
BEGIN
  BEGIN
    INSERT INTO public.room_members (room_id, user_id, role)
      VALUES ('26000000-0000-4000-8000-000000000053', '26000000-0000-4000-8000-00000000000b', 'host');
    RAISE EXCEPTION 'ASSERT FAILED Test 2.8a: kendini odaya ekledi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.room_members SET score = 99999
      WHERE room_id = '26000000-0000-4000-8000-000000000051'
        AND user_id = '26000000-0000-4000-8000-00000000000b';
    RAISE EXCEPTION 'ASSERT FAILED Test 2.8b: kendi score''unu yazdi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.room_members
      WHERE room_id = '26000000-0000-4000-8000-000000000051'
        AND user_id = '26000000-0000-4000-8000-00000000000b';
    RAISE EXCEPTION 'ASSERT FAILED Test 2.8c: kendi uyeligini sildi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'OK Test 2.8: room_members INSERT/UPDATE/DELETE 42501';
END $$;

-- Test 2.9: host rooms'a ve uyelere dogrudan yazamaz (state/current_round_index/kick)
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000a', true);
DO $$
BEGIN
  BEGIN
    UPDATE public.rooms SET state = 'completed'
      WHERE id = '26000000-0000-4000-8000-000000000051';
    RAISE EXCEPTION 'ASSERT FAILED Test 2.9a: host state=completed yazdi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.rooms SET current_round_index = 5
      WHERE id = '26000000-0000-4000-8000-000000000051';
    RAISE EXCEPTION 'ASSERT FAILED Test 2.9b: host current_round_index ileri aldi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.rooms WHERE id = '26000000-0000-4000-8000-000000000051';
    RAISE EXCEPTION 'ASSERT FAILED Test 2.9c: host odayi sildi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.rooms (code, host_id, title, category)
      VALUES ('Z26XXX', '26000000-0000-4000-8000-00000000000a', 'T26 direct', 't26-acl');
    RAISE EXCEPTION 'ASSERT FAILED Test 2.9d: create_room atlanarak oda yaratildi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.room_members
      WHERE room_id = '26000000-0000-4000-8000-000000000051'
        AND user_id = '26000000-0000-4000-8000-00000000000b';
    RAISE EXCEPTION 'ASSERT FAILED Test 2.9e: host uyeyi dogrudan sildi (rakip silerek birincilik)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'OK Test 2.9: host rooms/room_members dogrudan yazamaz';
END $$;

-- Test 2.10: room_answers ve room_audit_log dogrudan erisim yok
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000b', true);
DO $$
DECLARE v_n INT;
BEGIN
  BEGIN
    INSERT INTO public.room_answers
      (room_id, round_id, user_id, answer_value, response_ms, is_correct, points_awarded)
    VALUES ('26000000-0000-4000-8000-000000000051', current_setting('t26.s_round1')::uuid,
            '26000000-0000-4000-8000-00000000000b', '0', 0, TRUE, 99999);
    RAISE EXCEPTION 'ASSERT FAILED Test 2.10a: room_answers dogrudan INSERT gecti';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.room_answers SET points_awarded = 99999
      WHERE user_id = '26000000-0000-4000-8000-00000000000b';
    RAISE EXCEPTION 'ASSERT FAILED Test 2.10b: room_answers UPDATE gecti';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SELECT count(*) INTO v_n FROM public.room_audit_log;
    RAISE EXCEPTION 'ASSERT FAILED Test 2.10c: room_audit_log okundu (% satir)', v_n;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.room_audit_log (room_id, action)
      VALUES ('26000000-0000-4000-8000-000000000051', 't26');
    RAISE EXCEPTION 'ASSERT FAILED Test 2.10d: room_audit_log INSERT gecti';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'OK Test 2.10: room_answers/room_audit_log dogrudan yazma/okuma 42501';
END $$;

-- Test 2.11: okuma yollari istemcinin kullandigi sekilde calisiyor
DO $$
DECLARE v_m INT; v_r INT; v_a INT;
BEGIN
  SELECT count(*) INTO v_m FROM public.room_members
    WHERE room_id = '26000000-0000-4000-8000-000000000051';
  SELECT count(*) INTO v_r FROM public.rooms
    WHERE id = '26000000-0000-4000-8000-000000000051';
  SELECT count(*) INTO v_a FROM public.room_answers
    WHERE room_id = '26000000-0000-4000-8000-000000000051';
  IF v_m <> 2 OR v_r <> 1 OR v_a <> 1 THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 2.11: uye=% oda=% cevap=% (2/1/1 beklendi)', v_m, v_r, v_a;
  END IF;
  RAISE NOTICE 'OK Test 2.11: rooms/room_members/room_answers SELECT istemci yolunda calisiyor';
END $$;

-- =============================================================================
-- Section 3: Async oda (tur gorunurlugu caller'in kendi ilerlemesine bagli)
-- =============================================================================
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000a', true);
DO $$ BEGIN PERFORM public.start_room('26000000-0000-4000-8000-000000000052'::uuid); END $$;

-- Test 3.1: P round 1'i gorur, cevap gizli
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000b', true);
DO $$
DECLARE v_t INT; v_ans TEXT; v_id UUID;
BEGIN
  SELECT count(*) INTO v_t FROM public.room_rounds
    WHERE room_id = '26000000-0000-4000-8000-000000000052';
  SELECT round_id, correct_answer INTO v_id, v_ans FROM public.room_round_question_view
    WHERE room_id = '26000000-0000-4000-8000-000000000052' AND round_index = 1;
  IF v_t <> 1 OR v_id IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 3.1: async % tur gorunuyor (1 beklendi)', v_t;
  END IF;
  IF v_ans IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 3.1: async cevaplamadan cevap acik';
  END IF;
  PERFORM set_config('t26.a_round1', v_id::text, true);
  RAISE NOTICE 'OK Test 3.1: async round 1 gorunur, cevap gizli';
END $$;

-- Test 3.2: P async kendi ilerlemesini dogrudan yazamaz (tur atlama / sure sifirlama)
DO $$
BEGIN
  BEGIN
    UPDATE public.room_members
      SET current_round_index = 5, current_round_started_at = NOW() + INTERVAL '1 hour'
      WHERE room_id = '26000000-0000-4000-8000-000000000052'
        AND user_id = '26000000-0000-4000-8000-00000000000b';
    RAISE EXCEPTION 'ASSERT FAILED Test 3.2: async ilerleme dogrudan yazildi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'OK Test 3.2: async current_round_index/started_at dogrudan yazilamaz';
END $$;

-- Test 3.3: P cevaplayinca kendi turunun cevabini gorur; round 2 kapali
DO $$
DECLARE v_res JSONB; v_ans TEXT; v_t INT;
BEGIN
  v_res := public.submit_answer_async('26000000-0000-4000-8000-000000000052'::uuid, '0');
  IF v_res->>'correct_answer' IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 3.3: submit_answer_async cevap dondurmedi (%)', v_res;
  END IF;
  SELECT correct_answer INTO v_ans FROM public.room_round_question_view
    WHERE round_id = current_setting('t26.a_round1')::uuid;
  IF v_ans IS DISTINCT FROM v_res->>'correct_answer' THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 3.3: view cevabi % RPC cevabi %', v_ans, v_res->>'correct_answer';
  END IF;
  SELECT count(*) INTO v_t FROM public.room_rounds
    WHERE room_id = '26000000-0000-4000-8000-000000000052';
  IF v_t <> 1 THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 3.3: cevap sonrasi % tur gorunuyor (1 beklendi)', v_t;
  END IF;
  RAISE NOTICE 'OK Test 3.3: async cevap sonrasi kendi tur cevabi acik, sonraki tur kapali';
END $$;

-- Test 3.4: H round 1'i cevaplamadi -> H icin cevap hala gizli (caller bazli)
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000a', true);
DO $$
DECLARE v_ans TEXT; v_q TEXT;
BEGIN
  SELECT correct_answer, question_text INTO v_ans, v_q FROM public.room_round_question_view
    WHERE round_id = current_setting('t26.a_round1')::uuid;
  IF v_q IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 3.4: H round 1 sorusunu goremiyor';
  END IF;
  IF v_ans IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 3.4: P cevapladi diye H''ye cevap acildi';
  END IF;
  RAISE NOTICE 'OK Test 3.4: async cevap gorunurlugu caller bazli';
END $$;

-- Test 3.5: P advance_round_for_member -> round 2 gorunur, cevabi gizli
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000b', true);
DO $$
DECLARE v_t INT; v_ans TEXT; v_q TEXT;
BEGIN
  PERFORM public.advance_round_for_member('26000000-0000-4000-8000-000000000052'::uuid);
  SELECT count(*) INTO v_t FROM public.room_rounds
    WHERE room_id = '26000000-0000-4000-8000-000000000052';
  SELECT question_text, correct_answer INTO v_q, v_ans FROM public.room_round_question_view
    WHERE room_id = '26000000-0000-4000-8000-000000000052' AND round_index = 2;
  IF v_t <> 2 OR v_q IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 3.5: ilerleme sonrasi % tur, round 2 soru=%', v_t, v_q;
  END IF;
  IF v_ans IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 3.5: round 2 cevabi cevaplamadan acik';
  END IF;
  RAISE NOTICE 'OK Test 3.5: advance_round_for_member sonrasi round 2 acik, cevabi gizli';
END $$;

-- =============================================================================
-- Section 4: Oda bitince tum turlar ve cevaplar uyelere acik (SonucView/replay)
-- =============================================================================
RESET ROLE;
UPDATE public.rooms SET state = 'completed', ended_at = NOW()
  WHERE id = '26000000-0000-4000-8000-000000000051';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000b', true);
DO $$
DECLARE v_n INT; v_ans INT;
BEGIN
  SELECT count(*), count(correct_answer) INTO v_n, v_ans FROM public.room_round_question_view
    WHERE room_id = '26000000-0000-4000-8000-000000000051';
  IF v_n <> 5 OR v_ans <> 5 THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 4.1: completed odada % tur, % cevap (5/5 beklendi)', v_n, v_ans;
  END IF;
  RAISE NOTICE 'OK Test 4.1: completed odada tum turlar ve cevaplar acik';
END $$;

-- =============================================================================
-- Section 5: RPC uyelik yollari INSERT yetkisi olmadan calisiyor
-- =============================================================================
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-00000000000c', true);
DO $$
DECLARE v_room UUID; v_n INT;
BEGIN
  v_room := public.join_room('Z26LBY');
  SELECT count(*) INTO v_n FROM public.room_members
    WHERE room_id = v_room AND user_id = '26000000-0000-4000-8000-00000000000c';
  IF v_room IS DISTINCT FROM '26000000-0000-4000-8000-000000000053'::uuid OR v_n <> 1 THEN
    RAISE EXCEPTION 'ASSERT FAILED Test 5.1: join_room oda=% uyelik=%', v_room, v_n;
  END IF;
  PERFORM public.leave_room(v_room);
  RAISE NOTICE 'OK Test 5.1: join_room + leave_room RPC calisiyor';
END $$;

-- =============================================================================
-- Section 6: anon
-- =============================================================================
SET LOCAL ROLE anon;
DO $$
DECLARE v_n INT;
BEGIN
  -- Public lobby kesfi (11_rooms_public_discovery) bozulmamali
  SELECT count(*) INTO v_n FROM public.rooms WHERE is_public = TRUE AND state = 'lobby';
  BEGIN
    SELECT count(*) INTO v_n FROM public.room_members;
    RAISE EXCEPTION 'ASSERT FAILED Test 6.1: anon room_members okudu';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.join_room('Z26LBY');
    RAISE EXCEPTION 'ASSERT FAILED Test 6.1: anon join_room calistirdi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'OK Test 6.1: anon public lobby okur, uyelik/RPC 42501';
END $$;

RESET ROLE;

ROLLBACK;
