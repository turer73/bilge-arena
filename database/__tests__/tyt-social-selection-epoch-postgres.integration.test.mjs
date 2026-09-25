// Opt-in acceptance for migration 212 on a loopback-only disposable PG16 DB.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const url = process.env.TYT_SOCIAL_EPOCH_TEST_DATABASE_URL
const enabled = Boolean(
  url && process.env.TYT_SOCIAL_EPOCH_TEST_DATABASE_DISPOSABLE === '1',
)
if (url) {
  const parsed = new URL(url)
  const database = decodeURIComponent(parsed.pathname.slice(1))
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)
    || !/^bilge_r44_test_[a-f0-9]{16}$/i.test(database)
  ) throw new Error('non-disposable TYT Social epoch database refused')
}

const describePg = enabled ? describe.sequential : describe.skip
const testRoot = dirname(fileURLToPath(import.meta.url))
const migrationRoot = join(testRoot, '..', 'migrations')
const fixturePath = join(
  testRoot,
  'fixtures',
  'tyt-social-selection-epoch-postgres16.sql',
)
const migration = (name) => readFileSync(join(migrationRoot, name), 'utf8')
const { Client } = pg
const POLICY = 'tyt-social-2026-v1'
const MIGRATIONS = [
  '205_tyt_social_candidate_policy_foundation.sql',
  '206_tyt_social_snapshot_issuance_boundary.sql',
  '207_tyt_social_policy_export_retention.sql',
  '208_tyt_social_mastery_reader_boundary.sql',
  '209_tyt_social_official_section_composer.sql',
  '210_tyt_social_governed_release_operations.sql',
  '212_tyt_social_learning_selection_epoch.sql',
]
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

describePg('TYT Social selection epoch on disposable PostgreSQL 16', () => {
  let client
  let governance
  let common
  let standard
  let alternate
  let main
  let aba
  let daily
  let practice
  let exam
  let race
  let noSelection

  const connect = async (applicationName) => {
    const connection = new Client({
      connectionString: url,
      application_name: applicationName,
    })
    await connection.connect()
    return connection
  }

  const addUser = async () => {
    const id = randomUUID()
    await client.query('INSERT INTO auth.users(id) VALUES($1)', [id])
    await client.query(
      'INSERT INTO public.profiles(id,deleted_at) VALUES($1,NULL)',
      [id],
    )
    return id
  }

  const addEvent = async (
    subject,
    variant,
    supersedes = null,
    connection = client,
    effectiveAt = new Date(Date.now() - 30_000),
  ) => {
    const id = randomUUID()
    await connection.query(`
      INSERT INTO public.candidate_exam_policy_events(
        id,user_id,policy_version,variant_code,notice_version,request_id,
        supersedes_event_id,effective_at,recorded_at
      ) VALUES(
        $1,$2,$3,$4,'tyt-social-choice-notice-v1',$5,$6,$7,$7
      )
    `, [id, subject, POLICY, variant, randomUUID(), supersedes, effectiveAt])
    return id
  }

  const addQuestion = async (category, examRole) => {
    const questionId = randomUUID()
    const revisionId = randomUUID()
    const candidateId = randomUUID()
    await client.query(`
      INSERT INTO public.questions(
        id,game,category,difficulty,exam_ref,is_active,published_revision_id
      ) VALUES($1,'sosyal',$2,2,'TYT',true,NULL)
    `, [questionId, category])
    await client.query(`
      INSERT INTO public.question_content_revisions(
        id,question_id,game,category,difficulty,exam_ref,status,revision_no,
        content_sha256,change_kind,prepared_by,outcomes_prepared_by,published_at
      ) VALUES(
        $1,$2,'sosyal',$3,2,'TYT','published',1,repeat('a',64),
        'legacy_import',$4,$4,clock_timestamp()
      )
    `, [revisionId, questionId, category, governance.preparer])
    await client.query(
      'UPDATE public.questions SET published_revision_id=$2 WHERE id=$1',
      [questionId, revisionId],
    )
    await client.query(`
      INSERT INTO public.question_revision_exam_role_candidates(
        id,policy_version,revision_id,proposed_role,rationale,status,
        prepared_by,prepared_at,decided_at
      ) VALUES(
        $1,$2,$3,$4,'Fixture role rationale','approved',$5,
        clock_timestamp(),clock_timestamp()
      )
    `, [candidateId, POLICY, revisionId, examRole, governance.preparer])
    await client.query(`
      INSERT INTO public.question_revision_exam_role_reviews(
        candidate_id,stage,reviewer_id,decision,rationale,request_id
      ) VALUES
        ($1,1,$2,'approved','Independent stage one',$4),
        ($1,2,$3,'approved','Independent stage two',$5)
    `, [
      candidateId,
      governance.reviewer1,
      governance.reviewer2,
      randomUUID(),
      randomUUID(),
    ])
    await client.query(`
      INSERT INTO public.question_revision_exam_roles(
        policy_version,revision_id,exam_role,candidate_id,
        stage1_reviewer_id,stage2_reviewer_id
      ) VALUES($1,$2,$3,$4,$5,$6)
    `, [
      POLICY,
      revisionId,
      examRole,
      candidateId,
      governance.reviewer1,
      governance.reviewer2,
    ])
    return questionId
  }

  const addSubject = async (variant) => {
    const user = await addUser()
    const event = variant ? await addEvent(user, variant) : null
    return { user, event }
  }

  beforeAll(async () => {
    client = await connect('tyt-social-epoch-main')
    await client.query(readFileSync(fixturePath, 'utf8'))
    for (const name of MIGRATIONS) {
      try {
        await client.query(migration(name))
      } catch (error) {
        throw new Error(
          `fixture migration failed: ${name}: ${error.code} ${error.message}`,
          { cause: error },
        )
      }
    }

    // Focused-fixture adapter for the real pre-205 revision-snapshot trigger.
    // This is test-only infrastructure and is not production/release proof.
    await client.query(`
      CREATE FUNCTION public.fixture_snapshot_verified_attempt_revisions()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
      AS $function$
      BEGIN
        INSERT INTO public.verified_attempt_question_revisions(
          attempt_id,position,question_id,revision_id,game,category,exam_ref
        )
        SELECT NEW.id,input.position::smallint,question.id,revision.id,
          revision.game,revision.category,revision.exam_ref
        FROM unnest(NEW.question_ids) WITH ORDINALITY input(question_id,position)
        JOIN public.questions question ON question.id=input.question_id
        JOIN public.question_content_revisions revision
          ON revision.id=question.published_revision_id
         AND revision.question_id=question.id AND revision.status='published';
        IF (SELECT count(*) FROM public.verified_attempt_question_revisions
            WHERE attempt_id=NEW.id)<>cardinality(NEW.question_ids) THEN
          RAISE EXCEPTION 'fixture immutable revision snapshot incomplete'
            USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END
      $function$;
      CREATE TRIGGER aaa_fixture_snapshot_verified_attempt_revisions
      AFTER INSERT ON public.verified_attempts FOR EACH ROW
      EXECUTE FUNCTION public.fixture_snapshot_verified_attempt_revisions();
    `)

    // 208/209 correctly keep the empty compatibility fixture closed. Only for
    // writer-level epoch tests, force this disposable scope row open while
    // retaining the guards. This does not claim the release gate passed.
    await client.query(`
      ALTER TABLE public.curriculum_scope_releases
        DISABLE TRIGGER trg_guard_tyt_social_mastery_scope_release;
      ALTER TABLE public.curriculum_scope_releases
        DISABLE TRIGGER trg_guard_tyt_social_official_section_release;
      UPDATE public.curriculum_scope_releases
      SET release_status='released',released_at=clock_timestamp(),
          updated_at=clock_timestamp()
      WHERE game='sosyal' AND display_exam_ref='TYT'
        AND question_exam_ref='TYT'
        AND taxonomy_version='ba-tyt-sosyal-v1';
      ALTER TABLE public.curriculum_scope_releases
        ENABLE TRIGGER trg_guard_tyt_social_mastery_scope_release;
      ALTER TABLE public.curriculum_scope_releases
        ENABLE TRIGGER trg_guard_tyt_social_official_section_release;
    `)

    governance = {
      preparer: await addUser(),
      reviewer1: await addUser(),
      reviewer2: await addUser(),
    }
    common = []
    for (let index = 0; index < 40; index += 1) {
      common.push(await addQuestion('tarih', 'common_history'))
    }
    standard = await addQuestion('din_kulturu', 'standard_religion')
    alternate = await addQuestion('felsefe', 'alternate_philosophy')

    main = await addSubject('questions_16_20')
    main.eventA = main.event
    main.eventB = await addEvent(
      main.user,
      'questions_21_25',
      main.eventA,
      client,
      new Date(),
    )
    aba = await addSubject(null)
    aba.eventA = await addEvent(
      aba.user,
      'questions_16_20',
      null,
      client,
      new Date(Date.now() - 90_000),
    )
    aba.eventB = await addEvent(
      aba.user,
      'questions_21_25',
      aba.eventA,
      client,
      new Date(Date.now() - 60_000),
    )
    aba.eventA2 = await addEvent(
      aba.user,
      'questions_16_20',
      aba.eventB,
      client,
      new Date(Date.now() - 30_000),
    )
    daily = await addSubject('questions_16_20')
    practice = await addSubject('questions_21_25')
    exam = await addSubject('questions_16_20')
    race = await addSubject('questions_16_20')
    noSelection = await addSubject(null)
  }, 120_000)

  afterAll(async () => { await client?.end() })

  it('labels the proof as focused PG16 acceptance and installs unchanged 205-210 plus 212', async () => {
    const result = await client.query(
      `SELECT current_setting('server_version_num')::integer AS version`,
    )
    expect(result.rows[0].version).toBeGreaterThanOrEqual(160000)
    expect(result.rows[0].version).toBeLessThan(170000)
    expect(MIGRATIONS).toHaveLength(7)
  })

  it('grants only the four entry points to service_role', async () => {
    const result = await client.query(`
      SELECT procedure.proname,
        has_function_privilege('service_role',procedure.oid,'EXECUTE') service_exec,
        has_function_privilege('authenticated',procedure.oid,'EXECUTE') client_exec
      FROM pg_proc procedure JOIN pg_namespace namespace
        ON namespace.oid=procedure.pronamespace
      WHERE namespace.nspname='public' AND procedure.proname IN(
        'read_tyt_social_learning_snapshot',
        'create_tyt_social_daily_plan_for_epoch',
        'issue_verified_tyt_social_attempt_for_epoch',
        'issue_verified_tyt_social_exam_attempt_for_epoch',
        'tyt_social_learning_context_at','assert_tyt_social_learning_epoch'
      )
    `)
    const entries = new Set([
      'read_tyt_social_learning_snapshot',
      'create_tyt_social_daily_plan_for_epoch',
      'issue_verified_tyt_social_attempt_for_epoch',
      'issue_verified_tyt_social_exam_attempt_for_epoch',
    ])
    expect(result.rows).toHaveLength(6)
    for (const row of result.rows) {
      expect(row.client_exec).toBe(false)
      expect(row.service_exec).toBe(entries.has(row.proname))
    }
  })

  it('binds one reader snapshot to the current event and ordered candidates', async () => {
    const result = await client.query(
      'SELECT public.read_tyt_social_learning_snapshot($1,$2::uuid[]) value',
      [main.user, [standard, common[0], alternate, common[0]]],
    )
    expect(result.rows[0].value.context).toMatchObject({
      available: true,
      variant: 'questions_21_25',
      selectionEventId: main.eventB,
      legacyAggregateUsed: false,
    })
    expect(result.rows[0].value.allowedQuestionIds).toEqual([common[0], alternate])
  })

  it('rejects a null user', async () => {
    await expect(client.query(
      'SELECT public.read_tyt_social_learning_snapshot(NULL,$1::uuid[])',
      [[]],
    )).rejects.toMatchObject({ code: '22023' })
  })

  it('rejects a null question array', async () => {
    await expect(client.query(
      'SELECT public.read_tyt_social_learning_snapshot($1,NULL)',
      [main.user],
    )).rejects.toMatchObject({ code: '22023' })
  })

  it('rejects an authenticated actor mismatch before resolving data', async () => {
    await client.query('BEGIN')
    try {
      await client.query(
        `SELECT set_config('request.jwt.claim.sub',$1,true)`,
        [governance.reviewer1],
      )
      await expect(client.query(
        'SELECT public.read_tyt_social_learning_snapshot($1,$2::uuid[])',
        [main.user, []],
      )).rejects.toMatchObject({ code: '42501' })
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('requires READ COMMITTED for epoch writes', async () => {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
    try {
      await expect(client.query(
        'SELECT public.assert_tyt_social_learning_epoch($1,$2,$3)',
        [main.user, POLICY, main.eventB],
      )).rejects.toMatchObject({ code: '25000' })
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('rejects a stale event and treats A-B-A as a new epoch', async () => {
    await expect(client.query(
      'SELECT public.assert_tyt_social_learning_epoch($1,$2,$3)',
      [main.user, POLICY, main.eventA],
    )).rejects.toMatchObject({ code: '40001' })
    await expect(client.query(
      'SELECT public.assert_tyt_social_learning_epoch($1,$2,$3)',
      [aba.user, POLICY, aba.eventA],
    )).rejects.toMatchObject({ code: '40001' })
    await expect(client.query(
      'SELECT public.assert_tyt_social_learning_epoch($1,$2,$3)',
      [aba.user, POLICY, aba.eventA2],
    )).resolves.toBeTruthy()
  })

  it('creates a plan at one epoch and refuses to rewrite it after a new selection', async () => {
    const items = JSON.stringify([{
      position: 1,
      question_id: common[0],
      slot_type: 'student_choice',
      source_type: 'student_choice',
    }])
    const first = await client.query(`
      SELECT public.create_tyt_social_daily_plan_for_epoch(
        $1,CURRENT_DATE,$2::jsonb,$3,$4
      ) value
    `, [daily.user, items, POLICY, daily.event])
    const planId = first.rows[0].value.planId
    const later = await addEvent(
      daily.user,
      'questions_21_25',
      daily.event,
      client,
      new Date(),
    )
    await expect(client.query(`
      SELECT public.create_tyt_social_daily_plan_for_epoch(
        $1,CURRENT_DATE,$2::jsonb,$3,$4
      )
    `, [daily.user, items, POLICY, later])).rejects.toMatchObject({ code: '40001' })
    const row = await client.query(`
      SELECT header.selection_event_id,plan.question_ids
      FROM public.daily_plan plan JOIN public.daily_plan_candidate_policy_snapshots header
        ON header.plan_id=plan.id WHERE plan.id=$1
    `, [planId])
    expect(row.rows[0]).toEqual({
      selection_event_id: daily.event,
      question_ids: [common[0]],
    })
  })

  it('issues and idempotently replays a practice attempt at the exact epoch', async () => {
    const request = randomUUID()
    const sql = `SELECT public.issue_verified_tyt_social_attempt_for_epoch(
      $1,'practice',$2::uuid[],600,$3,$4,$5
    ) value`
    const parameters = [
      practice.user, [common[1], alternate], request, POLICY, practice.event,
    ]
    const first = await client.query(sql, parameters)
    const second = await client.query(sql, parameters)
    expect(first.rows[0].value).toMatchObject({
      variant: 'questions_21_25', artifactKind: 'practice', replayed: false,
    })
    expect(second.rows[0].value).toMatchObject({
      attemptId: first.rows[0].value.attemptId, replayed: true,
    })
    const row = await client.query(`
      SELECT count(*)::integer count,min(selection_event_id::text) event
      FROM public.verified_attempt_candidate_policy_snapshots
      WHERE user_id=$1 AND issue_request_id=$2
    `, [practice.user, request])
    expect(row.rows[0]).toEqual({ count: 1, event: practice.event })
  })

  it('issues a real 40-question smart mock at the exact epoch', async () => {
    const request = randomUUID()
    const items = common.map((questionId, position) => ({
      position, questionId, sourceBucket: 'coverage',
    }))
    const result = await client.query(`
      SELECT public.issue_verified_tyt_social_exam_attempt_for_epoch(
        $1,'tyt-social-smart-v1',$2::jsonb,3601,3600,$3,$4,$5
      ) value
    `, [exam.user, JSON.stringify(items), request, POLICY, exam.event])
    expect(result.rows[0].value).toMatchObject({
      status: 'issued', plannedDurationSec: 3600, replayed: false,
    })
    const row = await client.query(`
      SELECT header.selection_event_id,count(item.*)::integer count
      FROM public.verified_attempt_candidate_policy_snapshots header
      JOIN public.verified_exam_attempt_items item ON item.attempt_id=header.attempt_id
      WHERE header.user_id=$1 AND header.issue_request_id=$2
      GROUP BY header.selection_event_id
    `, [exam.user, request])
    expect(row.rows[0]).toEqual({ selection_event_id: exam.event, count: 40 })
  })

  it('detects an event committed during a policy-lock wait and writes nothing', async () => {
    const blocker = await connect('tyt-social-epoch-blocker')
    const contenderName = `tyt-social-epoch-contender-${randomUUID()}`
    const contender = await connect(contenderName)
    const request = randomUUID()
    let blockerOpen = false
    try {
      await blocker.query('BEGIN')
      blockerOpen = true
      await blocker.query(`
        SELECT pg_advisory_xact_lock(
          hashtextextended('tyt-social-policy:'||$1::text||':'||$2,205)
        )
      `, [race.user, POLICY])
      let settled = false
      const pending = contender.query(`
        SELECT public.issue_verified_tyt_social_attempt_for_epoch(
          $1,'practice',$2::uuid[],600,$3,$4,$5
        )
      `, [race.user, [common[2]], request, POLICY, race.event]).then(
        (value) => { settled = true; return { ok: true, value } },
        (error) => { settled = true; return { ok: false, error } },
      )
      let waiting = false
      for (let index = 0; index < 120; index += 1) {
        const activity = await client.query(`
          SELECT wait_event_type FROM pg_stat_activity WHERE application_name=$1
        `, [contenderName])
        if (activity.rows[0]?.wait_event_type === 'Lock') { waiting = true; break }
        if (settled) break
        await sleep(25)
      }
      expect(waiting).toBe(true)
      await addEvent(
        race.user,
        'questions_21_25',
        race.event,
        blocker,
        new Date(),
      )
      await blocker.query('COMMIT')
      blockerOpen = false
      const result = await pending
      expect(result.ok).toBe(false)
      expect(result.error).toMatchObject({ code: '40001' })
      const row = await client.query(`
        SELECT count(*)::integer count
        FROM public.verified_attempt_candidate_policy_snapshots
        WHERE user_id=$1 AND issue_request_id=$2
      `, [race.user, request])
      expect(row.rows[0].count).toBe(0)
    } finally {
      if (blockerOpen) await blocker.query('ROLLBACK')
      await contender.end()
      await blocker.end()
    }
  }, 30_000)

  it('returns no learning data when selection is unavailable', async () => {
    const result = await client.query(
      'SELECT public.read_tyt_social_learning_snapshot($1,$2::uuid[]) value',
      [noSelection.user, common],
    )
    expect(result.rows[0].value.context).toMatchObject({
      available: false, status: 'setup_required', reason: 'selection-required',
    })
    expect(result.rows[0].value.states).toEqual([])
    expect(result.rows[0].value.allowedQuestionIds).toEqual([])
  })
})
