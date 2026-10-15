-- PostgREST kontrat testlerinin ortak, odakli uyumluluk fikstürü.
--
-- Uretim klonu DEGILDIR: yalniz route'larin gomdugu iliskileri ve PostgREST'in
-- iliski secimini etkileyen tablolari modeller. Kural:
--   * PK, UNIQUE ve FK'ler (kisit adlariyla) uretim migration'larindan aynen
--     alinir; kaynak her tablonun ustunde yazilidir.
--   * Sutunlar yalniz route'larin okudugu/yazdigi kadardir; her sutunun canli
--     semada bulundugu src/types/database.generated.ts ile sinanir.
--   * Gomulen her cift icin, iki uca da FK'si olan her tablo (junction adayi)
--     burada bulunur; PostgREST M2M iliskisini ancak bu FK sutunlari junction'in
--     PK'si icindeyse kurar, o yuzden bu tablolarin PK'leri de birebirdir.
-- harness.ts:assertFixtureMirrorsGeneratedSchema bu kurallari her dosyada denetler.

CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $fn$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;

-- schema.sql + 023 (profiles_id_fkey RESTRICT) + referral (referred_by).
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  username varchar(32) UNIQUE NOT NULL,
  display_name varchar(64),
  avatar_url text,
  level_name varchar(20) DEFAULT 'Acemi',
  total_xp integer DEFAULT 0,
  exam_type text,
  referred_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT
);

-- schema.sql; published_revision_id 106 + 164.
CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id varchar(20) UNIQUE,
  game varchar(20) NOT NULL,
  category varchar(30) NOT NULL,
  subcategory varchar(50),
  topic varchar(100),
  difficulty smallint DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  level_tag varchar(5),
  content jsonb NOT NULL,
  base_points smallint GENERATED ALWAYS AS (difficulty * 10) STORED,
  is_active boolean DEFAULT true,
  is_boss boolean DEFAULT false,
  times_answered integer DEFAULT 0,
  times_correct integer DEFAULT 0,
  source varchar(50) DEFAULT 'original',
  exam_ref varchar(20),
  published_revision_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 106 (+ 164: UNIQUE(id, question_id)).
CREATE TABLE public.question_content_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_no integer NOT NULL CHECK (revision_no >= 1),
  base_revision_id uuid REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  prepared_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  outcomes_prepared_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  UNIQUE (question_id, revision_no),
  CONSTRAINT question_content_revisions_id_question_id_key UNIQUE (id, question_id)
);
ALTER TABLE public.questions
  ADD CONSTRAINT questions_published_revision_id_fkey
    FOREIGN KEY (published_revision_id) REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT questions_published_revision_question_fkey
    FOREIGN KEY (published_revision_id, id) REFERENCES public.question_content_revisions(id, question_id);

-- schema.sql
CREATE TABLE public.game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game varchar(20) NOT NULL,
  mode varchar(20) DEFAULT 'classic',
  status varchar(15) DEFAULT 'active',
  total_questions smallint DEFAULT 0,
  correct_count smallint DEFAULT 0,
  total_xp integer DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- schema.sql; question_revision_id 106.
CREATE TABLE public.session_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  question_revision_id uuid REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  selected_option smallint,
  is_correct boolean NOT NULL,
  is_skipped boolean DEFAULT false,
  answered_at timestamptz DEFAULT now()
);

-- 094 (tum sutunlar: due-map.ts kalici FSRS okumasi hepsini secer).
CREATE TABLE public.review_cards (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  stability numeric(14,8) NOT NULL DEFAULT 0,
  difficulty numeric(14,8) NOT NULL DEFAULT 0,
  elapsed_days integer NOT NULL DEFAULT 0 CHECK (elapsed_days >= 0),
  scheduled_days integer NOT NULL DEFAULT 0 CHECK (scheduled_days >= 0),
  reps integer NOT NULL DEFAULT 0 CHECK (reps >= 0),
  lapses integer NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  learning_steps integer NOT NULL DEFAULT 0 CHECK (learning_steps >= 0),
  state smallint NOT NULL DEFAULT 0 CHECK (state BETWEEN 0 AND 3),
  last_review_at timestamptz,
  last_answer_id uuid,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, question_id),
  CONSTRAINT review_cards_last_answer_id_fkey
    FOREIGN KEY (last_answer_id) REFERENCES public.session_answers(id) ON DELETE RESTRICT
);

-- 094
CREATE TABLE public.review_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  answer_id uuid NOT NULL UNIQUE REFERENCES public.session_answers(id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating IN (1, 3)),
  reviewed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT review_logs_id_user_unique UNIQUE (id, user_id)
);

-- 094 (tablo ve tohum satirlari)
CREATE TABLE public.review_error_reasons (
  code text PRIMARY KEY CHECK (code IN ('knowledge_gap','misread','calculation','time_management','careless','guess')),
  label_tr text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL CHECK (sort_order >= 0)
);
INSERT INTO public.review_error_reasons (code, label_tr, sort_order) VALUES
  ('knowledge_gap','Bilgi eksiği',10), ('misread','Soruyu yanlış okuma',20),
  ('calculation','Hesaplama hatası',30), ('time_management','Süre yönetimi',40),
  ('careless','Dikkat hatası',50), ('guess','Tahmin',60);

-- 094: PK yalniz review_log_id, FK (review_log_id, user_id) bilesik. FK
-- sutunlari bir anahtara denk gelmedigi icin PostgREST bunu 1:N gorur.
CREATE TABLE public.review_error_annotations (
  review_log_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason_code text NOT NULL REFERENCES public.review_error_reasons(code),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT review_error_annotations_log_owner_fkey
    FOREIGN KEY (review_log_id, user_id) REFERENCES public.review_logs(id, user_id) ON DELETE CASCADE
);

-- 097: session_answers <-> questions junction adayi; PK (answer_id, outcome_id)
-- question_id'yi icermez. outcome_id/attempt_id FK'leri fikstür disi tablolara.
CREATE TABLE public.mastery_outcome_evidence (
  answer_id uuid NOT NULL REFERENCES public.session_answers(id) ON DELETE RESTRICT,
  outcome_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  PRIMARY KEY (answer_id, outcome_id)
);

-- 106: session_answers <-> questions junction adayi; PK yalniz id.
CREATE TABLE public.question_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  session_answer_id uuid REFERENCES public.session_answers(id) ON DELETE RESTRICT,
  revision_id uuid REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT
);

-- 016
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission)
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id)
);

-- 136
CREATE TABLE public.question_validation_runtime (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enforce_publish_gate boolean NOT NULL DEFAULT false,
  required_policy_version text NOT NULL DEFAULT 'question-quality@1',
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.question_validation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE CASCADE,
  content_sha256 text NOT NULL CHECK (char_length(content_sha256) = 64),
  policy_version text NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('APPROVED','REJECTED','NEEDS_REVIEW','INCONCLUSIVE')),
  findings jsonb NOT NULL CHECK (jsonb_typeof(findings) = 'array'),
  rationale text NOT NULL,
  blind_consensus_index smallint,
  blind_agreement_ratio numeric(8,6) CHECK (blind_agreement_ratio BETWEEN 0 AND 1),
  run_id uuid NOT NULL,
  decided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (revision_id, content_sha256, policy_version)
);
