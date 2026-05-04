-- =============================================================================
-- Bilge Arena Oda Sistemi: 22_pre_create_rounds_distinct test (TDD)
-- =============================================================================
-- Hedef: _pre_create_rounds DISTINCT ON content->>'question' fix dogrulamasi:
--          - 1 oda 5 round'da 5 ESSIZ soru (duplicate yok)
--          - 3 farkli oda farkli soru kombinasyonlari (random calisiyor)
--          - Duplicate-iceren kategori (paragraf) icin pool size > question_count
--            essiz soru sayisi yeterli olmali
--
-- Kullanim (PANOLA_ADMIN — FORCE RLS bypass):
--   docker exec -i panola-postgres psql -U panola_admin -h localhost \
--     -d bilge_arena_dev -v ON_ERROR_STOP=on \
--     -f - < infra/vps/bilge-arena/sql/22_pre_create_rounds_distinct_test.sql
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- Test 1: 1 oda 5 round - hepsi essiz soru (duplicate olmamali)
-- =============================================================================
-- Setup: paragraf kategorisinde duplicate var (production'dan: 320 satir / 120 essiz)
-- Yeterli pool icin paragraf kullanmak yerine kontrollu mock pool olusturalim
INSERT INTO public.questions (external_id, game, category, difficulty, content, is_active)
VALUES
  -- 5 essiz icerik, ama her biri 2-3 duplicate var (production paterni simule)
  ('22test-q1a', 'matematik', '22-test-cat', 2, '{"question":"q1","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE),
  ('22test-q1b', 'matematik', '22-test-cat', 2, '{"question":"q1","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE),
  ('22test-q1c', 'matematik', '22-test-cat', 2, '{"question":"q1","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE),
  ('22test-q2a', 'matematik', '22-test-cat', 2, '{"question":"q2","options":["a","b","c","d"],"answer":"b"}'::jsonb, TRUE),
  ('22test-q2b', 'matematik', '22-test-cat', 2, '{"question":"q2","options":["a","b","c","d"],"answer":"b"}'::jsonb, TRUE),
  ('22test-q3a', 'matematik', '22-test-cat', 2, '{"question":"q3","options":["a","b","c","d"],"answer":"c"}'::jsonb, TRUE),
  ('22test-q3b', 'matematik', '22-test-cat', 2, '{"question":"q3","options":["a","b","c","d"],"answer":"c"}'::jsonb, TRUE),
  ('22test-q4',  'matematik', '22-test-cat', 2, '{"question":"q4","options":["a","b","c","d"],"answer":"d"}'::jsonb, TRUE),
  ('22test-q5a', 'matematik', '22-test-cat', 2, '{"question":"q5","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE),
  ('22test-q5b', 'matematik', '22-test-cat', 2, '{"question":"q5","options":["a","b","c","d"],"answer":"a"}'::jsonb, TRUE);
-- Total 10 satir, 5 essiz icerik (q1-q5)

-- Test oda
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('22aa1111-2222-3333-4444-555555555555', 'TEST22',
   'aaaa1111-1111-1111-1111-111111111111', '22 Test', '22-test-cat', 2, 5,
   4, 20, 'sync', 'lobby');

-- pre_create_rounds direkt cagri (start_room icinden cagrilir, test icin direkt)
SELECT public._pre_create_rounds(
  '22aa1111-2222-3333-4444-555555555555'::uuid,
  NOW()
);

-- Test 1.1: 5 round olusturuldu
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM public.room_rounds
  WHERE room_id = '22aa1111-2222-3333-4444-555555555555';
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'FAIL Test 1.1: % round (5 beklendi)', v_count;
  END IF;
  RAISE NOTICE 'OK Test 1.1: 5 round olusturuldu';
END $$;

-- Test 1.2: KRITIK — 5 round'un question'lari ESSIZ (duplicate yok)
DO $$
DECLARE v_essiz INT; v_total INT;
BEGIN
  SELECT count(DISTINCT question_content_snapshot->>'question'),
         count(*)
  INTO v_essiz, v_total
  FROM public.room_rounds
  WHERE room_id = '22aa1111-2222-3333-4444-555555555555';
  IF v_essiz <> v_total OR v_essiz <> 5 THEN
    RAISE EXCEPTION 'FAIL Test 1.2: % essiz / % toplam (5/5 beklendi - DUPLICATE BUG)',
      v_essiz, v_total;
  END IF;
  RAISE NOTICE 'OK Test 1.2: 5 essiz soru / 5 round (duplicate yok)';
END $$;

-- =============================================================================
-- Test 2: 3 oda farkli question kombinasyonlari (random calisiyor)
-- =============================================================================
-- Pool 5 essiz q (q1-q5), question_count=5 -> her oda her zaman ayni 5 secer
-- AMA siralama random olmali. Sıralama dogrula:
INSERT INTO public.rooms
  (id, code, host_id, title, category, difficulty, question_count,
   max_players, per_question_seconds, mode, state)
VALUES
  ('22aa2222-2222-3333-4444-555555555555', 'TEST2A',
   'aaaa1111-1111-1111-1111-111111111111', '22 Test 2', '22-test-cat', 2, 5,
   4, 20, 'sync', 'lobby'),
  ('22aa3333-2222-3333-4444-555555555555', 'TEST2B',
   'aaaa1111-1111-1111-1111-111111111111', '22 Test 3', '22-test-cat', 2, 5,
   4, 20, 'sync', 'lobby');

SELECT public._pre_create_rounds('22aa2222-2222-3333-4444-555555555555'::uuid, NOW());
SELECT public._pre_create_rounds('22aa3333-2222-3333-4444-555555555555'::uuid, NOW());

-- Test 2.1: Her 2 oda da essiz soru (duplicate yok regression)
DO $$
DECLARE v_essiz_2 INT; v_essiz_3 INT;
BEGIN
  SELECT count(DISTINCT question_content_snapshot->>'question') INTO v_essiz_2
  FROM public.room_rounds WHERE room_id = '22aa2222-2222-3333-4444-555555555555';
  SELECT count(DISTINCT question_content_snapshot->>'question') INTO v_essiz_3
  FROM public.room_rounds WHERE room_id = '22aa3333-2222-3333-4444-555555555555';
  IF v_essiz_2 <> 5 OR v_essiz_3 <> 5 THEN
    RAISE EXCEPTION 'FAIL Test 2.1: oda2 essiz=%, oda3 essiz=% (5/5 beklendi)',
      v_essiz_2, v_essiz_3;
  END IF;
  RAISE NOTICE 'OK Test 2.1: 3 oda her biri 5 essiz soru';
END $$;

-- Test 2.2: 3 oda farkli sirayla (random siralama dogrula)
-- Pool 5 essiz, question_count=5 -> her oda ayni 5 soruyu farkli sirada
DO $$
DECLARE
  v_oda1_first TEXT; v_oda2_first TEXT; v_oda3_first TEXT;
  v_diff_count INT;
BEGIN
  SELECT question_content_snapshot->>'question' INTO v_oda1_first
  FROM public.room_rounds
  WHERE room_id = '22aa1111-2222-3333-4444-555555555555' AND round_index = 1;
  SELECT question_content_snapshot->>'question' INTO v_oda2_first
  FROM public.room_rounds
  WHERE room_id = '22aa2222-2222-3333-4444-555555555555' AND round_index = 1;
  SELECT question_content_snapshot->>'question' INTO v_oda3_first
  FROM public.room_rounds
  WHERE room_id = '22aa3333-2222-3333-4444-555555555555' AND round_index = 1;

  RAISE NOTICE 'Oda1 round1: %, Oda2 round1: %, Oda3 round1: %',
    v_oda1_first, v_oda2_first, v_oda3_first;
  -- 3 oda'nin round 1 sorusu farkli olabilir (random); ayni olabilir de.
  -- Probabilistic test (5 secim icinden ayni round'a hep ayni soru gelmesi
  -- 1/5*1/5 = 4% olasilik, kabul edilebilir flake riski).
  -- Bu test sadece RAISE NOTICE bilgi amacli, FAIL ETMEZ.
  RAISE NOTICE 'OK Test 2.2: random siralama bilgi (probabilistic, fail etmez)';
END $$;

-- =============================================================================
-- Test 3: Pool size question_count'tan az ise FAIL etmez (essiz pool size kontrolu)
-- =============================================================================
-- start_room "Yeterli soru yok" P0004 firlatir, _pre_create_rounds direkt
-- cagrilirsa 5'ten az satir insert eder (CHECK constraint olur). Ama
-- `WHERE pos <= question_count` filter ile sadece pool kadar insert.
-- Bu test scope disinda — start_room icinden P0004 koruyor.

ROLLBACK;
