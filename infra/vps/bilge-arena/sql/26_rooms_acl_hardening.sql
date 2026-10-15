-- =============================================================================
-- Bilge Arena Oda Sistemi: 26_rooms_acl_hardening migration
-- =============================================================================
-- Hedef: Oda tablolarinda istemciye (authenticated/anon) acik kalan yazma ve
--        okuma yetkilerini kapatmak. Oda sonuclari multiplayer/grant-stats
--        uzerinden profil sayaclarina ve rozetlere aktigi icin skor ve cevap
--        manipulasyonu odul manipulasyonudur.
--
-- Kaynak: derin-inceleme-2026-10-15.md bolum 3.3, Klipper disc #2529.
--
-- Canli olcum (2026-10-15, bilge-arena-db, salt okuma):
--   - authenticated: rooms, room_members, room_rounds, room_answers,
--     room_reactions, room_audit_log ve room_round_question_view uzerinde
--     SELECT/INSERT/UPDATE/DELETE (0_init_db.sql:81-83 varsayilan yetkileri;
--     canlida grantor ba_admin).
--   - room_round_question_view sahibi ba_admin (SUPERUSER + BYPASSRLS),
--     security_invoker=false, uyelik kosulu yok. Rastgele uye-olmayan bir
--     kullanici tablodan 0, view'den 10 tur ve 10 cevap okudu. View otomatik
--     guncellenebilir (pg_relation_is_updatable=28): UPDATE/DELETE superuser
--     olarak room_rounds'a iniyordu (revealed_at yazma, tur silme).
--   - room_rounds_select_members tum satiri aciyor; question_content_snapshot
--     cevabi tasiyor ve start_room tum turlari bastan yaratiyor. Ayni sutun
--     supabase_realtime yayininda; Realtime apply_rls yalniz SELECT yetkili
--     sutunlari gonderir, yani bugun her uyeye tum cevaplar WebSocket ile
--     gidiyor.
--   - room_members_insert_self / update_self yalniz user_id kontrol ediyor:
--     herhangi bir odaya kendini ekleme, kendi score / current_round_started_at
--     / finished_at alanini yazma. verifyRoomFirstPlace (grant-stats) bu
--     score'u okuyor.
--   - rooms_update_host / delete_host: host state='completed' yazabiliyor,
--     current_round_index'i ileri alabiliyor, odayi silebiliyordu.
--   - room_answers_insert_self_active async dalinda is_correct/points_awarded
--     istemciden kabul ediliyordu.
--
-- Cozum:
--   1) public semasindaki varsayilan yetkiler authenticated/anon'dan geri alinir
--      (gelecek tablolar otomatik acilmaz).
--   2) Yazmalar yalniz SECURITY DEFINER RPC'lerden (join_room, leave_room,
--      kick_member, create_room, start_room, advance_round, reveal_round,
--      submit_answer, submit_answer_async, advance_round_for_member,
--      cancel_room). Istemci kodu (src/lib/rooms) tablolara dogrudan yazmiyor;
--      tum yazmalar /rpc/ uzerinden. Bu yuzden authenticated'dan INSERT/UPDATE/
--      DELETE geri alinir ve ilgili politikalar kaldirilir.
--      room_members UPDATE icin izinli sutun kumesi BOS: istemci hicbir
--      room_members sutununu dogrudan yazmiyor (async ilerleme
--      advance_round_for_member ile).
--   3) room_rounds SELECT sutun bazina iner: question_content_snapshot
--      authenticated'a kapali. Realtime payload'i da ayni yetkiyle suzulur.
--   4) Tur gorunurlugu round_index ile sinirlanir (can_view_room_round):
--        sync : round_index <= rooms.current_round_index
--        async: round_index <= room_members.current_round_index (caller) veya
--               caller bitirdiyse tumu
--        completed/archived: tumu
--   5) room_round_question_view yeniden kurulur: security_invoker=true, sahibi
--      bilge_arena_app, yalniz SELECT. Soru/secenekler SECURITY DEFINER
--      room_round_visible_content'ten gelir; correct_answer ve explanation
--      (aciklama cogu zaman cevabi soyluyor) yalniz reveal sonrasi, async'te
--      caller o turu cevapladiktan sonra veya oda bittikten sonra doner.
--   6) Auth isteyen RPC'ler ve trigger fonksiyonlari PUBLIC/anon EXECUTE'dan
--      cikarilir (hepsi auth.uid() NULL ise zaten reddediyordu; follow-
--      privileges OpenAPI'de anon'a gorunmesinler).
--
-- Plan-deviations:
--   #140 Cevabi ayri servis tablosuna tasimak yerine sutun bazli SELECT secildi:
--        question_content_snapshot'i okuyan 8+ SECURITY DEFINER fonksiyon
--        (submit_answer*, reveal_round, bot, replay, pre_create) degismeden
--        kalir; regresyon yuzeyi sadece yetki katmani.
--   #141 room_reactions INSERT korunur (politika uye + kendi user_id), ama
--        sutun listesine indirilir. Skor/odul yolu degil.
--   #142 0_init_db.sql gecmis kayit olarak degistirilmedi; varsayilan yetkiyi
--        bu migration geri alir. Yeni kurulumda 0..26 sirayla uygulanir.
--
-- Calistirma (SUPERUSER gerekli: view'in canli sahibi ba_admin, varsayilan
-- yetkilerin grantor'u ba_admin; nesneler SET LOCAL ROLE bilge_arena_app ile
-- yaratilir ki SECURITY DEFINER fonksiyonlar superuser olarak calismasin):
--   docker exec -i bilge-arena-db psql -U ba_admin -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/26_rooms_acl_hardening.sql
--
-- Test (apply sonrasi, yine superuser: test anon rolune de gecer):
--   docker exec -i bilge-arena-db psql -U ba_admin -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/26_rooms_acl_hardening_test.sql
--
-- PostgREST (ayri adim, container yeniden yaratilir):
--   /opt/bilge-arena/secrets/postgrest.env: PGRST_OPENAPI_MODE=follow-privileges
--   (generate-postgrest-env.sh ve .env.example guncellendi). Bu migration
--   sonunda NOTIFY pgrst ile schema cache yenilenir.
--   Bilinen davranis: view'e PATCH/DELETE artik PostgreSQL 55000 ("view not
--   automatically updatable") ile HTTP 500 doner; hicbir satir degismez.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 0) Superuser guard
-- =============================================================================
DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION '26_rooms_acl_hardening superuser ile calismali (current_user=%)', current_user;
  END IF;
  -- Nesneler SET LOCAL ROLE bilge_arena_app ile yaratilacak; DB sahibi
  -- bilge_arena_app degilse (pg_database_owner) public'te CREATE yetkisi olmaz.
  IF NOT has_schema_privilege('bilge_arena_app', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'bilge_arena_app public semasinda CREATE yetkisine sahip degil (DB sahibi: %)',
      (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database());
  END IF;
END $$;

-- =============================================================================
-- 1) Varsayilan yetkiler: public'te yeni tablo/sequence/fonksiyon otomatik acilmasin
-- =============================================================================
-- Canlida grantor ba_admin; eski ortamda panola_admin. Grantor'dan bagimsiz
-- olmak icin pg_default_acl taranir.
DO $$
DECLARE
  r RECORD;
  v_kind TEXT;
BEGIN
  FOR r IN
    SELECT DISTINCT pg_get_userbyid(d.defaclrole) AS grantor,
                    d.defaclobjtype AS objtype,
                    d.defaclnamespace AS nsp
    FROM pg_default_acl d, aclexplode(d.defaclacl) a
    WHERE d.defaclnamespace IN ('public'::regnamespace, 0)
      AND a.grantee IN ('authenticated'::regrole, 'anon'::regrole)
  LOOP
    v_kind := CASE r.objtype
                WHEN 'r' THEN 'TABLES'
                WHEN 'S' THEN 'SEQUENCES'
                WHEN 'f' THEN 'FUNCTIONS'
                WHEN 'T' THEN 'TYPES'
              END;
    CONTINUE WHEN v_kind IS NULL;
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I %s REVOKE ALL ON %s FROM authenticated, anon',
      r.grantor,
      CASE WHEN r.nsp = 0 THEN '' ELSE 'IN SCHEMA public' END,
      v_kind
    );
    RAISE NOTICE 'default privileges geri alindi: grantor=% kind=%', r.grantor, v_kind;
  END LOOP;
END $$;

-- =============================================================================
-- 2) Eski view'i dusur (canli sahibi ba_admin, sadece superuser dusurebilir)
-- =============================================================================
DROP VIEW public.room_round_question_view;

-- Bundan sonraki her nesne bilge_arena_app sahipliginde yaratilir.
SET LOCAL ROLE bilge_arena_app;

-- =============================================================================
-- 3) Gorunurluk helper'lari (SECURITY DEFINER, owner bilge_arena_app)
-- =============================================================================
-- can_view_room_round: caller bu turun sorusunu gorebilir mi?
-- room_rounds'u okumaz (policy recursion yok); rooms + room_members owner
-- bypass ile okunur (is_room_member ile ayni desen).
CREATE OR REPLACE FUNCTION public.can_view_room_round(p_room_id UUID, p_round_index SMALLINT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rooms r
    JOIN public.room_members m
      ON m.room_id = r.id
     AND m.user_id = auth.uid()
     AND m.is_active = TRUE
    WHERE r.id = p_room_id
      AND (
        r.state IN ('completed', 'archived')
        OR (r.mode = 'sync'  AND p_round_index <= r.current_round_index)
        OR (r.mode = 'async' AND (m.finished_at IS NOT NULL
                                  OR p_round_index <= m.current_round_index))
      )
  );
$$;

-- room_round_visible_content: view'in snapshot projeksiyonu. Dogrudan /rpc ile
-- de cagrilabildigi icin kendi gorunurluk kontrolunu yapar; gorunmeyen tur
-- icin satir dondurmez.
CREATE OR REPLACE FUNCTION public.room_round_visible_content(p_round_id UUID)
RETURNS TABLE (
  question_text  TEXT,
  options        JSONB,
  correct_answer TEXT,
  explanation    TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    rr.question_content_snapshot->>'question',
    rr.question_content_snapshot->'options',
    CASE WHEN v.answer_visible THEN rr.question_content_snapshot->>'answer' END,
    CASE WHEN v.answer_visible THEN rr.question_content_snapshot->>'explanation' END
  FROM public.room_rounds rr
  JOIN public.rooms r ON r.id = rr.room_id
  CROSS JOIN LATERAL (
    SELECT (
      rr.revealed_at IS NOT NULL
      OR r.state IN ('completed', 'archived')
      OR (r.mode = 'async' AND EXISTS (
            SELECT 1 FROM public.room_answers a
            WHERE a.round_id = rr.id
              AND a.user_id = auth.uid()
          ))
    ) AS answer_visible
  ) v
  WHERE rr.id = p_round_id
    AND public.can_view_room_round(rr.room_id, rr.round_index);
$$;

REVOKE ALL ON FUNCTION public.can_view_room_round(UUID, SMALLINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.room_round_visible_content(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_room_round(UUID, SMALLINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.room_round_visible_content(UUID) TO authenticated;

-- =============================================================================
-- 4) room_rounds: sutun bazli SELECT + round_index gorunurlugu
-- =============================================================================
REVOKE ALL ON public.room_rounds FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, room_id, round_index, question_id, started_at, ends_at,
              revealed_at, closed_at)
  ON public.room_rounds TO authenticated;
-- question_content_snapshot bilerek yok: cevap + aciklama tasir.

DROP POLICY IF EXISTS room_rounds_select_members ON public.room_rounds;
DROP POLICY IF EXISTS room_rounds_select_visible ON public.room_rounds;
CREATE POLICY room_rounds_select_visible ON public.room_rounds
  FOR SELECT TO authenticated
  USING (public.can_view_room_round(room_id, round_index));

-- =============================================================================
-- 5) room_round_question_view: security_invoker, sahibi bilge_arena_app
-- =============================================================================
-- Kolon adlari/tipleri/sirasi eskisiyle ayni (istemci select=* kullaniyor).
-- LATERAL join view'i otomatik guncellenemez yapar; ayrica yalniz SELECT verilir.
CREATE VIEW public.room_round_question_view
  WITH (security_invoker = true)
AS
SELECT
  rr.id            AS round_id,
  rr.room_id       AS room_id,
  rr.round_index   AS round_index,
  rr.question_id   AS question_id,
  rr.started_at    AS started_at,
  rr.ends_at       AS ends_at,
  rr.revealed_at   AS revealed_at,
  c.question_text  AS question_text,
  c.options        AS options,
  c.correct_answer AS correct_answer,
  c.explanation    AS explanation
FROM public.room_rounds rr
CROSS JOIN LATERAL public.room_round_visible_content(rr.id) c
WHERE public.is_room_member(rr.room_id);

REVOKE ALL ON public.room_round_question_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.room_round_question_view TO authenticated;

-- =============================================================================
-- 6) room_members: yazma yalniz RPC (join_room, leave_room, kick_member, ...)
-- =============================================================================
REVOKE ALL ON public.room_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.room_members TO authenticated;

DROP POLICY IF EXISTS room_members_insert_self ON public.room_members;
DROP POLICY IF EXISTS room_members_update_self ON public.room_members;
DROP POLICY IF EXISTS room_members_delete_self_or_host ON public.room_members;
-- room_members_select_same_room korunur.

-- =============================================================================
-- 7) rooms: yazma yalniz RPC (create_room, start_room, advance_round, cancel_room)
-- =============================================================================
REVOKE ALL ON public.rooms FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rooms TO authenticated, anon;
-- anon SELECT: 11_rooms_public_discovery (rooms_select_public_lobby) icin.

DROP POLICY IF EXISTS rooms_insert_self_host ON public.rooms;
DROP POLICY IF EXISTS rooms_update_host ON public.rooms;
DROP POLICY IF EXISTS rooms_delete_host ON public.rooms;
-- rooms_select_host_or_member ve rooms_select_public_lobby korunur.

-- =============================================================================
-- 8) room_answers: yazma yalniz submit_answer / submit_answer_async
-- =============================================================================
REVOKE ALL ON public.room_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.room_answers TO authenticated;

DROP POLICY IF EXISTS room_answers_insert_self_active ON public.room_answers;
-- room_answers_select_self_or_revealed korunur.

-- =============================================================================
-- 9) room_reactions: SELECT + sutun bazli INSERT (plan-deviation #141)
-- =============================================================================
REVOKE ALL ON public.room_reactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.room_reactions TO authenticated;
GRANT INSERT (room_id, user_id, reaction) ON public.room_reactions TO authenticated;

-- =============================================================================
-- 10) room_audit_log + sequence'lar: istemciye tamamen kapali
-- =============================================================================
REVOKE ALL ON public.room_audit_log FROM PUBLIC, anon, authenticated;

DO $$
DECLARE s RECORD;
BEGIN
  FOR s IN
    SELECT c.oid::regclass AS seq
    FROM pg_class c
    WHERE c.relkind = 'S' AND c.relnamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', s.seq);
  END LOOP;
END $$;

-- questions zaten kapali (2_rooms.sql:97); tekrar teyit.
REVOKE ALL ON public.questions FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 11) Fonksiyon EXECUTE: auth isteyen RPC'ler yalniz authenticated
-- =============================================================================
DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.is_room_member(uuid)',
    'public.is_room_host(uuid)',
    'public.join_room(character)',
    'public.leave_room(uuid)',
    'public.kick_member(uuid,uuid)',
    'public.start_room(uuid)',
    'public.cancel_room(uuid,text)',
    'public.advance_round(uuid)',
    'public.reveal_round(uuid)',
    'public.submit_answer(uuid,text)',
    'public.submit_answer_async(uuid,text)',
    'public.advance_round_for_member(uuid)'
  ]
  LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'beklenen RPC yok: %', v_fn;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
  END LOOP;

  -- Trigger fonksiyonlari dogrudan cagrilamaz; EXECUTE kimseye gerekmez.
  FOREACH v_fn IN ARRAY ARRAY[
    'public._room_members_count_sync()',
    'public._bot_answers_round_start_trigger()',
    'public._check_all_members_finished_async()',
    'public._bot_async_pace_with_user()'
  ]
  LOOP
    IF to_regprocedure(v_fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    END IF;
  END LOOP;
END $$;

RESET ROLE;

-- =============================================================================
-- 12) Dogrulama (transaction icinde; basarisizsa her sey geri alinir)
-- =============================================================================
DO $$
DECLARE
  v_tbl TEXT;
  v_priv TEXT;
  v_owner TEXT;
  v_super BOOLEAN;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY[
    'public.rooms', 'public.room_members', 'public.room_rounds',
    'public.room_answers', 'public.room_reactions', 'public.room_audit_log',
    'public.room_round_question_view', 'public.questions'
  ]
  LOOP
    FOREACH v_priv IN ARRAY ARRAY['UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      IF has_table_privilege('authenticated', v_tbl, v_priv)
         OR has_table_privilege('anon', v_tbl, v_priv) THEN
        RAISE EXCEPTION 'ASSERT FAILED: % hala % yetkisi veriyor', v_tbl, v_priv;
      END IF;
    END LOOP;
    IF v_tbl <> 'public.room_reactions'
       AND (has_any_column_privilege('authenticated', v_tbl, 'INSERT')
            OR has_any_column_privilege('anon', v_tbl, 'INSERT')) THEN
      RAISE EXCEPTION 'ASSERT FAILED: % hala INSERT yetkisi veriyor', v_tbl;
    END IF;
  END LOOP;

  IF has_column_privilege('authenticated', 'public.room_rounds',
                          'question_content_snapshot', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERT FAILED: question_content_snapshot authenticated''a acik';
  END IF;

  SELECT pg_get_userbyid(c.relowner), r.rolsuper
    INTO v_owner, v_super
    FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
    WHERE c.oid = 'public.room_round_question_view'::regclass;
  IF v_super OR v_owner <> 'bilge_arena_app' THEN
    RAISE EXCEPTION 'ASSERT FAILED: view sahibi % (superuser=%)', v_owner, v_super;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.room_round_question_view'::regclass
      AND 'security_invoker=true' = ANY(reloptions)
  ) THEN
    RAISE EXCEPTION 'ASSERT FAILED: view security_invoker=true degil';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_default_acl d, aclexplode(d.defaclacl) a
    WHERE d.defaclnamespace IN ('public'::regnamespace, 0)
      AND a.grantee IN ('authenticated'::regrole, 'anon'::regrole)
  ) THEN
    RAISE EXCEPTION 'ASSERT FAILED: public varsayilan yetkileri hala authenticated/anon iceriyor';
  END IF;

  RAISE NOTICE 'OK: 26_rooms_acl_hardening dogrulandi';
END $$;

-- PostgREST schema cache (commit'te teslim edilir)
NOTIFY pgrst, 'reload schema';

COMMIT;
