-- Migration 148: seed a small, deterministic clean-control set for the
-- community question-quality pilot.
--
-- These questions are deliberately inactive and have no published revision.
-- They can only be served by the private quality-mission RPC, so they cannot
-- leak into ordinary lessons or exams.  Their answers are derived from fixed,
-- auditable facts rather than model judgement.
BEGIN;

CREATE TEMP TABLE community_quality_control_seed (
  question_id uuid PRIMARY KEY,
  revision_id uuid UNIQUE NOT NULL,
  game text NOT NULL,
  category text NOT NULL,
  topic text NOT NULL,
  difficulty smallint NOT NULL,
  exam_ref text NOT NULL,
  content jsonb NOT NULL,
  proof jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.community_quality_control_seed(
  question_id,revision_id,game,category,topic,difficulty,exam_ref,content,proof
) VALUES
(
  '9c000001-0000-4000-8000-000000000001',
  '9c100001-0000-4000-8000-000000000001',
  'matematik','sayilar','Yüzde hesapları',1,'TYT',
  $json${"question":"Bir sayının %25'i 18 olduğuna göre bu sayı kaçtır?","options":["54","64","72","80","90"],"answer":2,"solution":"Sayının dörtte biri 18 ise tamamı 18 × 4 = 72 olur."}$json$::jsonb,
  $json${"rule":"18 / 0.25 = 72","kind":"exact_arithmetic","version":1}$json$::jsonb
),
(
  '9c000002-0000-4000-8000-000000000002',
  '9c100002-0000-4000-8000-000000000002',
  'matematik','cebir','Birinci derece denklemler',1,'LGS',
  $json${"question":"2x + 7 = 23 denkleminde x değeri kaçtır?","options":["6","7","8","9","10"],"answer":2,"solution":"Her iki taraftan 7 çıkarılır: 2x = 16. İkiye bölünür ve x = 8 bulunur."}$json$::jsonb,
  $json${"rule":"(23 - 7) / 2 = 8","kind":"exact_algebra","version":1}$json$::jsonb
),
(
  '9c000003-0000-4000-8000-000000000003',
  '9c100003-0000-4000-8000-000000000003',
  'fen','fizik','Isı ve sıcaklık',1,'LGS',
  $json${"question":"Standart atmosfer basıncında saf suyun donma sıcaklığı kaç °C'dir?","options":["-10","0","10","50","100"],"answer":1,"solution":"Saf su standart atmosfer basıncında 0 °C'de donar."}$json$::jsonb,
  $json${"rule":"water_freezing_point_celsius_at_1_atm = 0","kind":"physical_constant","version":1}$json$::jsonb
),
(
  '9c000004-0000-4000-8000-000000000004',
  '9c100004-0000-4000-8000-000000000004',
  'sosyal','cografya','Türkiye coğrafyası',1,'LGS',
  $json${"question":"Türkiye Cumhuriyeti'nin başkenti aşağıdakilerden hangisidir?","options":["Ankara","Bursa","İstanbul","İzmir","Konya"],"answer":0,"solution":"Türkiye Cumhuriyeti'nin başkenti Ankara'dır."}$json$::jsonb,
  $json${"rule":"capital_of_turkiye = Ankara","kind":"constitutional_fact","version":1}$json$::jsonb
),
(
  '9c000005-0000-4000-8000-000000000005',
  '9c100005-0000-4000-8000-000000000005',
  'wordquest','vocabulary','Synonyms',1,'YDT',
  $json${"question":"Which word is closest in meaning to ‘rapid’?","options":["distant","quick","silent","unclear","weak"],"answer":1,"solution":"‘Rapid’ and ‘quick’ both mean happening in a short time or at high speed."}$json$::jsonb,
  $json${"rule":"rapid = quick","kind":"dictionary_synonym","version":1}$json$::jsonb
);

DO $migration$
DECLARE
  worker_id uuid;
  seed_row record;
  valid_seed_count integer;
BEGIN
  SELECT profile.id INTO worker_id
  FROM auth.users auth_user
  JOIN public.profiles profile ON profile.id=auth_user.id
  JOIN public.user_roles user_role ON user_role.user_id=profile.id
  JOIN public.roles role ON role.id=user_role.role_id
  WHERE lower(auth_user.email)=lower('community-quality-worker@bilgearena.invalid')
    AND role.slug='question_quality_worker'
  LIMIT 1;

  IF worker_id IS NULL THEN
    RAISE EXCEPTION 'Migration 148 requires the provisioned question-quality worker profile and role'
      USING ERRCODE='55000';
  END IF;

  FOR seed_row IN SELECT * FROM pg_temp.community_quality_control_seed ORDER BY question_id LOOP
    PERFORM public.content_governance_authorize_question_write(seed_row.question_id,'create');
    INSERT INTO public.questions(
      id,game,category,topic,difficulty,exam_ref,is_boss,content,is_active,published_revision_id,source
    ) VALUES(
      seed_row.question_id,seed_row.game,seed_row.category,seed_row.topic,
      seed_row.difficulty,seed_row.exam_ref,false,seed_row.content,false,NULL,'quality_control'
    ) ON CONFLICT(id) DO NOTHING;
    PERFORM public.content_governance_clear_question_write(seed_row.question_id);
  END LOOP;

  INSERT INTO public.question_content_revisions(
    id,question_id,revision_no,game,category,topic,difficulty,exam_ref,is_boss,
    content,content_sha256,change_kind,change_summary,status,prepared_by
  )
  SELECT
    seed.revision_id,seed.question_id,1,seed.game,seed.category,seed.topic,
    seed.difficulty,seed.exam_ref,false,seed.content,
    encode(extensions.digest(seed.content::text,'sha256'),'hex'),
    'create','Deterministic community quality control','draft',worker_id
  FROM pg_temp.community_quality_control_seed seed
  ON CONFLICT(id) DO NOTHING;

  INSERT INTO public.question_revision_sources(
    revision_id,source_kind,source_title,license_code,attribution,provenance_ref
  )
  SELECT
    seed.revision_id,'original','Bilge Arena deterministic control','INTERNAL',
    'Private clean-control seed; excluded from lessons and exams.',
    'community-quality-control-seed-v1:' || seed.question_id::text
  FROM pg_temp.community_quality_control_seed seed
  ON CONFLICT(revision_id) DO NOTHING;

  INSERT INTO public.question_quality_controls(
    revision_id,question_id,content_sha256,expected_verdict,expected_answer_index,
    proof_kind,proof_evidence,created_by
  )
  SELECT
    seed.revision_id,seed.question_id,
    encode(extensions.digest(seed.content::text,'sha256'),'hex'),
    'clean',(seed.content->>'answer')::smallint,'deterministic',
    seed.proof || jsonb_build_object(
      'seed','community-quality-control-seed-v1',
      'questionInactive',true,
      'publishedRevisionAbsent',true
    ),worker_id
  FROM pg_temp.community_quality_control_seed seed
  ON CONFLICT(revision_id) DO NOTHING;

  SELECT count(*) INTO valid_seed_count
  FROM pg_temp.community_quality_control_seed seed
  JOIN public.questions question ON question.id=seed.question_id
  JOIN public.question_content_revisions revision ON revision.id=seed.revision_id
  JOIN public.question_quality_controls control ON control.revision_id=seed.revision_id
  WHERE question.is_active=false
    AND question.published_revision_id IS NULL
    AND question.content=seed.content
    AND revision.question_id=seed.question_id
    AND revision.status='draft'
    AND revision.content=seed.content
    AND revision.content_sha256=encode(extensions.digest(seed.content::text,'sha256'),'hex')
    AND control.question_id=seed.question_id
    AND control.active
    AND control.expected_verdict='clean'
    AND control.expected_answer_index=(seed.content->>'answer')::smallint
    AND control.proof_kind='deterministic'
    AND control.created_by=worker_id;

  IF valid_seed_count<>5 THEN
    RAISE EXCEPTION 'Migration 148 expected five isolated deterministic controls, found %',valid_seed_count
      USING ERRCODE='55000';
  END IF;
END;
$migration$;

COMMIT;
