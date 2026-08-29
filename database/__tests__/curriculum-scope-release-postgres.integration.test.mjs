// Opt-in disposable PostgreSQL coverage for 086 -> 091 -> 094 -> 096 -> 097
// -> 138 -> 178 -> historical verified Fen attempts -> 179 -> 180 -> 181
// -> historical verified YDT English attempts -> 187 -> 188. The Turkish and
// Social release migrations are applied in a later test, after the draft-scope
// assertions, so this fixture still proves the pre-release contract.
// Requires VERIFIED_ATTEMPTS_TEST_DATABASE_URL=.../bilge_r02_test_* and
// VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE=1. The dedicated PostgreSQL CI
// job runs it; the normal local/unit-test command deliberately does not.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const url = process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_URL
const enabled = Boolean(url && process.env.VERIFIED_ATTEMPTS_TEST_DATABASE_DISPOSABLE === '1')
if (url && !/^bilge_r02_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) {
  throw new Error('non-disposable database refused')
}
const describePg = enabled ? describe : describe.skip
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const migration = (name) => readFileSync(join(root, name), 'utf8')
const foundationMigrations = [
  '086_outcome_mastery_pilot.sql',
  '091_verified_attempts.sql',
  '094_persistent_fsrs.sql',
  '096_curriculum_graph_v1.sql',
  '097_mastery_evidence_v2.sql',
  '138_curriculum_outcomes_all_subjects.sql',
  '178_curriculum_scope_release_registry.sql',
].map(migration)
const registryMigration = migration('178_curriculum_scope_release_registry.sql')
const fenReleaseMigration = migration('179_release_tyt_fen_mastery_scope.sql')
const fenRepairMigration = migration('180_backfill_released_tyt_fen_mastery_evidence.sql')
const completeRepairMigration = migration('181_curriculum_scope_repair_and_parent_integrity.sql')
const ydtEnglishReleaseMigration = migration('187_release_ydt_english_mastery_scope.sql')
const ydtEnglishRepairMigration = migration('188_backfill_released_ydt_english_mastery_evidence.sql')
const turkishReleaseMigration = migration('189_release_tyt_turkce_mastery_scope.sql')
const turkishRepairMigration = migration('190_backfill_released_tyt_turkce_mastery_evidence.sql')
const socialReleaseMigration = migration('191_release_tyt_sosyal_mastery_scope.sql')
const socialRepairMigration = migration('192_backfill_released_tyt_sosyal_mastery_evidence.sql')
const outcomeScopeMigration = migration('164_question_revision_outcome_scope.sql')
const curriculumOutcomeScopeValidDefinition = outcomeScopeMigration.slice(
  outcomeScopeMigration.indexOf('CREATE OR REPLACE FUNCTION public.curriculum_outcome_scope_valid'),
  outcomeScopeMigration.indexOf('CREATE OR REPLACE FUNCTION public.question_revision_outcomes_valid'),
)
const { Client } = pg

describePg('178-192 curriculum scope release real PostgreSQL', () => {
  let client
  let releaseClient
  let completionClient
  let answerWriterClient
  let questionWriterClient
  let repairClient
  let inFlightClient
  let ydtMappingWriterClient
  let ydtRepairClient
  let historicalUser
  let historicalAttempt
  let historicalSession
  let historicalAnswers
  let raceUser
  let raceAttempt
  let raceSession
  let raceAnswer
  let answerWriterUser
  let answerWriterAttempt
  let answerWriterSession
  let answerWriterAnswer
  let drainUser
  let drainAttempt
  let drainSession
  let drainAnswer
  let supersededUser
  let supersededAttempt
  let supersededSession
  let supersededAnswer
  let secondaryNode
  let secondaryOutcome
  let replacementUser
  let replacementAttempt
  let replacementSession
  let replacementAnswer
  let replacementRevision
  let replacementOldNode
  let replacementOldOutcome
  let releaseWriterQuestion
  let ydtEnglishUser
  let ydtEnglishAttempt
  let ydtEnglishSession
  let ydtEnglishAnswers
  let ydtEnglishRevisionIds
  let preYdtEnglishRelease
  let ydtEnglishRaceUser
  let ydtEnglishRaceAttempt
  let ydtEnglishRaceSession
  let ydtEnglishRaceAnswer
  let ydtEnglishRaceRevision
  let preYdtEnglishRaceRelease
  let ydtEnglishPostReleaseUser
  let ydtEnglishPostReleaseAttempt
  let ydtEnglishPostReleaseSession
  let ydtEnglishPostReleaseAnswer
  let ydtEnglishPostReleaseRevision
  let ydtEnglishPostReleaseNode
  let ydtEnglishPostReleaseOutcome
  let preYdtEnglishPostReleaseRepair
  let turkishHistoricalAttempt
  let socialHistoricalAttempt
  let turkishCompletionAfterReleaseAttempt
  let socialCompletionAfterReleaseAttempt
  const socialPreparer = randomUUID()
  const socialReviewerOne = randomUUID()
  const socialReviewerTwo = randomUUID()
  const socialSecondReligionQuestion = randomUUID()
  const socialSecondReligionRevision = randomUUID()
  let completionWasBlocked = false
  let answerWriterWasBlocked = false
  let questionWriterWasBlocked = false
  let repairWasBlocked = false
  let ydtReleaseRaceWasBlocked = false
  let ydtRepairWasBlocked = false
  let preRepair
  let postLegacyRepair
  let preCompleteRepair
  const mathCategories = ['sayilar', 'denklemler', 'fonksiyonlar', 'problemler', 'geometri', 'olasilik']
  const fenCategories = ['fizik', 'kimya', 'biyoloji']
  const turkishCategories = ['paragraf', 'dil_bilgisi', 'yazim_kurallari', 'sozcuk', 'anlam_bilgisi']
  const socialCategories = ['tarih', 'cografya', 'felsefe', 'sosyoloji', 'din_kulturu']
  const socialRevisionIds = new Map(socialCategories.map((category) => [category, randomUUID()]))
  const ydtEnglishCategories = [
    'vocabulary', 'phrasal_verbs', 'grammar', 'sentence_completion',
    'cloze_test', 'restatement', 'dialogue',
  ]
  const questionIds = new Map([
    ...mathCategories,
    ...fenCategories,
    ...turkishCategories,
    ...socialCategories,
    ...ydtEnglishCategories,
  ]
    .map((category) => [category, randomUUID()]))

  async function seedScopeAttempt(game, categories, complete, provenance = 'valid') {
    const user = randomUUID()
    const attempt = randomUUID()
    const session = randomUUID()
    const answers = categories.map(() => randomUUID())
    const revisionIds = categories.map(() => randomUUID())
    await client.query('INSERT INTO public.profiles(id) VALUES($1)', [user])
    await client.query(
      `INSERT INTO public.game_sessions(id,user_id,client_request_id) VALUES($1,$2,$3)`,
      [session, user, randomUUID()],
    )
    await client.query(
      `INSERT INTO public.verified_attempts(
        id,user_id,game,mode,question_ids,duration_sec,expires_at
      ) VALUES($1,$2,$3,'classic',$4,180,clock_timestamp()+interval '1 hour')`,
      [attempt, user, game, categories.map((category) => questionIds.get(category))],
    )
    for (const [index, category] of categories.entries()) {
      const questionId = questionIds.get(category)
      if (provenance !== 'missing') {
        await client.query(`INSERT INTO public.verified_attempt_question_revisions(
          attempt_id,question_id,revision_id,game,category,exam_ref,difficulty
        ) VALUES($1,$2,$3,$4,$5,$6,$7)`, [
          attempt,
          questionId,
          revisionIds[index],
          provenance === 'game' ? 'fen' : game,
          provenance === 'category' ? 'drifted' : category,
          provenance === 'exam' ? 'LGS' : 'TYT',
          (index % 5) + 1,
        ])
      }
      await client.query(`INSERT INTO public.session_answers(
        id,session_id,user_id,question_id,is_correct,time_taken_sec,is_fast,question_revision_id,answered_at
      ) VALUES($1,$2,$3,$4,$5,$6,false,$7,clock_timestamp()-interval '4 hours')`, [
        answers[index], session, user, questionId, index % 2 === 0, 12 + index,
        revisionIds[index],
      ])
    }
    if (complete) {
      await client.query(`UPDATE public.verified_attempts
        SET completed_at=clock_timestamp()-interval '3 hours',session_id=$2
        WHERE id=$1`, [attempt, session])
    }
    return { user, attempt, session, answers }
  }

  async function cleanupScopeAttempt(seed) {
    await client.query('DELETE FROM public.mastery_outcome_evidence WHERE attempt_id=$1', [seed.attempt])
    await client.query('DELETE FROM public.mastery_materialized_attempts WHERE attempt_id=$1', [seed.attempt])
    await client.query('DELETE FROM public.verified_attempt_question_revisions WHERE attempt_id=$1', [seed.attempt])
    await client.query('DELETE FROM public.review_cards WHERE user_id=$1', [seed.user])
    await client.query('DELETE FROM public.review_logs WHERE session_id=$1', [seed.session])
    await client.query('DELETE FROM public.session_answers WHERE session_id=$1', [seed.session])
    await client.query('DELETE FROM public.verified_attempts WHERE id=$1', [seed.attempt])
    await client.query('DELETE FROM public.game_sessions WHERE id=$1', [seed.session])
    await client.query('DELETE FROM public.user_outcome_state WHERE user_id=$1', [seed.user])
    await client.query('DELETE FROM public.profiles WHERE id=$1', [seed.user])
  }

  async function deleteScopeAttempt(seed) {
    await client.query('DELETE FROM public.mastery_outcome_evidence WHERE attempt_id=$1', [seed.attempt])
    await client.query('DELETE FROM public.user_outcome_state WHERE user_id=$1', [seed.user])
    await client.query('DELETE FROM public.mastery_materialized_attempts WHERE attempt_id=$1', [seed.attempt])
    await client.query('DELETE FROM public.review_cards WHERE user_id=$1', [seed.user])
    await client.query('DELETE FROM public.review_logs WHERE session_id=$1', [seed.session])
    await client.query('DELETE FROM public.session_answers WHERE session_id=$1', [seed.session])
    await client.query('DELETE FROM public.verified_attempt_question_revisions WHERE attempt_id=$1', [seed.attempt])
    await client.query('DELETE FROM public.verified_attempts WHERE id=$1', [seed.attempt])
    await client.query('DELETE FROM public.game_sessions WHERE id=$1', [seed.session])
    await client.query('DELETE FROM public.profiles WHERE id=$1', [seed.user])
  }

  beforeAll(async () => {
    client = new Client({ connectionString: url })
    await client.connect()
    await client.query(`
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      CREATE SCHEMA auth;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      ALTER ROLE service_role BYPASSRLS;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY);
      CREATE TABLE public.questions (
        id uuid PRIMARY KEY,
        game varchar(20) NOT NULL,
        category varchar(30) NOT NULL,
        difficulty smallint NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
        exam_ref varchar(20),
        is_active boolean NOT NULL DEFAULT true,
        published_revision_id uuid
      );
      CREATE TABLE public.game_sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES public.profiles(id),
        client_request_id uuid,
        total_xp integer DEFAULT 0,
        correct_count smallint DEFAULT 0,
        wrong_count smallint DEFAULT 0
      );
      CREATE TABLE public.session_answers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES public.game_sessions(id),
        user_id uuid NOT NULL REFERENCES public.profiles(id),
      question_id uuid NOT NULL REFERENCES public.questions(id),
      is_correct boolean NOT NULL,
      is_skipped boolean,
      time_taken_sec numeric,
      is_fast boolean,
      question_revision_id uuid,
      answered_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
    `)
    for (const category of mathCategories) {
      await client.query(
        `INSERT INTO public.questions(id,game,category,exam_ref,is_active)
         VALUES ($1,'matematik',$2,'TYT',true)`,
        [questionIds.get(category), category],
      )
    }
    for (const category of fenCategories) {
      await client.query(
        `INSERT INTO public.questions(id,game,category,exam_ref,is_active)
         VALUES ($1,'fen',$2,'TYT',true)`,
        [questionIds.get(category), category],
      )
    }
    for (const category of turkishCategories) {
      await client.query(
        `INSERT INTO public.questions(id,game,category,exam_ref,is_active)
         VALUES ($1,'turkce',$2,'TYT',true)`,
        [questionIds.get(category), category],
      )
    }
    for (const category of socialCategories) {
      await client.query(
        `INSERT INTO public.questions(id,game,category,exam_ref,is_active)
         VALUES ($1,'sosyal',$2,'TYT',true)`,
        [questionIds.get(category), category],
      )
    }
    for (const category of ydtEnglishCategories) {
      await client.query(
        `INSERT INTO public.questions(id,game,category,exam_ref,is_active)
         VALUES ($1,'wordquest',$2,$3,true)`,
        [
          questionIds.get(category),
          category,
          category === 'dialogue' ? 'YDT' : category === 'restatement' ? '   ' : null,
        ],
      )
    }
    historicalUser = randomUUID()
    historicalAttempt = randomUUID()
    historicalSession = randomUUID()
    historicalAnswers = fenCategories.map(() => randomUUID())
    await client.query('INSERT INTO public.profiles(id) VALUES($1),($2),($3),($4)', [
      historicalUser, socialPreparer, socialReviewerOne, socialReviewerTwo,
    ])

    for (const sql of foundationMigrations) await client.query(sql)
    // Migration 187's permanent question_outcomes guard executes this exact
    // 164 helper during release sync, so the release fixture uses the real
    // function definition instead of a permissive test stub.
    await client.query(curriculumOutcomeScopeValidDefinition)

    // Migration 106 owns these tables in the full application schema. This
    // focused fixture keeps only the immutable difficulty/revision lineage and
    // mapping history consumed by migration 181.
    await client.query(`CREATE TABLE public.verified_attempt_question_revisions (
      attempt_id uuid NOT NULL REFERENCES public.verified_attempts(id) ON DELETE RESTRICT,
      question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
      revision_id uuid,
      game varchar(20),
      category varchar(30),
      exam_ref varchar(20),
      difficulty smallint NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
      PRIMARY KEY(attempt_id,question_id)
    );
    CREATE TABLE public.question_revision_outcomes (
      revision_id uuid NOT NULL,
      outcome_id uuid NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,
      weight numeric(6,3) NOT NULL CHECK (weight > 0 AND weight <= 1),
      is_primary boolean NOT NULL DEFAULT false,
      PRIMARY KEY(revision_id,outcome_id)
    );
    CREATE TABLE public.question_content_revisions (
      id uuid PRIMARY KEY,
      question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
      game text NOT NULL,
      category text,
      difficulty smallint NOT NULL,
      exam_ref text,
      content_sha256 text NOT NULL,
      change_kind text NOT NULL,
      status text NOT NULL,
      prepared_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
      outcomes_prepared_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
      published_at timestamptz
    );
    CREATE TABLE public.question_revision_sources (
      revision_id uuid PRIMARY KEY REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
      source_kind text NOT NULL,
      license_code text NOT NULL,
      provenance_ref text
    );
    CREATE TABLE public.question_revision_approvals (
      revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
      stage smallint NOT NULL,
      reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
      decision text NOT NULL,
      decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(revision_id,stage)
    )`)

    for (const [index, category] of socialCategories.entries()) {
      const revisionId = socialRevisionIds.get(category)
      await client.query(`INSERT INTO public.question_content_revisions(
        id,question_id,game,category,difficulty,exam_ref,content_sha256,
        change_kind,status,prepared_by,published_at
      ) VALUES($1,$2,'sosyal',$3,3,'TYT',$4,'create','published',$5,clock_timestamp())`, [
        revisionId,
        questionIds.get(category),
        category,
        (index + 1).toString(16).padStart(64, '0'),
        socialPreparer,
      ])
      await client.query(`INSERT INTO public.question_revision_sources(
        revision_id,source_kind,license_code,provenance_ref
      ) VALUES($1,'original','BA-INTERNAL',$2)`, [revisionId, `reviewed:sosyal:${category}`])
      await client.query(`INSERT INTO public.question_revision_approvals(
        revision_id,stage,reviewer_id,decision
      ) VALUES($1,1,$2,'approved'),($1,2,$3,'approved')`, [
        revisionId, socialReviewerOne, socialReviewerTwo,
      ])
      await client.query(
        'UPDATE public.questions SET published_revision_id=$2 WHERE id=$1',
        [questionIds.get(category), revisionId],
      )
    }

    // Seed one completed attempt per exact-scope bank while both registries are
    // still draft. Completion creates the immutable marker but no evidence;
    // 190/192 must later repair exactly these rows. The completion-after-replay
    // attempts are created later, after their mappings exist, so this fixture
    // exercises the live base/evidence path instead of only historical repair.
    turkishHistoricalAttempt = await seedScopeAttempt('turkce', turkishCategories, true)
    socialHistoricalAttempt = await seedScopeAttempt('sosyal', socialCategories, true)

    releaseWriterQuestion = randomUUID()
    await client.query(`INSERT INTO public.questions(id,game,category,exam_ref,is_active)
      VALUES($1,'fen','fizik','TYT',false)`, [releaseWriterQuestion])

    await client.query(
      `INSERT INTO public.game_sessions(id,user_id,client_request_id) VALUES($1,$2,$3)`,
      [historicalSession, historicalUser, randomUUID()],
    )
    await client.query(
      `INSERT INTO public.verified_attempts(
        id,user_id,game,mode,question_ids,duration_sec,expires_at
      ) VALUES($1,$2,'fen','classic',$3,180,clock_timestamp()+interval '1 hour')`,
      [historicalAttempt, historicalUser, fenCategories.map((category) => questionIds.get(category))],
    )
    await client.query(`INSERT INTO public.verified_attempt_question_revisions(
      attempt_id,question_id,difficulty
    ) VALUES($1,$2,4),($1,$3,5),($1,$4,2)`, [
      historicalAttempt,
      questionIds.get('fizik'),
      questionIds.get('kimya'),
      questionIds.get('biyoloji'),
    ])
    for (const [index, category] of fenCategories.entries()) {
      await client.query(
        `INSERT INTO public.session_answers(
          id,session_id,user_id,question_id,is_correct,time_taken_sec,is_fast,answered_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()-interval '3 hours')`,
        [historicalAnswers[index], historicalSession, historicalUser, questionIds.get(category), index !== 1, 10 + index, false],
      )
    }
    await client.query(
      `UPDATE public.verified_attempts
       SET completed_at=clock_timestamp()-interval '2 hours',session_id=$2
       WHERE id=$1`,
      [historicalAttempt, historicalSession],
    )
    preRepair = (await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_materialized_attempts WHERE attempt_id=$1) AS markers,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$1) AS evidence`,
    [historicalAttempt])).rows[0]

    // A governed manual mapping published after the historical answer must be
    // preserved by 179 and repaired even though 180 intentionally handled only
    // taxonomy-owned post-answer mappings.
    const manualOutcome = (await client.query(
      "SELECT id FROM public.curriculum_outcomes WHERE code='FEN-KIM-01'",
    )).rows[0].id
    await client.query(`INSERT INTO public.question_outcomes(
      question_id,outcome_id,weight,is_primary,mapping_source
    ) VALUES($1,$2,1,true,'manual')`, [questionIds.get('kimya'), manualOutcome])
    secondaryNode = randomUUID()
    secondaryOutcome = randomUUID()

    raceUser = randomUUID()
    raceAttempt = randomUUID()
    raceSession = randomUUID()
    raceAnswer = randomUUID()
    await client.query('INSERT INTO public.profiles(id) VALUES($1)', [raceUser])
    await client.query(
      `INSERT INTO public.game_sessions(id,user_id,client_request_id) VALUES($1,$2,$3)`,
      [raceSession, raceUser, randomUUID()],
    )
    await client.query(
      `INSERT INTO public.verified_attempts(
        id,user_id,game,mode,question_ids,duration_sec,expires_at
      ) VALUES($1,$2,'fen','classic',$3,180,clock_timestamp()+interval '1 hour')`,
      [raceAttempt, raceUser, [questionIds.get('fizik')]],
    )
    await client.query(
      `INSERT INTO public.session_answers(
        id,session_id,user_id,question_id,is_correct,time_taken_sec,is_fast,answered_at
      ) VALUES($1,$2,$3,$4,true,14,false,clock_timestamp())`,
      [raceAnswer, raceSession, raceUser, questionIds.get('fizik')],
    )

    answerWriterUser = randomUUID()
    answerWriterAttempt = randomUUID()
    answerWriterSession = randomUUID()
    answerWriterAnswer = randomUUID()
    await client.query('INSERT INTO public.profiles(id) VALUES($1)', [answerWriterUser])
    await client.query(
      `INSERT INTO public.game_sessions(id,user_id,client_request_id) VALUES($1,$2,$3)`,
      [answerWriterSession, answerWriterUser, randomUUID()],
    )
    await client.query(
      `INSERT INTO public.verified_attempts(
        id,user_id,game,mode,question_ids,duration_sec,expires_at
      ) VALUES($1,$2,'fen','classic',$3,180,clock_timestamp()+interval '1 hour')`,
      [answerWriterAttempt, answerWriterUser, [questionIds.get('fizik')]],
    )

    // Hold migration 179 immediately before commit. Completion and question
    // writers started in this window must wait behind the release locks, then
    // resume against the committed released scope.
    releaseClient = new Client({ connectionString: url })
    completionClient = new Client({ connectionString: url })
    answerWriterClient = new Client({ connectionString: url })
    questionWriterClient = new Client({ connectionString: url })
    await releaseClient.connect()
    await completionClient.connect()
    await answerWriterClient.connect()
    await questionWriterClient.connect()
    const releasePid = (await releaseClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const completionPid = (await completionClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const answerWriterPid = (await answerWriterClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const questionWriterPid = (await questionWriterClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const barrierKey = 181454
    await client.query('SELECT pg_advisory_lock($1)', [barrierKey])
    const gatedReleaseMigration = fenReleaseMigration.replace(
      "NOTIFY pgrst, 'reload schema';",
      `SELECT pg_advisory_lock(${barrierKey});
       SELECT pg_advisory_unlock(${barrierKey});
       NOTIFY pgrst, 'reload schema';`,
    )
    const releasePromise = releaseClient.query(gatedReleaseMigration)
    let completionPromise
    let answerWriterPromise
    let questionWriterPromise
    let setupError
    try {
      let waitingOnBarrier = false
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const activity = (await client.query(
          `SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1`,
          [releasePid],
        )).rows[0]
        if (activity?.wait_event_type === 'Lock' && /advisory/i.test(activity?.wait_event ?? '')) {
          waitingOnBarrier = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      if (!waitingOnBarrier) throw new Error('Fen release did not reach the advisory barrier')

      completionPromise = completionClient.query(
        `UPDATE public.verified_attempts
         SET completed_at=clock_timestamp(),session_id=$2
         WHERE id=$1`,
        [raceAttempt, raceSession],
      )
      answerWriterPromise = answerWriterClient.query(
        `INSERT INTO public.session_answers(
          id,session_id,user_id,question_id,is_correct,time_taken_sec,is_fast,answered_at
        ) VALUES($1,$2,$3,$4,true,12,false,clock_timestamp())`,
        [answerWriterAnswer, answerWriterSession, answerWriterUser, questionIds.get('fizik')],
      )
      questionWriterPromise = questionWriterClient.query(
        'UPDATE public.questions SET is_active=true WHERE id=$1',
        [releaseWriterQuestion],
      )

      for (let attempt = 0; attempt < 100; attempt += 1) {
        const rows = (await client.query(
          `SELECT pid,wait_event_type,wait_event FROM pg_stat_activity WHERE pid=ANY($1::integer[])`,
          [[completionPid, answerWriterPid, questionWriterPid]],
        )).rows
        completionWasBlocked = rows.some((row) => row.pid === completionPid && row.wait_event_type === 'Lock')
        answerWriterWasBlocked = rows.some((row) => row.pid === answerWriterPid && row.wait_event_type === 'Lock')
        questionWriterWasBlocked = rows.some((row) => row.pid === questionWriterPid && row.wait_event_type === 'Lock')
        if (completionWasBlocked && answerWriterWasBlocked && questionWriterWasBlocked) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      if (!completionWasBlocked || !answerWriterWasBlocked || !questionWriterWasBlocked) {
        throw new Error('Fen release did not serialize answer, completion, and question writers')
      }
    } catch (error) {
      setupError = error
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [barrierKey])
    }
    await releasePromise
    await Promise.all([completionPromise, answerWriterPromise, questionWriterPromise].filter(Boolean))
    if (setupError) throw setupError

    // Richer governed scopes may add a secondary mapping after the category-
    // proxy release has completed. Migration 181 must repair that mapping even
    // when the historical answer already has primary evidence.
    await client.query(`INSERT INTO public.curriculum_nodes(
      id,code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active
    ) SELECT $1,'ba-tyt-fen-v1:outcome:kimya-secondary','ba-tyt-fen-v1','fen','TYT',
      'outcome',topic.id,'kimya','Kimyasal ilişki kurma becerisi',20,true
      FROM public.curriculum_nodes AS topic
      WHERE topic.code='ba-tyt-fen-v1:topic:kimya'`, [secondaryNode])
    await client.query(`INSERT INTO public.curriculum_outcomes(
      id,code,game,category,title,description,exam_ref,sort_order,is_active,node_id,taxonomy_version
    ) VALUES($1,'FEN-KIM-02','fen','kimya','Kimyasal ilişki kurma becerisi',
      'Disposable secondary mapping fixture','TYT',21,true,$2,'ba-tyt-fen-v1')`, [
      secondaryOutcome, secondaryNode,
    ])
    await client.query(`INSERT INTO public.question_outcomes(
      question_id,outcome_id,weight,is_primary,mapping_source
    ) VALUES($1,$2,0.5,false,'manual')`, [questionIds.get('kimya'), secondaryOutcome])

    // A historical governed secondary S1 replaced by current S2 must not make
    // the same answer count toward both outcomes. The attempt revision proves
    // that the stale evidence was secondary rather than the historical primary.
    replacementUser = randomUUID()
    replacementAttempt = randomUUID()
    replacementSession = randomUUID()
    replacementAnswer = randomUUID()
    replacementRevision = randomUUID()
    replacementOldNode = randomUUID()
    replacementOldOutcome = randomUUID()
    await client.query(`INSERT INTO public.curriculum_nodes(
      id,code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active
    ) SELECT $1,'ba-tyt-fen-v1:outcome:kimya-secondary-old','ba-tyt-fen-v1','fen','TYT',
      'outcome',topic.id,'kimya','Eski kimya ikincil kazanımı',22,false
      FROM public.curriculum_nodes AS topic
      WHERE topic.code='ba-tyt-fen-v1:topic:kimya'`, [replacementOldNode])
    await client.query(`INSERT INTO public.curriculum_outcomes(
      id,code,game,category,title,description,exam_ref,sort_order,is_active,node_id,taxonomy_version
    ) VALUES($1,'FEN-KIM-OLD','fen','kimya','Eski kimya ikincil kazanımı',
      'Superseded secondary fixture','TYT',22,false,$2,'ba-tyt-fen-v1')`, [
      replacementOldOutcome, replacementOldNode,
    ])
    await client.query(`INSERT INTO public.question_revision_outcomes(
      revision_id,outcome_id,weight,is_primary
    ) VALUES($1,$2,1,true),($1,$3,0.4,false)`, [
      replacementRevision, manualOutcome, replacementOldOutcome,
    ])
    await client.query('INSERT INTO public.profiles(id) VALUES($1)', [replacementUser])
    await client.query(`INSERT INTO public.game_sessions(id,user_id,client_request_id)
      VALUES($1,$2,$3)`, [replacementSession, replacementUser, randomUUID()])
    await client.query(`INSERT INTO public.session_answers(
      id,session_id,user_id,question_id,is_correct,time_taken_sec,is_fast,answered_at
    ) VALUES($1,$2,$3,$4,true,13,false,clock_timestamp()-interval '1 hour')`, [
      replacementAnswer, replacementSession, replacementUser, questionIds.get('kimya'),
    ])
    await client.query(`INSERT INTO public.verified_attempts(
      id,user_id,game,mode,question_ids,duration_sec,expires_at,completed_at,session_id
    ) VALUES($1,$2,'fen','classic',$3,180,clock_timestamp()+interval '1 hour',clock_timestamp(),$4)`, [
      replacementAttempt, replacementUser, [questionIds.get('kimya')], replacementSession,
    ])
    await client.query(`INSERT INTO public.verified_attempt_question_revisions(
      attempt_id,question_id,revision_id,difficulty
    ) VALUES($1,$2,$3,5)`, [replacementAttempt, questionIds.get('kimya'), replacementRevision])
    await client.query('INSERT INTO public.mastery_materialized_attempts(attempt_id) VALUES($1)', [replacementAttempt])
    await client.query(`INSERT INTO public.mastery_outcome_evidence(
      answer_id,outcome_id,user_id,question_id,session_id,attempt_id,is_correct,
      mapping_weight,difficulty,difficulty_weighted_earned,difficulty_weighted_possible,
      time_taken_sec,fast_wrong,max_hint_stage,delayed_correct,base_already_recorded
    ) VALUES
      ($1,$2,$3,$4,$5,$6,true,1,5,5,5,13,false,0,false,false),
      ($1,$7,$3,$4,$5,$6,true,0.4,5,2,2,13,false,0,false,false)`, [
      replacementAnswer, manualOutcome, replacementUser, questionIds.get('kimya'),
      replacementSession, replacementAttempt, replacementOldOutcome,
    ])
    // The live answer writer already materialized the current primary's base
    // aggregate. Seed only the retired secondary aggregate represented by the
    // historical revision; inserting the primary again would make the fixture
    // unlike production and violate the state primary key.
    await client.query(`INSERT INTO public.user_outcome_state(
      user_id,outcome_id,attempts,correct_attempts,weighted_earned,weighted_possible,
      delayed_correct,last_answered_at,v2_attempts,difficulty_weighted_earned,
      difficulty_weighted_possible,timed_attempts,total_time_sec
    ) VALUES($1,$2,1,1,0.4,0.4,0,clock_timestamp(),1,2,2,1,13)`, [
      replacementUser, replacementOldOutcome,
    ])

    await answerWriterClient.query(
      `UPDATE public.verified_attempts
       SET completed_at=clock_timestamp(),session_id=$2
       WHERE id=$1`,
      [answerWriterAttempt, answerWriterSession],
    )

    preCompleteRepair = (await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_materialized_attempts WHERE attempt_id=$1) AS markers,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$1) AS evidence,
      (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$2) AS base_attempts`,
    [raceAttempt, raceUser])).rows[0]

    await client.query(fenRepairMigration)
    postLegacyRepair = (await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$1) AS historical_evidence,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$2) AS race_evidence,
      (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$3) AS historical_attempts,
      (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$4) AS race_attempts`,
    [historicalAttempt, raceAttempt, historicalUser, raceUser])).rows[0]

    // An existing scoped evidence row for an older primary mapping must stop a
    // governed replacement from counting the same answer a second time.
    supersededUser = randomUUID()
    supersededAttempt = randomUUID()
    supersededSession = randomUUID()
    supersededAnswer = randomUUID()
    const supersededOutcome = (await client.query(
      "SELECT id FROM public.curriculum_outcomes WHERE code='FEN-KIM-01'",
    )).rows[0].id
    await client.query('INSERT INTO public.profiles(id) VALUES($1)', [supersededUser])
    await client.query(`INSERT INTO public.game_sessions(id,user_id,client_request_id)
      VALUES($1,$2,$3)`, [supersededSession, supersededUser, randomUUID()])
    await client.query(`INSERT INTO public.session_answers(
      id,session_id,user_id,question_id,is_correct,time_taken_sec,is_fast,answered_at
    ) VALUES($1,$2,$3,$4,true,11,false,clock_timestamp()-interval '1 hour')`, [
      supersededAnswer, supersededSession, supersededUser, questionIds.get('fizik'),
    ])
    await client.query(`INSERT INTO public.verified_attempts(
      id,user_id,game,mode,question_ids,duration_sec,expires_at,completed_at,session_id
    ) VALUES($1,$2,'fen','classic',$3,180,clock_timestamp()+interval '1 hour',clock_timestamp(),$4)`, [
      supersededAttempt, supersededUser, [questionIds.get('fizik')], supersededSession,
    ])
    await client.query(`INSERT INTO public.verified_attempt_question_revisions(
      attempt_id,question_id,difficulty
    ) VALUES($1,$2,4)`, [supersededAttempt, questionIds.get('fizik')])
    await client.query('INSERT INTO public.mastery_materialized_attempts(attempt_id) VALUES($1)', [supersededAttempt])
    await client.query(`INSERT INTO public.mastery_outcome_evidence(
      answer_id,outcome_id,user_id,question_id,session_id,attempt_id,is_correct,
      mapping_weight,difficulty,difficulty_weighted_earned,difficulty_weighted_possible,
      time_taken_sec,fast_wrong,max_hint_stage,delayed_correct,base_already_recorded
    ) VALUES($1,$2,$3,$4,$5,$6,true,1,4,4,4,11,false,0,false,false)`, [
      supersededAnswer, supersededOutcome, supersededUser, questionIds.get('fizik'),
      supersededSession, supersededAttempt,
    ])
    await client.query(`INSERT INTO public.user_outcome_state(
      user_id,outcome_id,attempts,correct_attempts,weighted_earned,weighted_possible,
      delayed_correct,last_answered_at,v2_attempts,difficulty_weighted_earned,
      difficulty_weighted_possible,timed_attempts,total_time_sec
    ) VALUES($1,$2,1,1,1,1,0,clock_timestamp(),1,4,4,1,11)`, [supersededUser, supersededOutcome])

    // Keep a production-shaped completion transaction in flight while 181
    // starts. Its locks must drain the answer-first/attempt-second writer
    // without taking the reverse order and deadlocking it.
    drainUser = randomUUID()
    drainAttempt = randomUUID()
    drainSession = randomUUID()
    drainAnswer = randomUUID()
    await client.query('INSERT INTO public.profiles(id) VALUES($1)', [drainUser])
    await client.query(`INSERT INTO public.game_sessions(id,user_id,client_request_id)
      VALUES($1,$2,$3)`, [drainSession, drainUser, randomUUID()])
    await client.query(`INSERT INTO public.verified_attempts(
      id,user_id,game,mode,question_ids,duration_sec,expires_at
    ) VALUES($1,$2,'fen','classic',$3,180,clock_timestamp()+interval '1 hour')`, [
      drainAttempt, drainUser, [questionIds.get('fizik')],
    ])
    await client.query(`INSERT INTO public.verified_attempt_question_revisions(
      attempt_id,question_id,difficulty
    ) VALUES($1,$2,4)`, [drainAttempt, questionIds.get('fizik')])

    inFlightClient = new Client({ connectionString: url })
    repairClient = new Client({ connectionString: url })
    await inFlightClient.connect()
    await repairClient.connect()
    const repairPid = (await repairClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    await inFlightClient.query('BEGIN')
    // Match the production completion order: complete_game_session writes
    // answers, batch_increment_question_stats updates questions, and then
    // complete_verified_game_session updates the attempt. The repair must wait
    // on session_answers before locking either later table, otherwise the two
    // transactions deadlock in opposite lock order.
    await inFlightClient.query(`INSERT INTO public.session_answers(
      id,session_id,user_id,question_id,is_correct,time_taken_sec,is_fast,answered_at
    ) VALUES($1,$2,$3,$4,true,9,false,clock_timestamp())`, [
      drainAnswer, drainSession, drainUser, questionIds.get('fizik'),
    ])
    const repairPromise = repairClient.query(completeRepairMigration)
    let repairSetupError
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const activity = (await client.query(
          `SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1`,
          [repairPid],
        )).rows[0]
        if (activity?.wait_event_type === 'Lock') {
          repairWasBlocked = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      if (!repairWasBlocked) throw new Error('Fen repair did not drain the in-flight writer')
    } catch (error) {
      repairSetupError = error
    } finally {
      await inFlightClient.query(`UPDATE public.questions
        SET difficulty=difficulty WHERE id=$1`, [questionIds.get('fizik')])
      await inFlightClient.query(`UPDATE public.verified_attempts
        SET completed_at=clock_timestamp(),session_id=$2 WHERE id=$1`, [drainAttempt, drainSession])
      await inFlightClient.query('COMMIT')
    }
    await repairPromise
    if (repairSetupError) throw repairSetupError

    // Build a production-shaped historical YDT English attempt while its
    // registry scope is still draft. Completion creates the immutable marker,
    // but correctly has no outcome mapping/evidence to materialize yet.
    ydtEnglishUser = randomUUID()
    ydtEnglishAttempt = randomUUID()
    ydtEnglishSession = randomUUID()
    ydtEnglishAnswers = ydtEnglishCategories.map(() => randomUUID())
    ydtEnglishRevisionIds = ydtEnglishCategories.map(() => randomUUID())
    await client.query('INSERT INTO public.profiles(id) VALUES($1)', [ydtEnglishUser])
    await client.query(`INSERT INTO public.game_sessions(id,user_id,client_request_id)
      VALUES($1,$2,$3)`, [ydtEnglishSession, ydtEnglishUser, randomUUID()])
    await client.query(`INSERT INTO public.verified_attempts(
      id,user_id,game,mode,question_ids,duration_sec,expires_at
    ) VALUES($1,$2,'wordquest','classic',$3,180,clock_timestamp()+interval '1 hour')`, [
      ydtEnglishAttempt,
      ydtEnglishUser,
      ydtEnglishCategories.map((category) => questionIds.get(category)),
    ])
    for (const [index, category] of ydtEnglishCategories.entries()) {
      await client.query(`INSERT INTO public.verified_attempt_question_revisions(
        attempt_id,question_id,revision_id,game,category,exam_ref,difficulty
      ) VALUES($1,$2,$3,'wordquest',$4,$5,$6)`, [
        ydtEnglishAttempt,
        questionIds.get(category),
        ydtEnglishRevisionIds[index],
        category,
        category === 'dialogue' ? 'YDT' : null,
        (index % 5) + 1,
      ])
      await client.query(`INSERT INTO public.session_answers(
        id,session_id,user_id,question_id,is_correct,time_taken_sec,is_fast,question_revision_id,answered_at
      ) VALUES($1,$2,$3,$4,$5,$6,false,$7,clock_timestamp()-interval '4 hours')`, [
        ydtEnglishAnswers[index], ydtEnglishSession, ydtEnglishUser,
        questionIds.get(category), index % 2 === 0, 12 + index, ydtEnglishRevisionIds[index],
      ])
    }
    await client.query(`UPDATE public.verified_attempts
      SET completed_at=clock_timestamp()-interval '3 hours',session_id=$2
      WHERE id=$1`, [ydtEnglishAttempt, ydtEnglishSession])
    preYdtEnglishRelease = (await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_materialized_attempts WHERE attempt_id=$1) AS markers,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$1) AS evidence,
      (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$2) AS attempts`,
    [ydtEnglishAttempt, ydtEnglishUser])).rows[0]

    // A reviewed manual mapping can be added after an old attempt already has
    // its immutable marker. Migration 187 preserves that ownership, so 188
    // must repair it even though it is not taxonomy_auto.
    const ydtEnglishManualOutcome = (await client.query(
      "SELECT id FROM public.curriculum_outcomes WHERE code='ENG-VOC-01'",
    )).rows[0].id
    await client.query(`INSERT INTO public.question_outcomes(
      question_id,outcome_id,weight,is_primary,mapping_source
    ) VALUES($1,$2,1,true,'manual')`, [
      questionIds.get('vocabulary'), ydtEnglishManualOutcome,
    ])

    // Start migration 187's transaction before this answer is committed, but
    // pause it before table locks/mapping creation. question_outcomes.created_at
    // uses transaction-start NOW(), so the resulting mapping timestamp is at
    // or before the answer even though the mapping itself is created later.
    ydtEnglishRaceUser = randomUUID()
    ydtEnglishRaceAttempt = randomUUID()
    ydtEnglishRaceSession = randomUUID()
    ydtEnglishRaceAnswer = randomUUID()
    ydtEnglishRaceRevision = randomUUID()
    await client.query('INSERT INTO public.profiles(id) VALUES($1)', [ydtEnglishRaceUser])
    await client.query(`INSERT INTO public.game_sessions(id,user_id,client_request_id)
      VALUES($1,$2,$3)`, [ydtEnglishRaceSession, ydtEnglishRaceUser, randomUUID()])
    await client.query(`INSERT INTO public.verified_attempts(
      id,user_id,game,mode,question_ids,duration_sec,expires_at
    ) VALUES($1,$2,'wordquest','classic',$3,180,clock_timestamp()+interval '1 hour')`, [
      ydtEnglishRaceAttempt, ydtEnglishRaceUser, [questionIds.get('grammar')],
    ])
    await client.query(`INSERT INTO public.verified_attempt_question_revisions(
      attempt_id,question_id,revision_id,game,category,exam_ref,difficulty
    ) VALUES($1,$2,$3,'wordquest','grammar',NULL,4)`, [
      ydtEnglishRaceAttempt, questionIds.get('grammar'), ydtEnglishRaceRevision,
    ])

    // This fixture intentionally omits the large 106/166 content-governance
    // schema and loads only 164's real scope validator above. Migration 187's
    // remaining governance function bodies are compiled and exercised by
    // question-content-governance-postgres.integration.test.mjs; keep this
    // fixture focused on release locks, mapping, and evidence repair.
    await Promise.all([
      client.query('SET check_function_bodies=off'),
      releaseClient.query('SET check_function_bodies=off'),
    ])
    const ydtBarrierKey = 185186
    await client.query('SELECT pg_advisory_lock($1)', [ydtBarrierKey])
    const gatedYdtReleaseMigration = ydtEnglishReleaseMigration.replace(
      'BEGIN;',
      `BEGIN;
       SELECT pg_advisory_lock(${ydtBarrierKey});
       SELECT pg_advisory_unlock(${ydtBarrierKey});`,
    )
    const ydtReleasePromise = releaseClient.query(gatedYdtReleaseMigration)
    let ydtRaceSetupError
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const activity = (await client.query(
          `SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1`,
          [releasePid],
        )).rows[0]
        if (activity?.wait_event_type === 'Lock' && /advisory/i.test(activity?.wait_event ?? '')) {
          ydtReleaseRaceWasBlocked = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      if (!ydtReleaseRaceWasBlocked) throw new Error('YDT release did not reach the pre-lock barrier')

      await completionClient.query('BEGIN')
      try {
        await completionClient.query(`INSERT INTO public.session_answers(
          id,session_id,user_id,question_id,is_correct,time_taken_sec,is_fast,question_revision_id,answered_at
        ) VALUES($1,$2,$3,$4,true,9,false,$5,clock_timestamp())`, [
          ydtEnglishRaceAnswer, ydtEnglishRaceSession, ydtEnglishRaceUser,
          questionIds.get('grammar'), ydtEnglishRaceRevision,
        ])
        await completionClient.query(`UPDATE public.verified_attempts
          SET completed_at=clock_timestamp(),session_id=$2 WHERE id=$1`, [
          ydtEnglishRaceAttempt, ydtEnglishRaceSession,
        ])
        await completionClient.query('COMMIT')
      } catch (error) {
        await completionClient.query('ROLLBACK').catch(() => undefined)
        throw error
      }
      preYdtEnglishRaceRelease = (await client.query(`SELECT
        (SELECT count(*)::integer FROM public.mastery_materialized_attempts WHERE attempt_id=$1) AS markers,
        (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$1) AS evidence,
        (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$2) AS attempts`,
      [ydtEnglishRaceAttempt, ydtEnglishRaceUser])).rows[0]
    } catch (error) {
      ydtRaceSetupError = error
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ydtBarrierKey])
    }
    await ydtReleasePromise
    if (ydtRaceSetupError) throw ydtRaceSetupError

    // A completion after 187 sees the taxonomy-owned primary mapping and writes
    // its immutable marker plus primary evidence. A governed secondary mapping
    // added before 188 must still be repaired even though the answer is newer
    // than the release timestamp and the marker prevents rematerialization.
    ydtEnglishPostReleaseUser = randomUUID()
    ydtEnglishPostReleaseAttempt = randomUUID()
    ydtEnglishPostReleaseSession = randomUUID()
    ydtEnglishPostReleaseAnswer = randomUUID()
    ydtEnglishPostReleaseRevision = randomUUID()
    ydtEnglishPostReleaseNode = randomUUID()
    ydtEnglishPostReleaseOutcome = randomUUID()
    await client.query('INSERT INTO public.profiles(id) VALUES($1)', [ydtEnglishPostReleaseUser])
    await client.query(`INSERT INTO public.game_sessions(id,user_id,client_request_id)
      VALUES($1,$2,$3)`, [ydtEnglishPostReleaseSession, ydtEnglishPostReleaseUser, randomUUID()])
    await client.query(`INSERT INTO public.verified_attempts(
      id,user_id,game,mode,question_ids,duration_sec,expires_at
    ) VALUES($1,$2,'wordquest','classic',$3,180,clock_timestamp()+interval '1 hour')`, [
      ydtEnglishPostReleaseAttempt, ydtEnglishPostReleaseUser, [questionIds.get('grammar')],
    ])
    await client.query(`INSERT INTO public.verified_attempt_question_revisions(
      attempt_id,question_id,revision_id,game,category,exam_ref,difficulty
    ) VALUES($1,$2,$3,'wordquest','grammar',NULL,4)`, [
      ydtEnglishPostReleaseAttempt, questionIds.get('grammar'), ydtEnglishPostReleaseRevision,
    ])
    await client.query(`INSERT INTO public.session_answers(
      id,session_id,user_id,question_id,is_correct,time_taken_sec,is_fast,question_revision_id,answered_at
    ) VALUES($1,$2,$3,$4,true,8,false,$5,clock_timestamp())`, [
      ydtEnglishPostReleaseAnswer, ydtEnglishPostReleaseSession,
      ydtEnglishPostReleaseUser, questionIds.get('grammar'), ydtEnglishPostReleaseRevision,
    ])
    await client.query(`UPDATE public.verified_attempts
      SET completed_at=clock_timestamp(),session_id=$2 WHERE id=$1`, [
      ydtEnglishPostReleaseAttempt, ydtEnglishPostReleaseSession,
    ])

    await client.query(`INSERT INTO public.curriculum_nodes(
      id,code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title,sort_order,is_active
    ) SELECT $1,'ba-ydt-eng-v1:outcome:grammar-secondary','ba-ydt-eng-v1','wordquest','YDT',
      'outcome',topic.id,'grammar','Dilbilgisi aktarım becerisi',20,true
      FROM public.curriculum_nodes AS topic
      WHERE topic.code='ba-ydt-eng-v1:topic:grammar'`, [ydtEnglishPostReleaseNode])
    await client.query(`INSERT INTO public.curriculum_outcomes(
      id,code,game,category,title,description,exam_ref,sort_order,is_active,node_id,taxonomy_version
    ) VALUES($1,'ENG-GRM-02','wordquest','grammar','Dilbilgisi aktarım becerisi',
      'Post-release secondary mapping fixture','YDT',21,true,$2,'ba-ydt-eng-v1')`, [
      ydtEnglishPostReleaseOutcome, ydtEnglishPostReleaseNode,
    ])
    preYdtEnglishPostReleaseRepair = (await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_materialized_attempts WHERE attempt_id=$1) AS markers,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$1) AS evidence,
      (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$2) AS attempts,
      answer.answered_at > release.released_at AS answer_after_release
      FROM public.session_answers AS answer
      JOIN public.curriculum_scope_releases AS release
        ON release.game='wordquest' AND release.display_exam_ref='YDT'
      WHERE answer.id=$3`, [
      ydtEnglishPostReleaseAttempt, ydtEnglishPostReleaseUser, ydtEnglishPostReleaseAnswer,
    ])).rows[0]

    // Hold the new mapping uncommitted before 188 starts. The repair must wait
    // for that production-shaped writer, then include the committed mapping in
    // its stable snapshot instead of racing past it.
    ydtMappingWriterClient = new Client({ connectionString: url })
    ydtRepairClient = new Client({ connectionString: url })
    await ydtMappingWriterClient.connect()
    await ydtRepairClient.connect()
    await ydtMappingWriterClient.query('BEGIN')
    await ydtMappingWriterClient.query(`INSERT INTO public.question_outcomes(
      question_id,outcome_id,weight,is_primary,mapping_source
    ) VALUES($1,$2,0.5,false,'manual')`, [
      questionIds.get('grammar'), ydtEnglishPostReleaseOutcome,
    ])
    const ydtRepairPid = (await ydtRepairClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    const ydtRepairPromise = ydtRepairClient.query(ydtEnglishRepairMigration)
    let ydtRepairSetupError
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const activity = (await client.query(
          `SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1`,
          [ydtRepairPid],
        )).rows[0]
        if (activity?.wait_event_type === 'Lock') {
          ydtRepairWasBlocked = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      if (!ydtRepairWasBlocked) throw new Error('YDT repair did not drain the in-flight mapping writer')
    } catch (error) {
      ydtRepairSetupError = error
    } finally {
      await ydtMappingWriterClient.query('COMMIT')
    }
    await ydtRepairPromise
    if (ydtRepairSetupError) throw ydtRepairSetupError
  })

  afterAll(async () => {
    await Promise.allSettled([
      client?.end(), releaseClient?.end(), completionClient?.end(), answerWriterClient?.end(),
      questionWriterClient?.end(),
      repairClient?.end(), inFlightClient?.end(), ydtMappingWriterClient?.end(), ydtRepairClient?.end(),
    ])
  })

  async function asRole(role, work) {
    await client.query(`SET ROLE ${role}`)
    try {
      return await work()
    } finally {
      await client.query('RESET ROLE')
    }
  }

  it('releases only proven scopes and keeps incomplete scopes in draft', async () => {
    const rows = (await client.query(`SELECT game,display_exam_ref,question_exam_ref,taxonomy_version,
      release_status,diagnostic_enabled,(released_at IS NOT NULL) AS has_released_at
      FROM public.curriculum_scope_releases ORDER BY game,display_exam_ref`)).rows
    expect(rows).toEqual([
      { game: 'fen', display_exam_ref: 'TYT', question_exam_ref: 'TYT', taxonomy_version: 'ba-tyt-fen-v1', release_status: 'released', diagnostic_enabled: false, has_released_at: true },
      { game: 'matematik', display_exam_ref: 'TYT', question_exam_ref: 'TYT', taxonomy_version: 'ba-tyt-math-v1', release_status: 'released', diagnostic_enabled: true, has_released_at: true },
      { game: 'sosyal', display_exam_ref: 'TYT', question_exam_ref: 'TYT', taxonomy_version: 'ba-tyt-sosyal-v1', release_status: 'draft', diagnostic_enabled: false, has_released_at: false },
      { game: 'turkce', display_exam_ref: 'TYT', question_exam_ref: 'TYT', taxonomy_version: 'ba-tyt-turkce-v1', release_status: 'draft', diagnostic_enabled: false, has_released_at: false },
      { game: 'wordquest', display_exam_ref: 'YDT', question_exam_ref: null, taxonomy_version: 'ba-ydt-eng-v1', release_status: 'released', diagnostic_enabled: false, has_released_at: true },
    ])
  })

  it('keeps the institution integrity wrapper on the released Mathematics taxonomy', async () => {
    await client.query('BEGIN')
    try {
      await client.query('ALTER TABLE public.curriculum_nodes DISABLE TRIGGER trg_curriculum_node_parent_guard')
      await client.query('ALTER TABLE public.curriculum_outcomes DISABLE TRIGGER trg_curriculum_outcome_node_guard')
      await client.query(`UPDATE public.curriculum_scope_releases
        SET taxonomy_version='ba-tyt-math-v2'
        WHERE game='matematik' AND display_exam_ref='TYT'`)
      await client.query(`UPDATE public.curriculum_nodes
        SET taxonomy_version='ba-tyt-math-v2'
        WHERE taxonomy_version='ba-tyt-math-v1'`)
      await client.query(`UPDATE public.curriculum_outcomes
        SET taxonomy_version='ba-tyt-math-v2'
        WHERE taxonomy_version='ba-tyt-math-v1'`)

      expect((await client.query(
        'SELECT public.curriculum_graph_integrity() AS result',
      )).rows[0].result).toEqual({
        total: 6,
        mapped: 6,
        unmapped: 0,
        scopeMismatch: 0,
        nodeOrphan: 0,
        outcomeOrphan: 0,
      })
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('maps the full Fen bank and passes the generic release invariant', async () => {
    const result = (await client.query(
      `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
    )).rows[0].result
    expect(result).toEqual({
      total: 4,
      mapped: 4,
      unmapped: 0,
      scopeMismatch: 0,
      nodeOrphan: 0,
      outcomeOrphan: 0,
      primaryMismatch: 0,
      emptyOutcome: 0,
    })
    const mappings = (await client.query(`SELECT question.category,outcome.code,mapping.mapping_source,mapping.is_primary
      FROM public.questions AS question
      JOIN public.question_outcomes AS mapping ON mapping.question_id=question.id
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=mapping.outcome_id
      WHERE question.game='fen' ORDER BY question.category`)).rows
    expect(mappings).toEqual([
      { category: 'biyoloji', code: 'FEN-BIY-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { category: 'fizik', code: 'FEN-FIZ-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { category: 'fizik', code: 'FEN-FIZ-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { category: 'kimya', code: 'FEN-KIM-01', mapping_source: 'manual', is_primary: true },
      { category: 'kimya', code: 'FEN-KIM-02', mapping_source: 'manual', is_primary: false },
    ])
    expect(completionWasBlocked).toBe(true)
    expect(answerWriterWasBlocked).toBe(true)
    expect(questionWriterWasBlocked).toBe(true)
  })

  it('rejects cross-category outcome parents and detects legacy drift fail-closed', async () => {
    const outcomeNode = (await client.query(`SELECT id,parent_id
      FROM public.curriculum_nodes
      WHERE taxonomy_version='ba-tyt-fen-v1' AND node_type='outcome' AND category='fizik'`)).rows[0]
    const wrongTopic = (await client.query(`SELECT id
      FROM public.curriculum_nodes
      WHERE taxonomy_version='ba-tyt-fen-v1' AND node_type='topic' AND category='kimya'`)).rows[0]

    await expect(client.query(
      'UPDATE public.curriculum_nodes SET parent_id=$2 WHERE id=$1',
      [outcomeNode.id, wrongTopic.id],
    )).rejects.toMatchObject({ code: '22023' })

    await client.query('ALTER TABLE public.curriculum_nodes DISABLE TRIGGER trg_curriculum_node_parent_guard')
    try {
      await client.query(
        'UPDATE public.curriculum_nodes SET parent_id=$2 WHERE id=$1',
        [outcomeNode.id, wrongTopic.id],
      )
      expect((await client.query(
        `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
      )).rows[0].result).toMatchObject({ nodeOrphan: 1 })
    } finally {
      await client.query(
        'UPDATE public.curriculum_nodes SET parent_id=$2 WHERE id=$1',
        [outcomeNode.id, outcomeNode.parent_id],
      )
      await client.query('ALTER TABLE public.curriculum_nodes ENABLE TRIGGER trg_curriculum_node_parent_guard')
    }
    expect((await client.query(
      `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
    )).rows[0].result).toMatchObject({ nodeOrphan: 0 })

    await client.query('ALTER TABLE public.curriculum_nodes DISABLE TRIGGER trg_curriculum_node_parent_guard')
    await client.query('ALTER TABLE public.curriculum_outcomes DISABLE TRIGGER trg_curriculum_outcome_node_guard')
    try {
      await client.query(`UPDATE public.curriculum_nodes SET exam_ref='tyt'
        WHERE taxonomy_version='ba-tyt-fen-v1'`)
      await client.query(`UPDATE public.curriculum_outcomes SET exam_ref='tyt'
        WHERE taxonomy_version='ba-tyt-fen-v1'`)
      expect((await client.query(
        `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
      )).rows[0].result).toMatchObject({ nodeOrphan: 1 })
    } finally {
      await client.query(`UPDATE public.curriculum_nodes SET exam_ref='TYT'
        WHERE taxonomy_version='ba-tyt-fen-v1'`)
      await client.query(`UPDATE public.curriculum_outcomes SET exam_ref='TYT'
        WHERE taxonomy_version='ba-tyt-fen-v1'`)
      await client.query('ALTER TABLE public.curriculum_outcomes ENABLE TRIGGER trg_curriculum_outcome_node_guard')
      await client.query('ALTER TABLE public.curriculum_nodes ENABLE TRIGGER trg_curriculum_node_parent_guard')
    }
    expect((await client.query(
      `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
    )).rows[0].result).toMatchObject({ nodeOrphan: 0 })

    const extraCourse = randomUUID()
    await client.query(`INSERT INTO public.curriculum_nodes(
      id,code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title
    ) VALUES($1,$2,'ba-tyt-fen-v1','fen','TYT','course',NULL,NULL,'Duplicate course root')`, [
      extraCourse, `FEN-EXTRA-ROOT-${randomUUID().slice(0, 8)}`,
    ])
    try {
      expect((await client.query(
        `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
      )).rows[0].result).toMatchObject({ nodeOrphan: 1 })
    } finally {
      await client.query('DELETE FROM public.curriculum_nodes WHERE id=$1', [extraCourse])
    }
    expect((await client.query(
      `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
    )).rows[0].result).toMatchObject({ nodeOrphan: 0 })
  })

  it('requires exactly one active outcome binding for every active outcome leaf', async () => {
    const topic = (await client.query(`SELECT id,category
      FROM public.curriculum_nodes
      WHERE taxonomy_version='ba-tyt-fen-v1'
        AND node_type='topic'
        AND category='fizik'
      LIMIT 1`)).rows[0]

    await client.query('BEGIN')
    try {
      await client.query(`INSERT INTO public.curriculum_nodes(
        id,code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title
      ) VALUES($1,$2,'ba-tyt-fen-v1','fen','TYT','outcome',$3,$4,'Unbound outcome leaf')`, [
        randomUUID(), `FEN-UNBOUND-${randomUUID().slice(0, 8)}`, topic.id, topic.category,
      ])
      expect((await client.query(
        `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
      )).rows[0].result).toMatchObject({
        mapped: 4,
        unmapped: 0,
        scopeMismatch: 0,
        nodeOrphan: 0,
        outcomeOrphan: 1,
        primaryMismatch: 0,
        emptyOutcome: 0,
      })
    } finally {
      await client.query('ROLLBACK')
    }

    const bound = (await client.query(`SELECT
        outcome.id AS outcome_id,
        mapping.question_id
      FROM public.curriculum_outcomes AS outcome
      JOIN public.question_outcomes AS mapping ON mapping.outcome_id=outcome.id
      WHERE outcome.taxonomy_version='ba-tyt-fen-v1'
        AND outcome.category='fizik'
        AND mapping.is_primary
      LIMIT 1`)).rows[0]
    const duplicateOutcome = randomUUID()

    await client.query('BEGIN')
    try {
      await client.query(`INSERT INTO public.curriculum_outcomes(
        id,code,game,category,title,description,exam_ref,sort_order,is_active,node_id,taxonomy_version
      ) SELECT $1,$2,game,category,title || ' duplicate',description,exam_ref,
          sort_order + 100,true,node_id,taxonomy_version
        FROM public.curriculum_outcomes WHERE id=$3`, [
        duplicateOutcome, `FEN-DUP-${randomUUID().slice(0, 8)}`, bound.outcome_id,
      ])
      await client.query(`INSERT INTO public.question_outcomes(
        question_id,outcome_id,weight,is_primary,mapping_source
      ) VALUES($1,$2,0.5,false,'manual')`, [bound.question_id, duplicateOutcome])

      expect((await client.query(
        `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
      )).rows[0].result).toMatchObject({
        mapped: 4,
        unmapped: 0,
        scopeMismatch: 0,
        nodeOrphan: 0,
        outcomeOrphan: 1,
        primaryMismatch: 0,
        emptyOutcome: 0,
      })
    } finally {
      await client.query('ROLLBACK')
    }

    expect((await client.query(
      `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
    )).rows[0].result).toMatchObject({ outcomeOrphan: 0 })
  })

  it('serializes a concurrent outcome-child insert with its parent category update', async () => {
    const parentClient = new Client({ connectionString: url })
    const childClient = new Client({ connectionString: url })
    await parentClient.connect()
    await childClient.connect()
    const course = randomUUID()
    const unit = randomUUID()
    const topic = randomUUID()
    const child = randomUUID()
    const suffix = randomUUID().slice(0, 8)
    try {
      await client.query(`INSERT INTO public.curriculum_nodes(
        id,code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title
      ) VALUES
        ($1,$4,'ba-parent-race-v1','fen','TYT','course',NULL,NULL,'Course'),
        ($2,$5,'ba-parent-race-v1','fen','TYT','unit',$1,NULL,'Unit'),
        ($3,$6,'ba-parent-race-v1','fen','TYT','topic',$2,'fizik','Topic')`, [
        course, unit, topic, `RACE-C-${suffix}`, `RACE-U-${suffix}`, `RACE-T-${suffix}`,
      ])
      await parentClient.query('BEGIN')
      await parentClient.query(
        "UPDATE public.curriculum_nodes SET category='kimya' WHERE id=$1",
        [topic],
      )
      const childPid = (await childClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      const childPromise = childClient.query(`INSERT INTO public.curriculum_nodes(
        id,code,taxonomy_version,game,exam_ref,node_type,parent_id,category,title
      ) VALUES($1,$2,'ba-parent-race-v1','fen','TYT','outcome',$3,'fizik','Outcome')`, [
        child, `RACE-O-${suffix}`, topic,
      ]).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
      )
      let blocked = false
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const activity = (await client.query(
          'SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',
          [childPid],
        )).rows[0]
        if (activity?.wait_event_type === 'Lock') {
          blocked = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      expect(blocked).toBe(true)
      await parentClient.query('COMMIT')
      const childResult = await childPromise
      expect(childResult.ok).toBe(false)
      expect(childResult.error).toMatchObject({ code: '22023' })
      expect((await client.query(
        'SELECT count(*)::integer AS count FROM public.curriculum_nodes WHERE id=$1',
        [child],
      )).rows[0]).toEqual({ count: 0 })
    } finally {
      await parentClient.query('ROLLBACK').catch(() => undefined)
      await Promise.allSettled([parentClient.end(), childClient.end()])
    }
  })

  it('repairs legacy, manual, and release-race Fen evidence exactly once', async () => {
    expect(preRepair).toEqual({ markers: 1, evidence: 0 })
    expect(preCompleteRepair).toEqual({ markers: 1, evidence: 1, base_attempts: 1 })
    expect(postLegacyRepair).toEqual({
      historical_evidence: 2,
      race_evidence: 1,
      historical_attempts: 2,
      race_attempts: 1,
    })
    expect(repairWasBlocked).toBe(true)
    const evidence = (await client.query(`SELECT evidence.base_already_recorded,evidence.is_correct,evidence.difficulty,
      outcome.category,outcome.code
      FROM public.mastery_outcome_evidence AS evidence
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=evidence.outcome_id
      WHERE evidence.attempt_id=$1 ORDER BY outcome.category,outcome.code`, [historicalAttempt])).rows
    expect(evidence).toEqual([
      { base_already_recorded: false, is_correct: true, difficulty: 2, category: 'biyoloji', code: 'FEN-BIY-01' },
      { base_already_recorded: false, is_correct: true, difficulty: 4, category: 'fizik', code: 'FEN-FIZ-01' },
      { base_already_recorded: false, is_correct: false, difficulty: 5, category: 'kimya', code: 'FEN-KIM-01' },
      { base_already_recorded: false, is_correct: false, difficulty: 5, category: 'kimya', code: 'FEN-KIM-02' },
    ])
    expect((await client.query(`SELECT evidence.base_already_recorded,evidence.is_correct,
      outcome.category
      FROM public.mastery_outcome_evidence AS evidence
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=evidence.outcome_id
      WHERE evidence.attempt_id=$1`, [raceAttempt])).rows).toEqual([
      { base_already_recorded: false, is_correct: true, category: 'fizik' },
    ])
    expect((await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$1) AS evidence,
      (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$2) AS attempts,
      (SELECT COALESCE(sum(v2_attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$2) AS v2_attempts`,
    [answerWriterAttempt, answerWriterUser])).rows[0]).toEqual({ evidence: 1, attempts: 1, v2_attempts: 1 })
    expect((await client.query(`SELECT difficulty,difficulty_weighted_possible
      FROM public.mastery_outcome_evidence WHERE attempt_id=$1`, [drainAttempt])).rows).toEqual([
      { difficulty: 4, difficulty_weighted_possible: '4.000' },
    ])
    expect((await client.query(`SELECT count(*)::integer AS evidence
      FROM public.mastery_outcome_evidence WHERE attempt_id=$1`, [supersededAttempt])).rows[0]).toEqual({ evidence: 1 })
    expect((await client.query(`SELECT
      count(*)::integer AS evidence,
      count(*) FILTER (WHERE outcome_id=$2)::integer AS replacement_evidence
      FROM public.mastery_outcome_evidence WHERE attempt_id=$1`, [
      replacementAttempt, secondaryOutcome,
    ])).rows[0]).toEqual({ evidence: 2, replacement_evidence: 0 })
    const aggregate = (await client.query(`SELECT
      sum(attempts)::integer AS attempts,
      sum(v2_attempts)::integer AS v2_attempts,
      sum(correct_attempts)::integer AS correct_attempts
      FROM public.user_outcome_state WHERE user_id=$1`, [historicalUser])).rows[0]
    expect(aggregate).toEqual({ attempts: 4, v2_attempts: 4, correct_attempts: 2 })
    expect((await client.query(`SELECT
      sum(attempts)::integer AS attempts,
      sum(v2_attempts)::integer AS v2_attempts,
      sum(correct_attempts)::integer AS correct_attempts
      FROM public.user_outcome_state WHERE user_id=$1`, [raceUser])).rows[0]).toEqual({
      attempts: 1, v2_attempts: 1, correct_attempts: 1,
    })
    expect((await client.query(`SELECT candidate_attempts,candidate_answers,
      candidate_evidence_rows,inserted_evidence_rows,affected_users
      FROM public.curriculum_scope_evidence_repairs
      WHERE game='fen' AND display_exam_ref='TYT' AND taxonomy_version='ba-tyt-fen-v1'`)).rows[0]).toEqual({
      candidate_attempts: 1,
      candidate_answers: 2,
      candidate_evidence_rows: 2,
      inserted_evidence_rows: 2,
      affected_users: 1,
    })
    expect((await client.query(`SELECT candidate_attempts,candidate_answers,
      candidate_evidence_rows,inserted_evidence_rows,affected_users,
      manual_mapping_rows,mapping_at_or_before_answer_rows,mapping_after_answer_rows
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key='181_tyt_fen_complete_mappings_v1'
      ORDER BY repaired_at,run_id LIMIT 1`)).rows[0]).toEqual({
      candidate_attempts: 1,
      candidate_answers: 1,
      candidate_evidence_rows: 2,
      inserted_evidence_rows: 2,
      affected_users: 1,
      manual_mapping_rows: 2,
      mapping_at_or_before_answer_rows: 0,
      mapping_after_answer_rows: 2,
    })

    await client.query(fenRepairMigration)
    await client.query(completeRepairMigration)
    expect((await client.query(`SELECT count(*)::integer AS runs
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key='181_tyt_fen_complete_mappings_v1'`)).rows[0]).toEqual({ runs: 2 })
    expect((await client.query(`SELECT candidate_evidence_rows,inserted_evidence_rows
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key='181_tyt_fen_complete_mappings_v1'
      ORDER BY repaired_at DESC,run_id DESC LIMIT 1`)).rows[0]).toEqual({
      candidate_evidence_rows: 0,
      inserted_evidence_rows: 0,
    })
    expect((await client.query(`SELECT
      count(*)::integer AS evidence,
      (SELECT sum(attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS attempts,
      (SELECT sum(v2_attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS v2_attempts
      FROM public.mastery_outcome_evidence WHERE attempt_id=$2`, [historicalUser, historicalAttempt])).rows[0]).toEqual({
      evidence: 4,
      attempts: 4,
      v2_attempts: 4,
    })
    expect((await client.query(`SELECT
      count(*)::integer AS evidence,
      (SELECT sum(attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS attempts,
      (SELECT sum(v2_attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS v2_attempts
      FROM public.mastery_outcome_evidence WHERE attempt_id=$2`, [raceUser, raceAttempt])).rows[0]).toEqual({
      evidence: 1,
      attempts: 1,
      v2_attempts: 1,
    })

    // The fixture's richer secondary mapping has now proven the repair path.
    // Retire it before later tests replay the category-proxy release, whose
    // contract deliberately requires one active outcome per category.
    await client.query(`DELETE FROM public.question_outcomes
      WHERE question_id=$1 AND outcome_id=$2`, [questionIds.get('kimya'), secondaryOutcome])
    await client.query('UPDATE public.curriculum_outcomes SET is_active=false WHERE id=$1', [secondaryOutcome])
    await client.query('UPDATE public.curriculum_nodes SET is_active=false WHERE id=$1', [secondaryNode])
  })

  it('resolves released scopes, but never exposes draft scopes', async () => {
    const fen = (await client.query(
      `SELECT public.resolve_released_curriculum_scope('fen','tyt') AS scope`,
    )).rows[0].scope
    expect(fen).toEqual({
      game: 'fen',
      displayExamRef: 'TYT',
      questionExamRef: 'TYT',
      taxonomyVersion: 'ba-tyt-fen-v1',
      mappingMode: 'category_proxy',
      diagnosticEnabled: false,
    })
    expect((await client.query(
      `SELECT public.resolve_released_curriculum_scope('turkce','TYT') AS scope`,
    )).rows[0].scope).toBeNull()
  })

  it('releases, repairs, and safely replays the YDT English scope', async () => {
    expect(preYdtEnglishRelease).toEqual({ markers: 1, evidence: 0, attempts: 0 })
    expect(preYdtEnglishRaceRelease).toEqual({ markers: 1, evidence: 0, attempts: 0 })
    expect(preYdtEnglishPostReleaseRepair).toEqual({
      markers: 1, evidence: 1, attempts: 1, answer_after_release: true,
    })
    expect(ydtReleaseRaceWasBlocked).toBe(true)
    expect(ydtRepairWasBlocked).toBe(true)

    const scope = (await client.query(
      `SELECT public.resolve_released_curriculum_scope('wordquest','ydt') AS scope`,
    )).rows[0].scope
    expect(scope).toEqual({
      game: 'wordquest',
      displayExamRef: 'YDT',
      questionExamRef: null,
      taxonomyVersion: 'ba-ydt-eng-v1',
      mappingMode: 'category_proxy',
      diagnosticEnabled: false,
    })
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.questions
      WHERE game='wordquest' AND exam_ref IS NOT NULL`,
    )).rows[0]).toEqual({ count: 0 })
    expect((await client.query(
      `SELECT public.curriculum_scope_integrity('wordquest','YDT','ba-ydt-eng-v1') AS result`,
    )).rows[0].result).toEqual({
      total: 7,
      mapped: 7,
      unmapped: 0,
      scopeMismatch: 0,
      nodeOrphan: 0,
      outcomeOrphan: 0,
      primaryMismatch: 0,
      emptyOutcome: 0,
    })
    expect((await client.query(`SELECT outcome.code
      FROM public.question_outcomes AS mapping
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=mapping.outcome_id
      JOIN public.questions AS question ON question.id=mapping.question_id
      WHERE question.game='wordquest'
      ORDER BY outcome.code`)).rows).toEqual([
      { code: 'ENG-CLZ-01' },
      { code: 'ENG-DLG-01' },
      { code: 'ENG-GRM-01' },
      { code: 'ENG-GRM-02' },
      { code: 'ENG-PHR-01' },
      { code: 'ENG-RES-01' },
      { code: 'ENG-SEN-01' },
      { code: 'ENG-VOC-01' },
    ])
    expect((await client.query(`SELECT mapping.mapping_source,mapping.is_primary
      FROM public.question_outcomes AS mapping
      WHERE mapping.question_id=$1`, [questionIds.get('vocabulary')])).rows).toEqual([
      { mapping_source: 'manual', is_primary: true },
    ])
    expect((await client.query(`SELECT
      count(*)::integer AS evidence,
      count(*) FILTER (WHERE is_correct)::integer AS correct,
      sum(difficulty_weighted_earned)::integer AS earned,
      sum(difficulty_weighted_possible)::integer AS possible
      FROM public.mastery_outcome_evidence WHERE attempt_id=$1`,
    [ydtEnglishAttempt])).rows[0]).toEqual({ evidence: 8, correct: 5, earned: 13, possible: 20 })
    expect((await client.query(`SELECT
      sum(attempts)::integer AS attempts,
      sum(correct_attempts)::integer AS correct_attempts,
      sum(v2_attempts)::integer AS v2_attempts,
      sum(timed_attempts)::integer AS timed_attempts,
      sum(total_time_sec)::integer AS total_time_sec
      FROM public.user_outcome_state WHERE user_id=$1`, [ydtEnglishUser])).rows[0]).toEqual({
      attempts: 8,
      correct_attempts: 5,
      v2_attempts: 8,
      timed_attempts: 8,
      total_time_sec: 119,
    })
    expect((await client.query(`SELECT
      count(evidence.*)::integer AS evidence,
      (SELECT sum(attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS attempts,
      (SELECT sum(v2_attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS v2_attempts,
      count(*) FILTER (WHERE mapping.created_at <= answer.answered_at)::integer AS mapping_at_or_before_answer,
      count(*) FILTER (WHERE mapping.created_at > answer.answered_at)::integer AS mapping_after_answer
      FROM public.mastery_outcome_evidence AS evidence
      JOIN public.session_answers AS answer ON answer.id=evidence.answer_id
      JOIN public.question_outcomes AS mapping
        ON mapping.question_id=evidence.question_id AND mapping.outcome_id=evidence.outcome_id
      WHERE evidence.attempt_id=$2`, [
      ydtEnglishRaceUser, ydtEnglishRaceAttempt,
    ])).rows[0]).toEqual({
      evidence: 2,
      attempts: 2,
      v2_attempts: 2,
      mapping_at_or_before_answer: 1,
      mapping_after_answer: 1,
    })
    expect((await client.query(`SELECT
      count(*)::integer AS evidence,
      (SELECT sum(attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS attempts,
      (SELECT sum(v2_attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS v2_attempts,
      count(*) FILTER (WHERE outcome_id=$3)::integer AS repaired_secondary
      FROM public.mastery_outcome_evidence WHERE attempt_id=$2`, [
      ydtEnglishPostReleaseUser, ydtEnglishPostReleaseAttempt, ydtEnglishPostReleaseOutcome,
    ])).rows[0]).toEqual({ evidence: 2, attempts: 2, v2_attempts: 2, repaired_secondary: 1 })
    expect((await client.query(`SELECT candidate_attempts,candidate_answers,
      candidate_evidence_rows,inserted_evidence_rows,affected_users,
      manual_mapping_rows,mapping_at_or_before_answer_rows,mapping_after_answer_rows
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key='188_ydt_english_complete_mappings_v1'
      ORDER BY repaired_at,run_id LIMIT 1`)).rows[0]).toEqual({
      candidate_attempts: 3,
      candidate_answers: 9,
      candidate_evidence_rows: 11,
      inserted_evidence_rows: 11,
      affected_users: 3,
      manual_mapping_rows: 4,
      mapping_at_or_before_answer_rows: 1,
      mapping_after_answer_rows: 10,
    })

    // The secondary outcome has now proven the post-release repair path. Retire
    // it before replaying the category-proxy release, whose contract requires
    // one active outcome per category. Persisted evidence/state remain intact.
    await client.query(`DELETE FROM public.question_outcomes
      WHERE question_id=$1 AND outcome_id=$2`, [
      questionIds.get('grammar'), ydtEnglishPostReleaseOutcome,
    ])
    await client.query('UPDATE public.curriculum_outcomes SET is_active=false WHERE id=$1', [
      ydtEnglishPostReleaseOutcome,
    ])
    await client.query('UPDATE public.curriculum_nodes SET is_active=false WHERE id=$1', [
      ydtEnglishPostReleaseNode,
    ])

    await client.query(ydtEnglishReleaseMigration)
    await client.query(ydtEnglishRepairMigration)
    expect((await client.query(`SELECT candidate_evidence_rows,inserted_evidence_rows
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key='188_ydt_english_complete_mappings_v1'
      ORDER BY repaired_at DESC,run_id DESC LIMIT 1`)).rows[0]).toEqual({
      candidate_evidence_rows: 0,
      inserted_evidence_rows: 0,
    })
    expect((await client.query(`SELECT
      count(*)::integer AS evidence,
      (SELECT sum(attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS attempts,
      (SELECT sum(v2_attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS v2_attempts
      FROM public.mastery_outcome_evidence WHERE attempt_id=$2`, [
      ydtEnglishUser, ydtEnglishAttempt,
    ])).rows[0]).toEqual({ evidence: 8, attempts: 8, v2_attempts: 8 })
    expect((await client.query(`SELECT
      count(*)::integer AS evidence,
      (SELECT sum(attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS attempts,
      (SELECT sum(v2_attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS v2_attempts
      FROM public.mastery_outcome_evidence WHERE attempt_id=$2`, [
      ydtEnglishRaceUser, ydtEnglishRaceAttempt,
    ])).rows[0]).toEqual({ evidence: 2, attempts: 2, v2_attempts: 2 })
    expect((await client.query(`SELECT
      count(*)::integer AS evidence,
      (SELECT sum(attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS attempts,
      (SELECT sum(v2_attempts)::integer FROM public.user_outcome_state WHERE user_id=$1) AS v2_attempts
      FROM public.mastery_outcome_evidence WHERE attempt_id=$2`, [
      ydtEnglishPostReleaseUser, ydtEnglishPostReleaseAttempt,
    ])).rows[0]).toEqual({ evidence: 2, attempts: 2, v2_attempts: 2 })

    const futureQuestion = randomUUID()
    await client.query(`INSERT INTO public.questions(id,game,category,exam_ref,is_active)
      VALUES($1,'wordquest','vocabulary','YDT',true)`, [futureQuestion])
    expect((await client.query(
      'SELECT exam_ref FROM public.questions WHERE id=$1', [futureQuestion],
    )).rows[0]).toEqual({ exam_ref: null })
    await client.query(`UPDATE public.questions SET exam_ref='TYT' WHERE id=$1`, [futureQuestion])
    expect((await client.query(
      'SELECT exam_ref FROM public.questions WHERE id=$1', [futureQuestion],
    )).rows[0]).toEqual({ exam_ref: null })
    expect((await client.query(`SELECT outcome.code
      FROM public.question_outcomes AS mapping
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=mapping.outcome_id
      WHERE mapping.question_id=$1`, [futureQuestion])).rows).toEqual([{ code: 'ENG-VOC-01' }])
    await expect(client.query(
      `UPDATE public.questions SET category='unknown_ydt_category' WHERE id=$1`, [futureQuestion],
    )).rejects.toMatchObject({ code: '22023' })

    const runsBeforeNoOp = (await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key='188_ydt_english_complete_mappings_v1'`)).rows[0].count
    await client.query(`UPDATE public.curriculum_scope_releases SET release_status='retired'
      WHERE game='wordquest' AND display_exam_ref='YDT'`)
    await client.query(ydtEnglishReleaseMigration)
    await client.query(ydtEnglishRepairMigration)
    expect((await client.query(`SELECT release_status FROM public.curriculum_scope_releases
      WHERE game='wordquest' AND display_exam_ref='YDT'`)).rows[0]).toEqual({ release_status: 'retired' })
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key='188_ydt_english_complete_mappings_v1'`)).rows[0].count).toBe(runsBeforeNoOp)

    await client.query(`UPDATE public.curriculum_scope_releases
      SET release_status='released',taxonomy_version='ba-ydt-eng-v2'
      WHERE game='wordquest' AND display_exam_ref='YDT'`)
    await client.query(ydtEnglishReleaseMigration)
    await client.query(ydtEnglishRepairMigration)
    expect((await client.query(`SELECT release_status,taxonomy_version
      FROM public.curriculum_scope_releases WHERE game='wordquest' AND display_exam_ref='YDT'`)).rows[0]).toEqual({
      release_status: 'released', taxonomy_version: 'ba-ydt-eng-v2',
    })
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key='188_ydt_english_complete_mappings_v1'`)).rows[0].count).toBe(runsBeforeNoOp)

    await client.query(`UPDATE public.curriculum_scope_releases
      SET taxonomy_version='ba-ydt-eng-v1'
      WHERE game='wordquest' AND display_exam_ref='YDT'`)
  })

  it('maps future released Fen questions, ignores draft scopes, and fails closed on unknown Fen categories', async () => {
    const futureFen = randomUUID()
    const futureTurkish = randomUUID()
    await client.query(`INSERT INTO public.questions(id,game,category,exam_ref,is_active)
      VALUES ($1,'fen','fizik','TYT',true),($2,'turkce','paragraf','TYT',true)`, [futureFen, futureTurkish])
    expect((await client.query(`SELECT outcome.code FROM public.question_outcomes AS mapping
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=mapping.outcome_id
      WHERE mapping.question_id=$1`, [futureFen])).rows).toEqual([{ code: 'FEN-FIZ-01' }])
    expect((await client.query(
      `SELECT count(*)::integer AS count FROM public.question_outcomes WHERE question_id=$1`,
      [futureTurkish],
    )).rows[0].count).toBe(0)
    await expect(client.query(
      `UPDATE public.questions SET category='bilinmeyen' WHERE id=$1`,
      [futureFen],
    )).rejects.toMatchObject({ code: '22023' })
    expect((await client.query(
      `SELECT category FROM public.questions WHERE id=$1`,
      [futureFen],
    )).rows[0].category).toBe('fizik')
  })

  it('fails closed on an active TYT literature question without leaving a Turkish v2 cutover trace', async () => {
    const literatureQuestion = randomUUID()
    await client.query(`INSERT INTO public.questions(id,game,category,exam_ref,is_active)
      VALUES($1,'turkce','edebiyat','TYT',true)`, [literatureQuestion])
    const before = (await client.query(`SELECT
      (SELECT jsonb_build_object('taxonomy',taxonomy_version,'status',release_status,'releasedAt',released_at)
       FROM public.curriculum_scope_releases
       WHERE game='turkce' AND display_exam_ref='TYT') AS registry,
      (SELECT to_regclass('public.curriculum_scope_release_history') IS NOT NULL) AS has_history,
      (SELECT count(*)::integer FROM public.curriculum_nodes
       WHERE taxonomy_version='ba-tyt-turkce-v2') AS v2_nodes,
      (SELECT count(*)::integer FROM public.curriculum_outcomes
       WHERE taxonomy_version='ba-tyt-turkce-v2') AS v2_outcomes`)).rows[0]

    try {
      await expect(client.query(turkishReleaseMigration)).rejects.toMatchObject({ code: '22023' })
    } finally {
      await client.query('ROLLBACK')
    }

    const after = (await client.query(`SELECT
      (SELECT jsonb_build_object('taxonomy',taxonomy_version,'status',release_status,'releasedAt',released_at)
       FROM public.curriculum_scope_releases
       WHERE game='turkce' AND display_exam_ref='TYT') AS registry,
      (SELECT to_regclass('public.curriculum_scope_release_history') IS NOT NULL) AS has_history,
      (SELECT count(*)::integer FROM public.curriculum_nodes
       WHERE taxonomy_version='ba-tyt-turkce-v2') AS v2_nodes,
      (SELECT count(*)::integer FROM public.curriculum_outcomes
       WHERE taxonomy_version='ba-tyt-turkce-v2') AS v2_outcomes`)).rows[0]
    expect(after).toEqual(before)
    await client.query('DELETE FROM public.questions WHERE id=$1', [literatureQuestion])
  })

  it('refuses an already released Turkish v1 registry without creating history or v2 graph rows', async () => {
    await client.query(`UPDATE public.curriculum_scope_releases
      SET release_status='released',released_at=clock_timestamp()
      WHERE game='turkce' AND display_exam_ref='TYT'
        AND taxonomy_version='ba-tyt-turkce-v1'`)
    const before = (await client.query(`SELECT
      (SELECT jsonb_build_object('taxonomy',taxonomy_version,'status',release_status,'releasedAt',released_at)
       FROM public.curriculum_scope_releases
       WHERE game='turkce' AND display_exam_ref='TYT') AS registry,
      (SELECT to_regclass('public.curriculum_scope_release_history') IS NOT NULL) AS has_history,
      (SELECT count(*)::integer FROM public.curriculum_nodes
       WHERE taxonomy_version='ba-tyt-turkce-v2') AS v2_nodes,
      (SELECT count(*)::integer FROM public.curriculum_outcomes
       WHERE taxonomy_version='ba-tyt-turkce-v2') AS v2_outcomes`)).rows[0]

    try {
      await expect(client.query(turkishReleaseMigration)).rejects.toMatchObject({ code: '55000' })
    } finally {
      await client.query('ROLLBACK')
    }

    const after = (await client.query(`SELECT
      (SELECT jsonb_build_object('taxonomy',taxonomy_version,'status',release_status,'releasedAt',released_at)
       FROM public.curriculum_scope_releases
       WHERE game='turkce' AND display_exam_ref='TYT') AS registry,
      (SELECT to_regclass('public.curriculum_scope_release_history') IS NOT NULL) AS has_history,
      (SELECT count(*)::integer FROM public.curriculum_nodes
       WHERE taxonomy_version='ba-tyt-turkce-v2') AS v2_nodes,
      (SELECT count(*)::integer FROM public.curriculum_outcomes
       WHERE taxonomy_version='ba-tyt-turkce-v2') AS v2_outcomes`)).rows[0]
    expect(after).toEqual(before)
    await client.query(`UPDATE public.curriculum_scope_releases
      SET release_status='draft',released_at=NULL
      WHERE game='turkce' AND display_exam_ref='TYT'
        AND taxonomy_version='ba-tyt-turkce-v1'`)
  })

  it('blocks exact-scope release on missing markers or immutable snapshot drift', async () => {
    const cases = [
      { game: 'turkce', category: 'paragraf', provenance: 'missing', migration: turkishReleaseMigration },
      { game: 'turkce', category: 'paragraf', provenance: 'exam', migration: turkishReleaseMigration },
    ]

    for (const releaseCase of cases) {
      const seed = await seedScopeAttempt(
        releaseCase.game,
        [releaseCase.category],
        true,
        releaseCase.provenance,
      )
      try {
        await expect(client.query(releaseCase.migration)).rejects.toMatchObject({ code: '23514' })
      } finally {
        await client.query('ROLLBACK')
        await cleanupScopeAttempt(seed)
      }
      expect((await client.query(`SELECT release_status
        FROM public.curriculum_scope_releases
        WHERE game=$1 AND display_exam_ref='TYT'`, [releaseCase.game])).rows[0].release_status).toBe('draft')
    }

    const markerGap = await seedScopeAttempt('turkce', ['paragraf'], true)
    await client.query('DELETE FROM public.mastery_materialized_attempts WHERE attempt_id=$1', [markerGap.attempt])
    try {
      await expect(client.query(turkishReleaseMigration)).rejects.toMatchObject({ code: '23514' })
    } finally {
      await client.query('ROLLBACK')
      await cleanupScopeAttempt(markerGap)
    }
    expect((await client.query(`SELECT release_status
      FROM public.curriculum_scope_releases
      WHERE game='turkce' AND display_exam_ref='TYT'`)).rows[0].release_status).toBe('draft')
  })

  it('keeps Social draft and makes repair a no-op when a required category is empty', async () => {
    const religionQuestion = questionIds.get('din_kulturu')
    await client.query('UPDATE public.questions SET is_active=false WHERE id=$1', [religionQuestion])
    try {
      await client.query(socialReleaseMigration)
      await client.query(socialRepairMigration)

      expect((await client.query(`SELECT release_status,diagnostic_enabled,released_at
        FROM public.curriculum_scope_releases
        WHERE game='sosyal' AND display_exam_ref='TYT'`)).rows[0]).toEqual({
        release_status: 'draft',
        diagnostic_enabled: false,
        released_at: null,
      })
      expect((await client.query(
        `SELECT public.resolve_released_curriculum_scope('sosyal','TYT') AS scope`,
      )).rows[0].scope).toBeNull()
      expect((await client.query(`SELECT count(*)::integer AS total
        FROM public.curriculum_scope_evidence_repair_runs
        WHERE repair_key='192_tyt_sosyal_complete_mappings_v1'`)).rows[0].total).toBe(0)
    } finally {
      await client.query('UPDATE public.questions SET is_active=true WHERE id=$1', [religionQuestion])
    }
  })

  it('does not let one Din Kulturu row or legacy source metadata open Social', async () => {
    const mutationSnapshot = async () => (await client.query(`SELECT
      (SELECT count(*)::integer FROM public.question_outcomes mapping
       JOIN public.questions question ON question.id=mapping.question_id
       WHERE question.game='sosyal') AS mappings,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence evidence
       JOIN public.questions question ON question.id=evidence.question_id
       WHERE question.game='sosyal') AS evidence,
      (SELECT count(*)::integer FROM public.curriculum_scope_evidence_repair_runs
       WHERE repair_key='192_tyt_sosyal_complete_mappings_v1') AS repair_runs`)).rows[0]

    const beforeSingle = await mutationSnapshot()
    await client.query(socialReleaseMigration)
    await client.query(socialRepairMigration)
    expect(await mutationSnapshot()).toEqual(beforeSingle)
    expect((await client.query(`SELECT release_status,diagnostic_enabled,released_at
      FROM public.curriculum_scope_releases
      WHERE game='sosyal' AND display_exam_ref='TYT'`)).rows[0]).toEqual({
      release_status: 'draft', diagnostic_enabled: false, released_at: null,
    })
    expect((await client.query(`SELECT public.tyt_social_source_policy_integrity(
      'sosyal','TYT','ba-tyt-sosyal-v1'
    ) AS evidence`)).rows[0].evidence).toMatchObject({
      policyVersion: 'social-human-source-v1',
      minimumDinKulturuQuestions: 2,
      categoryGap: 1,
      activeQuestionCount: 5,
      approvedQuestionCount: 5,
      sourceReady: false,
      candidatePolicyReady: false,
      ready: false,
    })
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_source_policy_evidence
      WHERE game='sosyal' AND display_exam_ref='TYT'`)).rows[0].count).toBe(0)

    await client.query(`INSERT INTO public.questions(
      id,game,category,difficulty,exam_ref,is_active
    ) VALUES($1,'sosyal','din_kulturu',3,'TYT',true)`, [
      socialSecondReligionQuestion,
    ])
    await client.query(`INSERT INTO public.question_content_revisions(
      id,question_id,game,category,difficulty,exam_ref,content_sha256,
      change_kind,status,prepared_by,published_at
    ) VALUES($1,$2,'sosyal','din_kulturu',3,'TYT',$3,
      'legacy_import','published',NULL,clock_timestamp())`, [
      socialSecondReligionRevision, socialSecondReligionQuestion, 'f'.repeat(64),
    ])
    await client.query(`INSERT INTO public.question_revision_sources(
      revision_id,source_kind,license_code,provenance_ref
    ) VALUES($1,'original','legacy-import',$2)`, [
      socialSecondReligionRevision, `legacy:${socialSecondReligionQuestion}`,
    ])
    await client.query('UPDATE public.questions SET published_revision_id=$2 WHERE id=$1', [
      socialSecondReligionQuestion, socialSecondReligionRevision,
    ])

    const beforeLegacy = await mutationSnapshot()
    await client.query(socialReleaseMigration)
    await client.query(socialRepairMigration)
    expect(await mutationSnapshot()).toEqual(beforeLegacy)
    expect((await client.query(`SELECT release_status,diagnostic_enabled
      FROM public.curriculum_scope_releases
      WHERE game='sosyal' AND display_exam_ref='TYT'`)).rows[0]).toEqual({
      release_status: 'draft', diagnostic_enabled: false,
    })
    expect((await client.query(`SELECT public.tyt_social_source_policy_integrity(
      'sosyal','TYT','ba-tyt-sosyal-v1'
    ) AS evidence`)).rows[0].evidence).toMatchObject({
      categoryGap: 0,
      activeQuestionCount: 6,
      approvedQuestionCount: 5,
      unapprovedQuestionCount: 1,
      sourceReady: false,
      candidatePolicyReady: false,
      ready: false,
    })

    // Leave the bank ready for the next release test, but do not publish here:
    // the next migration execution must independently recompute and persist the
    // exact manifest rather than trusting fixture state.
    await client.query(`UPDATE public.question_content_revisions
      SET change_kind='create',prepared_by=$2
      WHERE id=$1`, [socialSecondReligionRevision, socialPreparer])
    await client.query(`UPDATE public.question_revision_sources
      SET license_code='BA-INTERNAL',provenance_ref='reviewed:sosyal:din-kulturu-2'
      WHERE revision_id=$1`, [socialSecondReligionRevision])
    await client.query(`INSERT INTO public.question_revision_approvals(
      revision_id,stage,reviewer_id,decision
    ) VALUES($1,1,$2,'approved'),($1,2,$3,'approved')`, [
      socialSecondReligionRevision, socialReviewerOne, socialReviewerTwo,
    ])
    expect((await client.query(`SELECT public.tyt_social_source_policy_integrity(
      'sosyal','TYT','ba-tyt-sosyal-v1'
    ) AS evidence`)).rows[0].evidence).toMatchObject({
      categoryGap: 0,
      activeQuestionCount: 6,
      approvedQuestionCount: 6,
      unapprovedQuestionCount: 0,
      sourceReady: true,
      candidatePolicyVersion: null,
      candidatePolicyReady: false,
      candidatePolicyReason: 'candidate-exam-category-policy-missing',
      ready: false,
    })

    const beforeGovernedBank = await mutationSnapshot()
    await client.query(socialReleaseMigration)
    await client.query(socialRepairMigration)
    expect(await mutationSnapshot()).toEqual(beforeGovernedBank)
    expect((await client.query(`SELECT release_status,diagnostic_enabled,released_at
      FROM public.curriculum_scope_releases
      WHERE game='sosyal' AND display_exam_ref='TYT'`)).rows[0]).toEqual({
      release_status: 'draft', diagnostic_enabled: false, released_at: null,
    })
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_source_policy_evidence
      WHERE game='sosyal' AND display_exam_ref='TYT'`)).rows[0].count).toBe(0)
  })

  it('releases exact TYT Turkish while keeping governed Social hard-draft without candidate policy', async () => {
    const preRelease = await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_materialized_attempts WHERE attempt_id=$1) AS turkish_markers,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$1) AS turkish_evidence,
      (SELECT count(*)::integer FROM public.mastery_materialized_attempts WHERE attempt_id=$2) AS social_markers,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$2) AS social_evidence`, [
      turkishHistoricalAttempt.attempt, socialHistoricalAttempt.attempt,
    ])
    expect(preRelease.rows[0]).toEqual({
      turkish_markers: 1,
      turkish_evidence: 0,
      social_markers: 1,
      social_evidence: 0,
    })
    const v1OutcomeId = (await client.query(`SELECT id FROM public.curriculum_outcomes
      WHERE code='TUR-PAR-01'`)).rows[0].id
    await client.query(`INSERT INTO public.mastery_outcome_evidence(
      answer_id,outcome_id,user_id,question_id,session_id,attempt_id,is_correct,
      mapping_weight,difficulty,difficulty_weighted_earned,difficulty_weighted_possible,
      time_taken_sec,fast_wrong,max_hint_stage,delayed_correct,base_already_recorded
    ) VALUES($1,$2,$3,$4,$5,$6,true,1,1,1,1,12,false,0,false,true)`, [
      turkishHistoricalAttempt.answers[0], v1OutcomeId, turkishHistoricalAttempt.user,
      questionIds.get('paragraf'), turkishHistoricalAttempt.session,
      turkishHistoricalAttempt.attempt,
    ])
    await client.query(`INSERT INTO public.user_outcome_state(
      user_id,outcome_id,attempts,correct_attempts,weighted_earned,weighted_possible,
      delayed_correct,last_answered_at
    ) VALUES($1,$2,1,1,1,1,0,clock_timestamp()-interval '4 hours')`, [
      turkishHistoricalAttempt.user, v1OutcomeId,
    ])
    const v1EvidenceBeforeCutover = (await client.query(`SELECT evidence.answer_id,
      outcome.code,evidence.attempt_id,evidence.is_correct,evidence.mapping_weight,
      evidence.difficulty,evidence.difficulty_weighted_earned,evidence.difficulty_weighted_possible,
      state.attempts,state.correct_attempts,state.weighted_earned,state.weighted_possible
      FROM public.mastery_outcome_evidence AS evidence
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=evidence.outcome_id
      JOIN public.user_outcome_state AS state
        ON state.user_id=evidence.user_id AND state.outcome_id=evidence.outcome_id
      WHERE evidence.answer_id=$1 AND outcome.code='TUR-PAR-01'`, [
      turkishHistoricalAttempt.answers[0],
    ])).rows
    expect(v1EvidenceBeforeCutover).toHaveLength(1)
    const scopeTotals = Object.fromEntries((await client.query(`SELECT game,count(*)::integer AS total
      FROM public.questions
      WHERE game IN ('turkce','sosyal') AND is_active
      GROUP BY game ORDER BY game`)).rows.map((row) => [row.game, row.total]))

    await client.query(turkishReleaseMigration)
    await client.query(turkishRepairMigration)
    await client.query(socialReleaseMigration)
    await client.query(socialRepairMigration)

    const scopes = (await client.query(`SELECT game,display_exam_ref,question_exam_ref,
      taxonomy_version,release_status,diagnostic_enabled,(released_at IS NOT NULL) AS has_released_at
      FROM public.curriculum_scope_releases
      WHERE game IN ('turkce','sosyal') ORDER BY game`)).rows
    expect(scopes).toEqual([
      { game: 'sosyal', display_exam_ref: 'TYT', question_exam_ref: 'TYT', taxonomy_version: 'ba-tyt-sosyal-v1', release_status: 'draft', diagnostic_enabled: false, has_released_at: false },
      { game: 'turkce', display_exam_ref: 'TYT', question_exam_ref: 'TYT', taxonomy_version: 'ba-tyt-turkce-v2', release_status: 'released', diagnostic_enabled: false, has_released_at: true },
    ])
    expect((await client.query(`SELECT game,display_exam_ref,taxonomy_version,
      release_status,transition_reason
      FROM public.curriculum_scope_release_history
      WHERE game='turkce' AND display_exam_ref='TYT'`)).rows).toEqual([{
      game: 'turkce',
      display_exam_ref: 'TYT',
      taxonomy_version: 'ba-tyt-turkce-v1',
      release_status: 'draft',
      transition_reason: '189_tyt_turkce_v2_cutover',
    }])
    expect((await client.query(`SELECT evidence.answer_id,outcome.code,evidence.attempt_id,
      evidence.is_correct,evidence.mapping_weight,evidence.difficulty,
      evidence.difficulty_weighted_earned,evidence.difficulty_weighted_possible,
      state.attempts,state.correct_attempts,state.weighted_earned,state.weighted_possible
      FROM public.mastery_outcome_evidence AS evidence
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=evidence.outcome_id
      JOIN public.user_outcome_state AS state
        ON state.user_id=evidence.user_id AND state.outcome_id=evidence.outcome_id
      WHERE evidence.answer_id=$1 AND outcome.code='TUR-PAR-01'`, [
      turkishHistoricalAttempt.answers[0],
    ])).rows).toEqual(v1EvidenceBeforeCutover)

    for (const [game, taxonomyVersion, total] of [
      ['turkce', 'ba-tyt-turkce-v2', scopeTotals.turkce],
    ]) {
      expect((await client.query(
        `SELECT public.resolve_released_curriculum_scope($1,'TYT') AS scope`, [game],
      )).rows[0].scope).toEqual({
        game,
        displayExamRef: 'TYT',
        questionExamRef: 'TYT',
        taxonomyVersion,
        mappingMode: 'category_proxy',
        diagnosticEnabled: false,
      })
      expect((await client.query(
        `SELECT public.curriculum_scope_integrity($1,'TYT',$2) AS result`, [game, taxonomyVersion],
      )).rows[0].result).toEqual({
        total,
        mapped: total,
        unmapped: 0,
        scopeMismatch: 0,
        nodeOrphan: 0,
        outcomeOrphan: 0,
        primaryMismatch: 0,
        emptyOutcome: 0,
      })
    }
    expect((await client.query(
      `SELECT public.resolve_released_curriculum_scope('sosyal','TYT') AS scope`,
    )).rows[0].scope).toBeNull()
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_source_policy_evidence
      WHERE game='sosyal' AND display_exam_ref='TYT'
        AND taxonomy_version='ba-tyt-sosyal-v1'
        AND source_policy_version='social-human-source-v1'`)).rows[0].count).toBe(0)

    expect((await client.query(`SELECT question.category AS question_category,
      outcome.category AS outcome_category,
      outcome.code,mapping.mapping_source,mapping.is_primary
      FROM public.questions AS question
      JOIN public.question_outcomes AS mapping ON mapping.question_id=question.id
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=mapping.outcome_id
      WHERE question.game='turkce' AND question.id = ANY($1::uuid[])
      ORDER BY question.category, outcome.code`, [turkishCategories.map((category) => questionIds.get(category))])).rows).toEqual([
      { question_category: 'anlam_bilgisi', outcome_category: 'anlam_bilgisi', code: 'TUR2-ANL-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { question_category: 'dil_bilgisi', outcome_category: 'dil_bilgisi', code: 'TUR2-DIL-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { question_category: 'paragraf', outcome_category: 'paragraf', code: 'TUR2-PAR-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { question_category: 'sozcuk', outcome_category: 'sozcuk', code: 'TUR2-SOZ-01', mapping_source: 'taxonomy_auto', is_primary: true },
      { question_category: 'yazim_kurallari', outcome_category: 'yazim_kurallari', code: 'TUR2-YAZ-01', mapping_source: 'taxonomy_auto', is_primary: true },
    ])
    expect((await client.query(`SELECT question.category,outcome.code,mapping.mapping_source,mapping.is_primary
      FROM public.questions AS question
      JOIN public.question_outcomes AS mapping ON mapping.question_id=question.id
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=mapping.outcome_id
      WHERE question.game='sosyal' ORDER BY question.category`)).rows).toEqual([])

    expect((await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$1) AS turkish_evidence,
      (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$2) AS turkish_attempts,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$3) AS social_evidence,
      (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$4) AS social_attempts`, [
      turkishHistoricalAttempt.attempt, turkishHistoricalAttempt.user,
      socialHistoricalAttempt.attempt, socialHistoricalAttempt.user,
    ])).rows[0]).toEqual({
      turkish_evidence: 6,
      turkish_attempts: 6,
      social_evidence: 0,
      social_attempts: 0,
    })
    expect((await client.query(`SELECT candidate_attempts,candidate_answers,
      candidate_evidence_rows,inserted_evidence_rows,affected_users,
      manual_mapping_rows,mapping_at_or_before_answer_rows,mapping_after_answer_rows
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key IN ('190_tyt_turkce_complete_mappings_v2','192_tyt_sosyal_complete_mappings_v1')
      ORDER BY repair_key`)).rows).toEqual([
      { candidate_attempts: 1, candidate_answers: 5, candidate_evidence_rows: 5, inserted_evidence_rows: 5, affected_users: 1, manual_mapping_rows: 0, mapping_at_or_before_answer_rows: 0, mapping_after_answer_rows: 5 },
    ])

    // Turkish mapping is live, while Social remains deliberately unmapped.
    // This pair proves that the same answer traffic cannot bypass the hard
    // candidate-policy gate through the legacy base materializer.
    turkishCompletionAfterReleaseAttempt = await seedScopeAttempt('turkce', turkishCategories, false)
    socialCompletionAfterReleaseAttempt = await seedScopeAttempt('sosyal', socialCategories, false)
    // seedScopeAttempt backdates answers to model historical repair candidates.
    // These two attempts are intentionally post-release, so their immutable
    // answer timestamp must also be after the taxonomy-auto mapping timestamp;
    // otherwise the v2 materializer correctly treats the base row as absent
    // and the fixture double-counts an impossible chronology.
    await client.query(`UPDATE public.session_answers SET answered_at=clock_timestamp()
      WHERE session_id IN ($1,$2)`, [
      turkishCompletionAfterReleaseAttempt.session,
      socialCompletionAfterReleaseAttempt.session,
    ])
    expect((await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_materialized_attempts WHERE attempt_id=$1) AS turkish_markers,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$1) AS turkish_evidence,
      (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$2) AS turkish_attempts,
      (SELECT count(*)::integer FROM public.mastery_materialized_attempts WHERE attempt_id=$3) AS social_markers,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$3) AS social_evidence,
      (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$4) AS social_attempts`, [
      turkishCompletionAfterReleaseAttempt.attempt, turkishCompletionAfterReleaseAttempt.user,
      socialCompletionAfterReleaseAttempt.attempt, socialCompletionAfterReleaseAttempt.user,
    ])).rows[0]).toEqual({
      turkish_markers: 0,
      turkish_evidence: 0,
      turkish_attempts: 5,
      social_markers: 0,
      social_evidence: 0,
      social_attempts: 0,
    })

    // Replay both migrations while the attempts are incomplete. Turkish adds
    // evidence on completion; Social must remain evidence-free and its repair
    // migration must remain a mutation-free no-op.
    await client.query(turkishReleaseMigration)
    await client.query(turkishRepairMigration)
    await client.query(socialReleaseMigration)
    await client.query(socialRepairMigration)
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_release_history
      WHERE game='turkce' AND display_exam_ref='TYT'
        AND taxonomy_version='ba-tyt-turkce-v1'
        AND transition_reason='189_tyt_turkce_v2_cutover'`)).rows[0].count).toBe(1)
    await client.query(`UPDATE public.verified_attempts
      SET completed_at=clock_timestamp(),session_id=$2 WHERE id=$1`, [
      turkishCompletionAfterReleaseAttempt.attempt, turkishCompletionAfterReleaseAttempt.session,
    ])
    await client.query(`UPDATE public.verified_attempts
      SET completed_at=clock_timestamp(),session_id=$2 WHERE id=$1`, [
      socialCompletionAfterReleaseAttempt.attempt, socialCompletionAfterReleaseAttempt.session,
    ])

    const repairRunsBeforeFinalReplay = (await client.query(`SELECT repair_key,count(*)::integer AS count
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key IN ('190_tyt_turkce_complete_mappings_v2','192_tyt_sosyal_complete_mappings_v1')
      GROUP BY repair_key ORDER BY repair_key`)).rows
    await client.query(turkishRepairMigration)
    await client.query(socialRepairMigration)
    expect((await client.query(`SELECT repair_key,candidate_attempts,candidate_answers,
      candidate_evidence_rows,inserted_evidence_rows,affected_users
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key IN ('190_tyt_turkce_complete_mappings_v2','192_tyt_sosyal_complete_mappings_v1')
      ORDER BY repaired_at DESC,run_id DESC LIMIT 2`)).rows).toEqual([
      { repair_key: '190_tyt_turkce_complete_mappings_v2', candidate_attempts: 0, candidate_answers: 0, candidate_evidence_rows: 0, inserted_evidence_rows: 0, affected_users: 0 },
      { repair_key: '190_tyt_turkce_complete_mappings_v2', candidate_attempts: 0, candidate_answers: 0, candidate_evidence_rows: 0, inserted_evidence_rows: 0, affected_users: 0 },
    ])
    expect((await client.query(`SELECT repair_key,count(*)::integer AS count
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key IN ('190_tyt_turkce_complete_mappings_v2','192_tyt_sosyal_complete_mappings_v1')
      GROUP BY repair_key ORDER BY repair_key`)).rows).toEqual(repairRunsBeforeFinalReplay.map((row) => ({
      repair_key: row.repair_key,
      count: row.count + 1,
    })))
    expect((await client.query(`SELECT
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$1) AS turkish_evidence,
      (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$2) AS turkish_attempts,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence WHERE attempt_id=$3) AS social_evidence,
      (SELECT COALESCE(sum(attempts),0)::integer FROM public.user_outcome_state WHERE user_id=$4) AS social_attempts`, [
      turkishCompletionAfterReleaseAttempt.attempt, turkishCompletionAfterReleaseAttempt.user,
      socialCompletionAfterReleaseAttempt.attempt, socialCompletionAfterReleaseAttempt.user,
    ])).rows[0]).toEqual({
      turkish_evidence: 5,
      turkish_attempts: 5,
      social_evidence: 0,
      social_attempts: 0,
    })
  })

  it('enforces append-only Social source-policy evidence without persisting fixture rows', async () => {
    for (const operation of ['UPDATE', 'DELETE']) {
      await client.query('BEGIN')
      try {
        await client.query(`INSERT INTO public.curriculum_scope_source_policy_evidence(
          game,display_exam_ref,taxonomy_version,source_policy_version,
          evidence_sha256,evidence_manifest,approved_question_count,required_category_count
        ) VALUES('sosyal','TYT','ba-tyt-sosyal-v1','social-human-source-v1',$1,$2::jsonb,6,5)`, [
          operation === 'UPDATE' ? 'a'.repeat(64) : 'b'.repeat(64),
          JSON.stringify([{ fixture: operation.toLowerCase() }]),
        ])
        if (operation === 'UPDATE') {
          await expect(client.query(`UPDATE public.curriculum_scope_source_policy_evidence
            SET approved_question_count=approved_question_count+1
            WHERE game='sosyal' AND display_exam_ref='TYT'`)).rejects.toMatchObject({ code: '55000' })
        } else {
          await expect(client.query(`DELETE FROM public.curriculum_scope_source_policy_evidence
            WHERE game='sosyal' AND display_exam_ref='TYT'`)).rejects.toMatchObject({ code: '55000' })
        }
      } finally {
        await client.query('ROLLBACK')
      }
    }
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_source_policy_evidence
      WHERE game='sosyal' AND display_exam_ref='TYT'`)).rows[0].count).toBe(0)
  })

  it('withdraws a stale released Social row when candidate policy is still absent', async () => {
    const simulatedHistoricalRelease = new Date('2026-01-15T09:00:00.000Z')
    await client.query(`UPDATE public.curriculum_scope_releases
      SET release_status='released',diagnostic_enabled=false,released_at=$1
      WHERE game='sosyal' AND display_exam_ref='TYT'`, [simulatedHistoricalRelease])
    const releasedBefore = (await client.query(`SELECT released_at
      FROM public.curriculum_scope_releases
      WHERE game='sosyal' AND display_exam_ref='TYT'`)).rows[0].released_at
    const proofRowsBefore = (await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_source_policy_evidence
      WHERE game='sosyal' AND display_exam_ref='TYT'
        AND taxonomy_version='ba-tyt-sosyal-v1'`)).rows[0].count
    const dataBefore = (await client.query(`SELECT
      (SELECT count(*)::integer FROM public.question_outcomes mapping
       JOIN public.questions question ON question.id=mapping.question_id
       WHERE question.game='sosyal') AS mappings,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence evidence
       JOIN public.questions question ON question.id=evidence.question_id
       WHERE question.game='sosyal') AS evidence,
      (SELECT count(*)::integer FROM public.curriculum_scope_evidence_repair_runs
       WHERE repair_key='192_tyt_sosyal_complete_mappings_v1') AS repair_runs`)).rows[0]

    await client.query(socialReleaseMigration)
    await client.query(socialRepairMigration)

    expect((await client.query(`SELECT release_status,diagnostic_enabled,released_at
      FROM public.curriculum_scope_releases
      WHERE game='sosyal' AND display_exam_ref='TYT'`)).rows[0]).toEqual({
      release_status: 'draft', diagnostic_enabled: false, released_at: releasedBefore,
    })
    expect((await client.query(
      `SELECT public.resolve_released_curriculum_scope('sosyal','TYT') AS scope`,
    )).rows[0].scope).toBeNull()
    expect((await client.query(`SELECT
      (SELECT count(*)::integer FROM public.question_outcomes mapping
       JOIN public.questions question ON question.id=mapping.question_id
       WHERE question.game='sosyal') AS mappings,
      (SELECT count(*)::integer FROM public.mastery_outcome_evidence evidence
       JOIN public.questions question ON question.id=evidence.question_id
       WHERE question.game='sosyal') AS evidence,
      (SELECT count(*)::integer FROM public.curriculum_scope_evidence_repair_runs
       WHERE repair_key='192_tyt_sosyal_complete_mappings_v1') AS repair_runs`)).rows[0]).toEqual(dataBefore)
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_source_policy_evidence
      WHERE game='sosyal' AND display_exam_ref='TYT'
        AND taxonomy_version='ba-tyt-sosyal-v1'`)).rows[0].count).toBe(proofRowsBefore)
  })

  it('keeps registry and direct mutation private while exposing count-only service RPCs', async () => {
    const privileges = (await client.query(`SELECT
       has_table_privilege('authenticated','public.curriculum_scope_releases','SELECT') AS auth_registry,
       has_table_privilege('service_role','public.curriculum_scope_releases','SELECT') AS service_registry,
       has_table_privilege('authenticated','public.curriculum_scope_release_history','SELECT') AS auth_history,
       has_table_privilege('service_role','public.curriculum_scope_release_history','SELECT') AS service_history,
       has_table_privilege('authenticated','public.curriculum_scope_release_history','INSERT') AS auth_history_insert,
       has_table_privilege('service_role','public.curriculum_scope_release_history','INSERT') AS service_history_insert,
      has_table_privilege('authenticated','public.curriculum_scope_evidence_repair_runs','SELECT') AS auth_repair_runs,
      has_table_privilege('service_role','public.curriculum_scope_evidence_repair_runs','SELECT') AS service_repair_runs,
      has_function_privilege('authenticated','public.resolve_released_curriculum_scope(text,text)','EXECUTE') AS auth_resolve,
      has_function_privilege('service_role','public.resolve_released_curriculum_scope(text,text)','EXECUTE') AS service_resolve,
      has_function_privilege('authenticated','public.curriculum_scope_integrity(text,text,text)','EXECUTE') AS auth_integrity,
      has_function_privilege('service_role','public.curriculum_scope_integrity(text,text,text)','EXECUTE') AS service_integrity,
      has_function_privilege('service_role','public.sync_taxonomy_auto_question_outcomes(uuid,text,text,text,boolean)','EXECUTE') AS service_sync,
      has_function_privilege('service_role','public.curriculum_node_parent_guard()','EXECUTE') AS service_parent_guard`)).rows[0]
    expect(privileges).toEqual({
      auth_registry: false,
      service_registry: false,
      auth_history: false,
      service_history: false,
      auth_history_insert: false,
      service_history_insert: false,
      auth_repair_runs: false,
      service_repair_runs: false,
      auth_resolve: false,
      service_resolve: true,
      auth_integrity: false,
      service_integrity: true,
      service_sync: false,
      service_parent_guard: false,
    })
    await asRole('authenticated', async () => {
      await expect(client.query('SELECT * FROM public.curriculum_scope_releases')).rejects.toMatchObject({ code: '42501' })
      await expect(client.query('SELECT * FROM public.curriculum_scope_release_history')).rejects.toMatchObject({ code: '42501' })
      await expect(client.query(`SELECT public.resolve_released_curriculum_scope('fen','TYT')`)).rejects.toMatchObject({ code: '42501' })
    })
    await asRole('service_role', async () => {
      expect((await client.query(
        `SELECT public.resolve_released_curriculum_scope('fen','TYT') AS scope`,
      )).rows[0].scope).toMatchObject({ game: 'fen', taxonomyVersion: 'ba-tyt-fen-v1' })
      await expect(client.query('SELECT * FROM public.curriculum_scope_releases')).rejects.toMatchObject({ code: '42501' })
      await expect(client.query('SELECT * FROM public.curriculum_scope_release_history')).rejects.toMatchObject({ code: '42501' })
      await expect(client.query(
        `SELECT public.sync_taxonomy_auto_question_outcomes(NULL,NULL,NULL,NULL,false)`,
      )).rejects.toMatchObject({ code: '42501' })
    })
  })

  it('drains review annotations before repairing their mastery aggregates', async () => {
    const annotationClient = new Client({ connectionString: url })
    await annotationClient.connect()
    const user = randomUUID()
    const session = randomUUID()
    const attempt = randomUUID()
    const answer = randomUUID()
    const barrierKey = 181456
    let barrierHeld = false
    let repair
    let annotation
    let writerClient
    try {
      await client.query('INSERT INTO public.profiles(id) VALUES($1)', [user])
      await client.query(`INSERT INTO public.game_sessions(id,user_id,client_request_id)
        VALUES($1,$2,$3)`, [session, user, randomUUID()])
      await client.query(`INSERT INTO public.session_answers(
        id,session_id,user_id,question_id,is_correct,time_taken_sec,is_fast,answered_at
      ) VALUES($1,$2,$3,$4,false,17,false,clock_timestamp())`, [
        answer, session, user, questionIds.get('fizik'),
      ])
      await client.query(`INSERT INTO public.verified_attempts(
        id,user_id,game,mode,question_ids,duration_sec,expires_at,completed_at,session_id
      ) VALUES($1,$2,'fen','classic',$3,180,clock_timestamp()+interval '1 hour',clock_timestamp(),$4)`, [
        attempt, user, [questionIds.get('fizik')], session,
      ])
      await client.query(`INSERT INTO public.verified_attempt_question_revisions(
        attempt_id,question_id,difficulty
      ) VALUES($1,$2,4)`, [attempt, questionIds.get('fizik')])
      await client.query('INSERT INTO public.mastery_materialized_attempts(attempt_id) VALUES($1)', [attempt])
      const reviewLog = (await client.query(
        'SELECT id FROM public.review_logs WHERE answer_id=$1', [answer],
      )).rows[0]
      expect(reviewLog?.id).toBeTruthy()

      await client.query('SELECT pg_advisory_lock($1)', [barrierKey])
      barrierHeld = true
      const gatedRepair = completeRepairMigration.replace(
        /IN SHARE ROW EXCLUSIVE MODE;\r?\n\r?\n-- Production may/,
        `IN SHARE ROW EXCLUSIVE MODE;\nSELECT pg_advisory_lock(${barrierKey});\nSELECT pg_advisory_unlock(${barrierKey});\n\n-- Production may`,
      )
      const repairPid = (await annotationClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      repair = annotationClient.query(gatedRepair)
      let atBarrier = false
      for (let index = 0; index < 100; index += 1) {
        const activity = (await client.query(
          'SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1', [repairPid],
        )).rows[0]
        if (activity?.wait_event_type === 'Lock' && /advisory/i.test(activity?.wait_event ?? '')) {
          atBarrier = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      expect(atBarrier).toBe(true)

      writerClient = new Client({ connectionString: url })
      await writerClient.connect()
      const writerPid = (await writerClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      annotation = writerClient.query(`INSERT INTO public.review_error_annotations(
        review_log_id,user_id,reason_code
      ) VALUES($1,$2,'guess')`, [reviewLog.id, user])
      let writerBlocked = false
      for (let index = 0; index < 100; index += 1) {
        const activity = (await client.query(
          'SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1', [writerPid],
        )).rows[0]
        if (activity?.wait_event_type === 'Lock') {
          writerBlocked = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      expect(writerBlocked).toBe(true)
      await client.query('SELECT pg_advisory_unlock($1)', [barrierKey])
      barrierHeld = false
      await Promise.all([repair, annotation])

      expect((await client.query(`SELECT state.guess_annotations,state.careless_annotations
        FROM public.user_outcome_state AS state
        JOIN public.curriculum_outcomes AS outcome ON outcome.id=state.outcome_id
        WHERE state.user_id=$1 AND outcome.code='FEN-FIZ-01'`, [user])).rows[0]).toEqual({
        guess_annotations: 1, careless_annotations: 0,
      })
    } finally {
      if (barrierHeld) await client.query('SELECT pg_advisory_unlock($1)', [barrierKey])
      await Promise.allSettled([repair, annotation].filter(Boolean))
      await writerClient?.end()
      await annotationClient.end()
    }
  })

  it('preserves operator retirement and later taxonomy metadata on replay', async () => {
    await client.query(`UPDATE public.curriculum_scope_releases
      SET release_status='retired' WHERE game='matematik' AND display_exam_ref='TYT'`)
    await client.query(`UPDATE public.curriculum_scope_releases
      SET release_status='released',taxonomy_version='ba-tyt-sosyal-v2',released_at=clock_timestamp()
      WHERE game='sosyal' AND display_exam_ref='TYT'`)

    await client.query(registryMigration)
    expect((await client.query(`SELECT release_status,taxonomy_version
      FROM public.curriculum_scope_releases WHERE game='matematik' AND display_exam_ref='TYT'`)).rows[0]).toEqual({
      release_status: 'retired', taxonomy_version: 'ba-tyt-math-v1',
    })
    expect((await client.query(`SELECT release_status,taxonomy_version
      FROM public.curriculum_scope_releases WHERE game='sosyal' AND display_exam_ref='TYT'`)).rows[0]).toEqual({
      release_status: 'released', taxonomy_version: 'ba-tyt-sosyal-v2',
    })

    await client.query(`UPDATE public.curriculum_scope_releases
      SET release_status='released',taxonomy_version='ba-tyt-math-v2',released_at=clock_timestamp()
      WHERE game='matematik' AND display_exam_ref='TYT'`)
    await client.query(registryMigration)
    expect((await client.query(`SELECT release_status,taxonomy_version
      FROM public.curriculum_scope_releases WHERE game='matematik' AND display_exam_ref='TYT'`)).rows[0]).toEqual({
      release_status: 'released', taxonomy_version: 'ba-tyt-math-v2',
    })

    const repairRunsBeforeRetirement = (await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key='181_tyt_fen_complete_mappings_v1'`)).rows[0].count
    await client.query(`UPDATE public.curriculum_scope_releases
      SET release_status='retired' WHERE game='fen' AND display_exam_ref='TYT'`)
    await client.query(fenReleaseMigration)
    await client.query(fenRepairMigration)
    await client.query(completeRepairMigration)
    expect((await client.query(`SELECT release_status FROM public.curriculum_scope_releases
      WHERE game='fen' AND display_exam_ref='TYT'`)).rows[0]).toEqual({ release_status: 'retired' })
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key='181_tyt_fen_complete_mappings_v1'`)).rows[0].count).toBe(repairRunsBeforeRetirement)

    await client.query(`UPDATE public.curriculum_scope_releases
      SET release_status='released',taxonomy_version='ba-tyt-fen-v2',released_at=clock_timestamp()
      WHERE game='fen' AND display_exam_ref='TYT'`)
    await client.query(fenReleaseMigration)
    await client.query(fenRepairMigration)
    await client.query(completeRepairMigration)
    expect((await client.query(`SELECT release_status,taxonomy_version
      FROM public.curriculum_scope_releases WHERE game='fen' AND display_exam_ref='TYT'`)).rows[0]).toEqual({
      release_status: 'released', taxonomy_version: 'ba-tyt-fen-v2',
    })
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.curriculum_scope_evidence_repair_runs
      WHERE repair_key='181_tyt_fen_complete_mappings_v1'`)).rows[0].count).toBe(repairRunsBeforeRetirement)

    await client.query(`UPDATE public.curriculum_scope_releases
      SET release_status='released',taxonomy_version='ba-tyt-fen-v1',released_at=clock_timestamp()
      WHERE game='fen' AND display_exam_ref='TYT'`)

    await client.query(fenReleaseMigration)
    await client.query(fenRepairMigration)
    await client.query(completeRepairMigration)
    expect((await client.query(`SELECT release_status FROM public.curriculum_scope_releases
      WHERE game='fen' AND display_exam_ref='TYT'`)).rows[0].release_status).toBe('released')
    expect((await client.query(
      `SELECT public.curriculum_scope_integrity('fen','TYT','ba-tyt-fen-v1') AS result`,
    )).rows[0].result).toMatchObject({ total: 5, mapped: 5, unmapped: 0, emptyOutcome: 0 })
  })
})
