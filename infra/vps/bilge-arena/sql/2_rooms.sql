-- =============================================================================
-- Bilge Arena Oda Sistemi: 2_rooms migration (Sprint 1 PR1 Task 1.1)
-- =============================================================================
-- Hedef: bilge_arena_dev'de oda-sistemi DDL'ini olusturmak:
--          - public.questions (Supabase'den nightly sync hedefi, JSONB-merkezli)
--          - 6 oda tablosu (rooms, room_members, room_rounds, room_answers,
--            room_reactions, room_audit_log)
--          - room_round_question_view (anti-cheat: correct_answer reveal sonrasi)
--          - 7 index (partial + standart)
--          - 6 oda tablosunda RLS aktif (policy'ler 3_rooms_rls.sql'de)
--          - Anti-cheat permissions: REVOKE on questions, GRANT on view
--
-- Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
--                 Sprint 1 PR1 Task 1.1
-- Test referansi: 2_rooms_test.sql (TDD GREEN target)
--
-- Plan-deviations:
--   #21 pg_cron yok (panola-postgres'te yuklu degil) -> retention/archival
--       VPS host cron + REST'e tasinir (rooms-retention.sh, PR1 Task 1.3).
--   #22 pgTAP yok -> plain SQL DO block + RAISE EXCEPTION test pattern.
--   #24 questions tablosu bilge_arena_dev'de yoktu; bu migration olusturuyor.
--       Schema 1:1 Supabase Panola'daki questions tablosuyla uyumlu (COPY
--       restore icin gerekli). uuid_generate_v4() yerine gen_random_uuid()
--       (pgcrypto, uuid-ossp yok). base_points GENERATED STORED korundu (PG12+
--       pg_dump COPY listesinde generated kolonlari atlar, otomatik recompute).
--   #25 questions content JSONB sema: {question, options, answer} (CHECK
--       chk_content_required_fields). View bu sema uzerinden projeksiyon yapar
--       (q.body / q.choices / q.correct_index plan-deviation, view JSONB-aware).
--   #26 Migration dosya yolu infra/vps/bilge-arena/sql/2_rooms.sql (plan:
--       database/migrations/040_rooms.sql). Sebebi: oda-sistemi sadece
--       bilge_arena_dev'de yasiyor; Supabase production migration'lariyla
--       karistirilmamasi icin ayri klasor.
--   #27 room_rounds.question_id UUID (FK YOK). Sebebi: questions tablosu
--       nightly TRUNCATE+restore ile sifirdan kuruluyor; FK CASCADE riski
--       (transactional restore mitigate eder ama defense-in-depth icin FK
--       da kaldirildi). Replay integrity icin question_content_snapshot
--       JSONB kolonu var (round_start'ta dondurulur).
--
-- Calistirma:
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/2_rooms.sql
--
-- Test (apply sonrasi):
--   docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev \
--     -v ON_ERROR_STOP=on -f - < infra/vps/bilge-arena/sql/2_rooms_test.sql
--   Beklenen: tum NOTICE 'OK: ...', exit 0
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- =============================================================================
-- 1) public.questions (Sync hedefi; Supabase Panola schema 1:1 uyumlu)
-- =============================================================================
-- Plan-deviation #24: pgcrypto'dan gen_random_uuid kullanilir.
CREATE TABLE IF NOT EXISTS public.questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     VARCHAR(20) UNIQUE,

  game            VARCHAR(20) NOT NULL CHECK (game IN (
                    'wordquest', 'matematik', 'turkce', 'fen', 'sosyal'
                  )),
  category        VARCHAR(30) NOT NULL,
  subcategory     VARCHAR(50),
  topic           VARCHAR(100),

  difficulty      SMALLINT DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  level_tag       VARCHAR(5) CHECK (level_tag IN ('A1','A2','B1','B2','C1','C2')),

  content         JSONB NOT NULL,

  -- Plan-deviation #24: GENERATED STORED kalir (pg_dump COPY listesinden
  -- haric tutulur, restore sirasinda PG kendi hesaplar).
  base_points     SMALLINT GENERATED ALWAYS AS (difficulty * 10) STORED,

  is_active       BOOLEAN DEFAULT TRUE,
  is_boss         BOOLEAN DEFAULT FALSE,
  times_answered  INTEGER DEFAULT 0,
  times_correct   INTEGER DEFAULT 0,

  source          VARCHAR(50) DEFAULT 'original',
  exam_ref        VARCHAR(20),

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT chk_content_required_fields CHECK (
    content ? 'question' AND content ? 'options' AND content ? 'answer'
  ),
  CONSTRAINT chk_correct_lte_answered CHECK (times_correct <= times_answered)
);

-- Anti-cheat: ALTER DEFAULT PRIVILEGES (0_init_db.sql) authenticated/anon'a
-- otomatik SELECT verir. Burada ozellikle REVOKE ediyoruz (questions cevaplari
-- view uzerinden dolayli sunulur, asagida bkz. room_round_question_view).
REVOKE ALL ON public.questions FROM authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO bilge_arena_app;

-- =============================================================================
-- 2) public.rooms — Oda meta + state machine
-- =============================================================================
-- Plan-deviation: code formati Crockford-32 alphabet (0/O, 1/I/L gibi belirsiz
-- karakterler haric). 6 karakter -> ~1.07 milyar kombinasyon, SMS-friendly.
CREATE TABLE public.rooms (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- code: tek UNIQUE INDEX (rooms_code_idx) asagida; inline UNIQUE eklenmedi
  -- ki "rooms_code_key" auto-index ile redundancy olusmasin.
  code                  CHAR(6) NOT NULL,
  title                 TEXT NOT NULL,
  host_id               UUID NOT NULL,                     -- Panola GoTrue user
  category              TEXT NOT NULL,
  difficulty            SMALLINT NOT NULL DEFAULT 2,
  question_count        SMALLINT NOT NULL DEFAULT 10,
  max_players           SMALLINT NOT NULL DEFAULT 8,
  per_question_seconds  SMALLINT NOT NULL DEFAULT 20,
  mode                  TEXT NOT NULL DEFAULT 'sync',
  state                 TEXT NOT NULL DEFAULT 'lobby',
  current_round_index   SMALLINT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at            TIMESTAMPTZ,
  ended_at              TIMESTAMPTZ,
  archived_at           TIMESTAMPTZ,

  CONSTRAINT chk_rooms_code_format CHECK (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  CONSTRAINT chk_rooms_title_length CHECK (char_length(title) BETWEEN 3 AND 80),
  CONSTRAINT chk_rooms_difficulty CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT chk_rooms_question_count CHECK (question_count BETWEEN 5 AND 30),
  CONSTRAINT chk_rooms_max_players CHECK (max_players BETWEEN 2 AND 20),
  CONSTRAINT chk_rooms_per_question_seconds CHECK (per_question_seconds BETWEEN 10 AND 60),
  CONSTRAINT chk_rooms_mode CHECK (mode IN ('sync','async')),
  CONSTRAINT chk_rooms_state CHECK (state IN ('lobby','active','reveal','completed','archived'))
);

-- =============================================================================
-- 3) public.room_members — Odadaki oyuncular
-- =============================================================================
CREATE TABLE public.room_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,                        -- Panola GoTrue user
  role        TEXT NOT NULL DEFAULT 'player'
                CHECK (role IN ('host','player','spectator')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at     TIMESTAMPTZ,
  score       INTEGER NOT NULL DEFAULT 0,
  streak      SMALLINT NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (room_id, user_id)
);

-- =============================================================================
-- 4) public.room_rounds — Soru turlari
-- =============================================================================
-- Plan-deviation #27: question_id UUID (FK YOK). Replay icin snapshot dondur.
CREATE TABLE public.room_rounds (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id                     UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_index                 SMALLINT NOT NULL,
  question_id                 UUID NOT NULL,        -- NO FK, plan-deviation #27
  question_content_snapshot   JSONB NOT NULL,       -- frozen at round_start
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at                     TIMESTAMPTZ NOT NULL,
  revealed_at                 TIMESTAMPTZ,          -- NULL until reveal
  closed_at                   TIMESTAMPTZ,
  UNIQUE (room_id, round_index)
);

-- =============================================================================
-- 5) public.room_answers — Tur basina oyuncu cevaplari
-- =============================================================================
CREATE TABLE public.room_answers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  round_id        UUID NOT NULL REFERENCES public.room_rounds(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  answer_value    TEXT NOT NULL,                    -- secilen secenek (string)
  is_correct      BOOLEAN,                          -- reveal sonrasi doldurulur
  response_ms     INTEGER NOT NULL CHECK (response_ms >= 0),
  points_awarded  INTEGER NOT NULL DEFAULT 0,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (round_id, user_id)
);

-- =============================================================================
-- 6) public.room_reactions — Emote / reaction mesajlari
-- =============================================================================
CREATE TABLE public.room_reactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  reaction     TEXT NOT NULL CHECK (reaction IN (
                  'baykus','kalp','alkis','yildiz','gulme','sok','hosgeldin','tebrikler'
                )),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 7) public.room_audit_log — KVKK + anti-abuse audit trail
-- =============================================================================
CREATE TABLE public.room_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  room_id      UUID NOT NULL,
  actor_id     UUID,                                -- NULL: system event
  action       TEXT NOT NULL,
  payload      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 8) Indexes (7 toplam, partial + standart)
-- =============================================================================
-- "My rooms as host" — sik sorgu, partial WHERE archived_at IS NULL
CREATE INDEX rooms_host_idx
  ON public.rooms (host_id)
  WHERE archived_at IS NULL;

-- Active room scans
CREATE INDEX rooms_archive_idx
  ON public.rooms (archived_at)
  WHERE archived_at IS NULL;

-- Code lookup: UNIQUE INDEX (uniqueness + isim "rooms_code_idx" tek nokta).
-- column DDL'de inline UNIQUE EKLENMEDI ki auto-named "rooms_code_key" ile
-- iki tane unique index olusmasin (storage + write overhead).
CREATE UNIQUE INDEX rooms_code_idx
  ON public.rooms (code);

-- "My rooms as member"
CREATE INDEX room_members_user_idx
  ON public.room_members (user_id)
  WHERE is_active = TRUE;

-- Recent reactions (broadcast feed)
-- NOT: WHERE created_at > NOW() partial INDEX desteklenmez (NOW() volatile).
-- created_at DESC ile sirali index, recent sorgular LIMIT'le hizli olur.
CREATE INDEX room_reactions_recent_idx
  ON public.room_reactions (room_id, created_at DESC);

-- Audit lookup by room
CREATE INDEX audit_log_room_idx
  ON public.room_audit_log (room_id, created_at DESC);

-- KVKK retention scan (cron icin)
CREATE INDEX audit_log_retention_idx
  ON public.room_audit_log (created_at);

-- =============================================================================
-- 9) Anti-cheat view: room_round_question_view
-- =============================================================================
-- Plan-deviation #25: questions.content JSONB schema {question, options, answer}.
-- View JSONB-aware projeksiyon yapar. correct_answer SADECE round.revealed_at
-- IS NOT NULL ise dolu doner -> client reveal'dan once cevabi alamaz.
--
-- View OWNERSHIP semantics: PG default'unda view caller-permissions DEGIL,
-- view-owner-permissions ile calisir (security_invoker = false). Bu sayede
-- 'authenticated' rolu questions tablosuna direkt SELECT yapamasa da view
-- uzerinden (bilge_arena_app olarak) okuyabilir.
CREATE VIEW public.room_round_question_view AS
SELECT
  rr.id                              AS round_id,
  rr.room_id                         AS room_id,
  rr.round_index                     AS round_index,
  rr.question_id                     AS question_id,
  rr.started_at                      AS started_at,
  rr.ends_at                         AS ends_at,
  rr.revealed_at                     AS revealed_at,
  -- Snapshot icinden okuma — replay safety (questions degisse de tutarli)
  rr.question_content_snapshot->>'question'  AS question_text,
  rr.question_content_snapshot->'options'    AS options,
  -- Anti-cheat: correct_answer reveal sonrasi doner
  CASE
    WHEN rr.revealed_at IS NOT NULL
      THEN rr.question_content_snapshot->>'answer'
    ELSE NULL
  END                                AS correct_answer,
  rr.question_content_snapshot->>'explanation' AS explanation
FROM public.room_rounds rr;

-- View permissions: authenticated reads via view-owner (bilge_arena_app)
GRANT SELECT ON public.room_round_question_view TO authenticated;

-- =============================================================================
-- 10) RLS aktivasyonu (policy'ler 3_rooms_rls.sql'de)
-- =============================================================================
-- 6 oda tablosunda RLS aktif. Policy yoklugunda TUM erisim engellenir
-- (FORCE RLS gibi davranir). Bir sonraki migration policy'leri ekler.
ALTER TABLE public.rooms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_rounds       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_answers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_reactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_audit_log    ENABLE ROW LEVEL SECURITY;

COMMIT;
