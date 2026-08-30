import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const url = process.env.INSTITUTION_PILOT_TEST_DATABASE_URL
const parsedUrl = url ? new URL(url) : null
if (url && process.env.INSTITUTION_PILOT_TEST_DATABASE_DISPOSABLE !== '1') {
  throw new Error('Set INSTITUTION_PILOT_TEST_DATABASE_DISPOSABLE=1')
}
if (parsedUrl && !['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname)) {
  throw new Error('Refusing non-local institution-pilot database')
}
if (parsedUrl && !/^bilge_inst_test_[a-z0-9_]+$/i.test(parsedUrl.pathname.slice(1))) {
  throw new Error('Refusing non-disposable institution-pilot database')
}

const suite = url && process.env.INSTITUTION_PILOT_TEST_DATABASE_DISPOSABLE === '1'
  ? describe
  : describe.skip
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const classroomSql = readFileSync(join(migrationsDir, '105_teacher_classroom_privacy.sql'), 'utf8')
const institutionSql = readFileSync(join(migrationsDir, '112_institution_pilot_foundation.sql'), 'utf8')
const institutionTrackingSql = readdirSync(migrationsDir)
  .filter((name) => /^(11[3-9]|12[0-7])_.*\.sql$/.test(name) || name === '131_institution_tenant_rbac.sql')
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), 'utf8') }))
const roleSeparationSql = readFileSync(
  join(migrationsDir, '132_institution_platform_role_separation.sql'),
  'utf8',
)
const institutionPanelSql = readFileSync(
  join(migrationsDir, '133_institution_panel_classroom_management.sql'),
  'utf8',
)
const teacherLifecycleSql = readFileSync(
  join(migrationsDir, '134_institution_teacher_lifecycle_guards.sql'),
  'utf8',
)
const managerTeacherRoleSql = readFileSync(
  join(migrationsDir, '135_institution_manager_teacher_role.sql'),
  'utf8',
)
const institutionOperationsSql = readFileSync(
  join(migrationsDir, '145_institution_operations_governance.sql'),
  'utf8',
)
const institutionAuditSql = readFileSync(
  join(migrationsDir, '149_institution_critical_operation_audit.sql'),
  'utf8',
)
const authenticatedBoundarySql = readFileSync(
  join(migrationsDir, '150_authenticated_institution_rpc_boundary.sql'),
  'utf8',
)
const institutionLifecycleSql = readFileSync(
  join(migrationsDir, '151_institution_lifecycle_control.sql'),
  'utf8',
)
const institutionRetentionSql = readFileSync(
  join(migrationsDir, '152_institution_request_ledger_retention.sql'),
  'utf8',
)
const institutionReviewClosureSql = readFileSync(
  join(migrationsDir, '154_institution_review_closure.sql'),
  'utf8',
)
const institutionSecurityFollowupSql = readFileSync(
  join(migrationsDir, '155_institution_security_review_followup.sql'),
  'utf8',
)
const accountExportReportPrivacySql = readFileSync(
  join(migrationsDir, '156_account_export_report_privacy.sql'),
  'utf8',
)
const invitationOnlyFreePilotSql = readFileSync(
  join(migrationsDir, '158_invitation_only_free_institution_pilot.sql'),
  'utf8',
)
const freePilotExpiryRpcClosureSql = readFileSync(
  join(migrationsDir, '159_free_pilot_expiry_rpc_closure.sql'),
  'utf8',
)
const freePilotReplayAndStudentSurfaceSql = readFileSync(
  join(migrationsDir, '160_free_pilot_replay_and_student_surface_closure.sql'),
  'utf8',
)
const freePilotReadinessEvidenceGateSql = readFileSync(
  join(migrationsDir, '167_free_pilot_readiness_evidence_gate.sql'),
  'utf8',
)
const freePilotClosedGateReplaySql = readFileSync(
  join(migrationsDir, '168_free_pilot_closed_gate_replay.sql'),
  'utf8',
)
const institutionScopeAlignmentSql = readFileSync(
  join(migrationsDir, '182_institution_math_scope_registry_alignment.sql'),
  'utf8',
)
const institutionTaxonomyConsumersSql = readFileSync(
  join(migrationsDir, '183_institution_taxonomy_consumer_alignment.sql'),
  'utf8',
)
const institutionMultiScopeSql = readFileSync(
  join(migrationsDir, '194_institution_multi_scope_learning_analysis.sql'),
  'utf8',
)
const adaptiveDiagnosticSql = readFileSync(
  join(migrationsDir, '098_adaptive_diagnostic.sql'),
  'utf8',
)
const adaptiveDiagnosticEvidenceSql = readFileSync(
  join(migrationsDir, '140_adaptive_diagnostic_evidence_v2.sql'),
  'utf8',
)
const adaptiveDiagnosticRegistryGateSql = readFileSync(
  join(migrationsDir, '184_adaptive_diagnostic_registry_write_gate.sql'),
  'utf8',
)
const adaptiveDiagnosticV3Sql = readFileSync(
  join(migrationsDir, '193_registry_driven_adaptive_diagnostic_v3.sql'),
  'utf8',
)
const fenDiagnosticReleaseSql = readFileSync(
  join(migrationsDir, '195_release_tyt_fen_diagnostic_scope.sql'),
  'utf8',
)
const fenInstitutionReleaseSql = readFileSync(
  join(migrationsDir, '196_release_tyt_fen_institution_scope.sql'),
  'utf8',
)
const turkishDiagnosticReleaseSql = readFileSync(
  join(migrationsDir, '197_release_tyt_turkce_diagnostic_scope.sql'),
  'utf8',
)
const turkishInstitutionReleaseSql = readFileSync(
  join(migrationsDir, '198_release_tyt_turkce_institution_scope.sql'),
  'utf8',
)
const wordquestDiagnosticReleaseSql = readFileSync(
  join(migrationsDir, '199_release_ydt_english_diagnostic_scope.sql'),
  'utf8',
)
const wordquestInstitutionReleaseSql = readFileSync(
  join(migrationsDir, '200_release_ydt_english_institution_scope.sql'),
  'utf8',
)
const institutionProgramExecutionIntegritySql = readFileSync(
  join(migrationsDir, '201_institution_program_execution_integrity.sql'),
  'utf8',
)

suite('112-127, 131-135, 145, 149-160, 167-168, 182-184 and 193-201 institution pilot real PostgreSQL acceptance', () => {
  let client
  let platformAdmin
  let managerOne
  let managerTwo
  let freePilotManager
  let freePilotManagerTwo
  let freePilotStudent
  let paidPilotManagerAfterMigration
  let teacherOne
  let institutionOne
  let institutionTwo
  let managerMemberRef
  let teacherMemberRef
  let customRoleRef
  const capacityTeachers = []

  async function service(query, values = []) {
    await client.query('SET ROLE service_role')
    try {
      return await client.query(query, values)
    } finally {
      await client.query('RESET ROLE')
    }
  }

  async function rpc(expression, values = []) {
    const result = await service(`SELECT ${expression} AS result`, values)
    return result.rows[0].result
  }

  async function rpcOn(connection, expression, values = []) {
    await connection.query('SET ROLE service_role')
    try {
      const result = await connection.query(`SELECT ${expression} AS result`, values)
      return result.rows[0].result
    } finally {
      await connection.query('RESET ROLE')
    }
  }

  async function authenticatedRpc(userId, expression, values = [], aal = 'aal2') {
    await client.query('SET ROLE authenticated')
    await client.query("SELECT set_config('app.uid',$1,false)", [userId])
    await client.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: userId, aal })])
    try {
      const result = await client.query(`SELECT ${expression} AS result`, values)
      return result.rows[0].result
    } finally {
      await client.query('RESET ROLE')
      await client.query("SELECT set_config('app.uid','',false)")
      await client.query("SELECT set_config('request.jwt.claims','{}',false)")
    }
  }

  async function expectPgError(action, code) {
    let caught
    try {
      await action()
    } catch (error) {
      caught = error
    }
    expect(caught?.code).toBe(code)
  }

  async function setProvisioningControl(controlKey, enabled, changeReference) {
    await client.query('BEGIN')
    try {
      await client.query(
        "SELECT set_config('app.institution_control_change_ref',$1,true)",
        [changeReference],
      )
      await client.query(
        `UPDATE public.institution_pilot_controls
         SET enabled=$2
         WHERE control_key=$1`,
        [controlKey, enabled],
      )
      await client.query('COMMIT')
    } catch (controlError) {
      await client.query('ROLLBACK')
      throw controlError
    }
  }

  function directTenantRpcCalls(userId, institutionId) {
    const classroomId = randomUUID()
    const requestId = randomUUID()
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    return [
      ['public.get_institution_tracking_directory($1)', [userId]],
      [
        'public.get_institution_student_learning_analysis($1,$2,$3,$4,$5,$6)',
        [userId, classroomId, 'a'.repeat(32), 'matematik', 'TYT', now],
      ],
      [
        'public.get_institution_classroom_published_program_members($1,$2,$3,$4)',
        [userId, classroomId, oneHourAgo, now],
      ],
      [
        'public.get_institution_classroom_growth_metrics($1,$2,$3)',
        [userId, classroomId, now],
      ],
      [
        'public.get_institution_classroom_followup_metrics($1,$2,$3,$4)',
        [userId, classroomId, oneHourAgo, now],
      ],
      ['public.get_my_institution_support_access($1)', [userId]],
      [
        'public.grant_my_institution_support_access($1,$2,$3,$4)',
        [userId, 30, 'Kontrollü destek erişimi', requestId],
      ],
      [
        'public.publish_institution_study_program($1,$2,$3)',
        [userId, 'b'.repeat(32), requestId],
      ],
      [
        'public.update_institution_study_program_draft($1,$2,$3,$4,$5,$6)',
        [userId, 'b'.repeat(32), '2026-08-24', 30, '[]', requestId],
      ],
      [
        'public.get_my_classroom_exam_mode($1,$2,$3)',
        [userId, classroomId, institutionId],
      ],
    ]
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query(`
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA auth;
      CREATE SCHEMA public;
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
        AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
      CREATE TABLE auth.users (
        id uuid PRIMARY KEY,
        email text UNIQUE,
        email_confirmed_at timestamptz,
        deleted_at timestamptz
      );
      CREATE TABLE public.profiles (
        id uuid PRIMARY KEY,
        username varchar(64),
        display_name varchar(64),
        deleted_at timestamptz
      );
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
        role_id uuid NOT NULL REFERENCES public.roles(id),
        permission text NOT NULL,
        UNIQUE(role_id, permission)
      );
      CREATE TABLE public.user_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES public.profiles(id),
        role_id uuid NOT NULL REFERENCES public.roles(id),
        assigned_by uuid REFERENCES public.profiles(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(user_id, role_id)
      );
      INSERT INTO public.roles(slug,name,is_system)
      VALUES('super_admin','Süper Admin',true);
      CREATE TABLE public.friendships (
        user_id uuid NOT NULL,
        friend_id uuid NOT NULL,
        status text NOT NULL,
        PRIMARY KEY(user_id, friend_id)
      );
      CREATE TABLE public.questions (
        id uuid PRIMARY KEY,
        game text NOT NULL,
        category text,
        topic text,
        difficulty smallint,
        content jsonb NOT NULL,
        is_active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE public.verified_attempts(id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE public.game_sessions(id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE public.session_answers(
        id uuid PRIMARY KEY,
        session_id uuid,
        answered_at timestamptz NOT NULL DEFAULT clock_timestamp()
      );
      CREATE TABLE public.curriculum_nodes(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        parent_id uuid,
        code text UNIQUE NOT NULL,
        title text NOT NULL,
        node_type text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        game text NOT NULL,
        exam_ref text,
        taxonomy_version text NOT NULL,
        category text
      );
      CREATE TABLE public.curriculum_outcomes(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text UNIQUE NOT NULL,
        node_id uuid,
        title text NOT NULL DEFAULT 'Test outcome',
        category text,
        sort_order integer NOT NULL DEFAULT 1,
        game text NOT NULL,
        exam_ref text,
        taxonomy_version text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.mastery_outcome_evidence(
        answer_id uuid NOT NULL,
        attempt_id uuid NOT NULL,
        user_id uuid NOT NULL,
        outcome_id uuid NOT NULL,
        is_correct boolean NOT NULL DEFAULT false,
        mapping_weight numeric NOT NULL DEFAULT 1,
        delayed_correct boolean NOT NULL DEFAULT false,
        difficulty_weighted_earned numeric NOT NULL DEFAULT 0,
        difficulty_weighted_possible numeric NOT NULL DEFAULT 0,
        time_taken_sec integer,
        fast_wrong boolean NOT NULL DEFAULT false,
        max_hint_stage integer NOT NULL DEFAULT 0
      );
      CREATE TABLE public.review_cards(id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE public.review_logs(id uuid PRIMARY KEY, user_id uuid, answer_id uuid);
      CREATE TABLE public.review_error_annotations(
        review_log_id uuid NOT NULL,
        reason_code text NOT NULL
      );
      CREATE TABLE public.user_outcome_state(id uuid PRIMARY KEY);
      CREATE TABLE public.xp_log(id uuid PRIMARY KEY);
      CREATE TABLE public.reward_ledger(id uuid PRIMARY KEY);
      CREATE TABLE public.daily_quests(id uuid PRIMARY KEY);
      CREATE TABLE public.achievements(id uuid PRIMARY KEY);
      CREATE TABLE public.weekly_learning_league_contributions(id uuid PRIMARY KEY);
    `)
    await client.query(classroomSql)

    // Migration 112 must stop before inventing a tenant for any legacy row.
    // The failing transaction is rolled back, then the disposable fixture is
    // cleared so the normal acceptance path can continue.
    const legacyTeacher = randomUUID()
    await client.query(
      'INSERT INTO public.profiles(id,username,display_name) VALUES($1,$2,$3)',
      [legacyTeacher, 'legacy-teacher', 'Legacy Teacher'],
    )
    await client.query(
      'INSERT INTO public.teacher_classrooms(teacher_id,name) VALUES($1,$2)',
      [legacyTeacher, 'Legacy Classroom'],
    )
    let legacyFailure
    try {
      await client.query(institutionSql)
    } catch (error) {
      legacyFailure = error
    }
    expect(legacyFailure?.code).toBe('23514')
    expect(legacyFailure?.message).toContain('explicit migration required')
    await client.query('ROLLBACK')
    await client.query('DELETE FROM public.teacher_classrooms WHERE teacher_id=$1', [legacyTeacher])
    await client.query('DELETE FROM public.profiles WHERE id=$1', [legacyTeacher])
    await client.query(institutionSql)
    for (const migration of institutionTrackingSql) {
      try {
        await client.query(migration.sql)
      } catch (error) {
        throw new Error(`Failed to compile ${migration.name}: ${error.message}`, { cause: error })
      }
    }

    platformAdmin = randomUUID()
    managerOne = randomUUID()
    managerTwo = randomUUID()
    freePilotManager = randomUUID()
    freePilotManagerTwo = randomUUID()
    freePilotStudent = randomUUID()
    paidPilotManagerAfterMigration = randomUUID()
    teacherOne = randomUUID()
    for (let index = 0; index < 6; index += 1) capacityTeachers.push(randomUUID())
    // Preserve the historical fixture indexes/e-mails used by later tests;
    // the free-pilot manager is appended so existing pilot-N addresses do not shift.
    const users = [
      platformAdmin,
      managerOne,
      managerTwo,
      teacherOne,
      ...capacityTeachers,
      freePilotManager,
      freePilotStudent,
      freePilotManagerTwo,
      paidPilotManagerAfterMigration,
    ]
    for (const [index, userId] of users.entries()) {
      await client.query(
        'INSERT INTO public.profiles(id,username,display_name) VALUES($1,$2,$3)',
        [userId, `pilot-${index}`, `Pilot ${index}`],
      )
      await client.query(
        'INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())',
        [userId, `pilot-${index}@example.com`],
      )
    }
    await client.query(
      `INSERT INTO public.user_roles(user_id,role_id)
       SELECT $1, id FROM public.roles WHERE slug='super_admin'`,
      [platformAdmin],
    )
  })

  afterAll(async () => {
    await client?.end()
  })

  it('allows only a platform administrator to provision a replay-safe tenant', async () => {
    await expectPgError(
      () => rpc('public.provision_pilot_institution($1,$2,$3,$4)', [
        managerOne, 'Yetkisiz Kurum', managerOne, randomUUID(),
      ]),
      '42501',
    )

    const requestId = randomUUID()
    const provisioned = await rpc('public.provision_pilot_institution($1,$2,$3,$4)', [
      platformAdmin, 'Bilge Pilot Bir', managerOne, requestId,
    ])
    institutionOne = provisioned.institution.id
    managerMemberRef = provisioned.membership.memberRef
    expect(provisioned).toMatchObject({
      replayed: false,
      institution: { name: 'Bilge Pilot Bir', staffLimit: 6, studentLimit: 200 },
      membership: { role: 'manager' },
    })

    const legacyManagerRole = await client.query(
      `SELECT count(*)::int AS count
       FROM public.user_roles AS user_role
       JOIN public.roles AS role ON role.id = user_role.role_id
       WHERE user_role.user_id = $1 AND role.slug = 'teacher_pilot'`,
      [managerOne],
    )
    expect(legacyManagerRole.rows[0].count).toBe(1)

    await client.query(roleSeparationSql)
    await client.query(institutionPanelSql)
    await client.query(teacherLifecycleSql)
    await client.query(managerTeacherRoleSql)
    await client.query(institutionOperationsSql)
    await client.query(institutionAuditSql)
    await client.query(authenticatedBoundarySql)
    await client.query(institutionLifecycleSql)
    // Migration 136 belongs to the question-governance chain and is not loaded
    // by this focused suite. Its trigger function is stubbed so migration 152's
    // forward REVOKE and retention function still compile on real PostgreSQL.
    await client.query(`
      CREATE FUNCTION public.tg_require_question_validation_decision()
      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
      AS $$ BEGIN RETURN NEW; END $$
    `)
    await client.query(institutionRetentionSql)
    await client.query(institutionReviewClosureSql)
    await client.query(institutionSecurityFollowupSql)
    await client.query(accountExportReportPrivacySql)
    await client.query(invitationOnlyFreePilotSql)
    await client.query(freePilotExpiryRpcClosureSql)
    await client.query(freePilotReplayAndStudentSurfaceSql)
    // A committed migration whose ledger write was lost must be safe to retry.
    await client.query(invitationOnlyFreePilotSql)
    await client.query(freePilotExpiryRpcClosureSql)
    await client.query(freePilotReplayAndStudentSurfaceSql)
    await client.query(freePilotReadinessEvidenceGateSql)
    await client.query(freePilotReadinessEvidenceGateSql)
    await client.query(freePilotClosedGateReplaySql)
    await client.query(freePilotClosedGateReplaySql)
    // Migration 178 owns this registry in the full schema. This institution-
    // focused fixture needs the row type so migrations 182-183 can compile and
    // replay against the real migration-159 wrapper contract.
    await client.query(`CREATE TABLE public.curriculum_scope_releases (
      game text NOT NULL,
      display_exam_ref text NOT NULL,
      question_exam_ref text,
      taxonomy_version text NOT NULL,
      release_status text NOT NULL,
      diagnostic_enabled boolean NOT NULL DEFAULT false,
      PRIMARY KEY(game, display_exam_ref)
    )`)
    await client.query(`INSERT INTO public.curriculum_scope_releases(
      game,display_exam_ref,question_exam_ref,taxonomy_version,release_status,diagnostic_enabled
    ) VALUES('matematik','TYT','TYT','ba-tyt-math-v1','released',true)`)
    await client.query(`INSERT INTO public.curriculum_outcomes(
      code,title,category,sort_order,game,exam_ref,taxonomy_version,is_active
    ) VALUES(
      'MAT-TEST-01','Matematik Kazanımı','temel',1,
      'matematik','TYT','ba-tyt-math-v1',true
    )`)
    await client.query(institutionScopeAlignmentSql)
    await client.query(institutionScopeAlignmentSql)
    await client.query(institutionTaxonomyConsumersSql)
    await client.query(institutionTaxonomyConsumersSql)

    const alignedDefinitions = (await client.query(`SELECT
      pg_get_functiondef('public.get_institution_student_learning_analysis(uuid,uuid,text,text,text,timestamptz)'::regprocedure) AS guarded,
      pg_get_functiondef('public.free_pilot_legacy_learning_analysis(uuid,uuid,text,text,text,timestamptz)'::regprocedure) AS projection
    `)).rows[0]
    expect(alignedDefinitions.guarded).toContain('institution_pilot_assert_operational_actor')
    expect(alignedDefinitions.guarded).toContain('free_pilot_legacy_learning_analysis')
    expect(alignedDefinitions.projection).toContain('curriculum_scope_releases')
    expect(alignedDefinitions.projection).toContain('v_scope.taxonomy_version')

    // The focused institution fixture does not load migration 178's question
    // graph. A controllable integrity oracle lets migration 194 prove its own
    // locking/capability behavior while the curriculum suite covers the real
    // eight-field implementation.
    await client.query(`
      CREATE TABLE public.test_curriculum_scope_integrity(
        game text NOT NULL,
        display_exam_ref text NOT NULL,
        taxonomy_version text NOT NULL,
        result jsonb NOT NULL,
        PRIMARY KEY(game, display_exam_ref, taxonomy_version)
      );
      INSERT INTO public.test_curriculum_scope_integrity(
        game, display_exam_ref, taxonomy_version, result
      ) VALUES(
        'matematik', 'TYT', 'ba-tyt-math-v1',
        '{"total":1,"mapped":1,"unmapped":0,"scopeMismatch":0,"nodeOrphan":0,"outcomeOrphan":0,"primaryMismatch":0,"emptyOutcome":0}'::jsonb
      );
      CREATE FUNCTION public.curriculum_scope_integrity(
        p_game text, p_display_exam_ref text, p_taxonomy_version text
      ) RETURNS jsonb
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
      AS $$
        SELECT proof.result
        FROM public.test_curriculum_scope_integrity AS proof
        WHERE proof.game = p_game
          AND proof.display_exam_ref = p_display_exam_ref
          AND proof.taxonomy_version = p_taxonomy_version
      $$;
    `)
    await client.query(institutionMultiScopeSql)
    await client.query(institutionMultiScopeSql)

    const legacyRpcPrivileges = await client.query(`
      SELECT
        p.proname,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('public', p.oid, 'EXECUTE') AS public
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'free_pilot_legacy_%'
      ORDER BY p.proname
    `)
    expect(legacyRpcPrivileges.rows).toHaveLength(15)
    for (const privilege of legacyRpcPrivileges.rows) {
      expect(privilege).toMatchObject({
        authenticated: false,
        service_role: false,
        anon: false,
        public: false,
      })
    }

    const guardedRpcNames = [
      'get_institution_tracking_directory',
      'get_institution_student_learning_analysis',
      'get_institution_classroom_published_program_members',
      'get_institution_classroom_growth_metrics',
      'get_institution_classroom_followup_metrics',
      'get_my_institution_support_access',
      'grant_my_institution_support_access',
      'publish_institution_study_program',
      'update_institution_study_program_draft',
      'get_my_classroom_exam_mode',
      'transfer_my_pilot_institution_manager',
      'resolve_institution_student_followup',
      'review_institution_study_program',
      'submit_teacher_assignment',
      'accept_teacher_classroom_invite',
    ]
    const guardedRpcPrivileges = await client.query(`
      SELECT
        p.proname,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('public', p.oid, 'EXECUTE') AS public
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])
        AND NOT (p.proname = 'get_institution_classroom_growth_metrics' AND p.pronargs = 4)
      ORDER BY p.proname
    `, [guardedRpcNames])
    expect(guardedRpcPrivileges.rows).toHaveLength(guardedRpcNames.length)
    for (const privilege of guardedRpcPrivileges.rows) {
      expect(privilege).toMatchObject({
        authenticated: true,
        service_role: true,
        anon: false,
        public: false,
      })
    }
    expect((await client.query(`SELECT
      has_function_privilege('authenticated',
        'public.get_institution_classroom_growth_metrics(uuid,uuid,timestamptz,text)', 'EXECUTE') AS authenticated,
      has_function_privilege('service_role',
        'public.get_institution_classroom_growth_metrics(uuid,uuid,timestamptz,text)', 'EXECUTE') AS service_role,
      has_function_privilege('anon',
        'public.get_institution_classroom_growth_metrics(uuid,uuid,timestamptz,text)', 'EXECUTE') AS anon
    `)).rows[0]).toEqual({ authenticated: false, service_role: true, anon: false })

    const serviceOnlyStudentPrivileges = await client.query(`
      SELECT
        p.proname,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN ('get_my_institution_study_programs', 'get_my_assistance_policy')
      ORDER BY p.proname
    `)
    expect(serviceOnlyStudentPrivileges.rows).toEqual([
      { proname: 'get_my_assistance_policy', authenticated: false, service_role: true },
      { proname: 'get_my_institution_study_programs', authenticated: false, service_role: true },
    ])

    const authenticatedBoundary = await client.query(`
      SELECT
        count(*) FILTER (WHERE has_function_privilege('authenticated', p.oid, 'EXECUTE'))::int
          AS authenticated_count,
        count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE'))::int
          AS anon_count,
        count(*) FILTER (WHERE has_function_privilege('public', p.oid, 'EXECUTE'))::int
          AS public_count
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'get_my_pilot_institution',
          'get_my_teacher_classrooms',
          'create_my_institution_classroom'
        )
    `)
    expect(authenticatedBoundary.rows[0]).toEqual({
      authenticated_count: 3,
      anon_count: 0,
      public_count: 0,
    })

    const separatedManagerRoles = await client.query(
      `SELECT role.slug, array_agg(permission.permission ORDER BY permission.permission) AS permissions
       FROM public.user_roles AS user_role
       JOIN public.roles AS role ON role.id = user_role.role_id
       LEFT JOIN public.role_permissions AS permission ON permission.role_id = role.id
       WHERE user_role.user_id = $1
       GROUP BY role.slug`,
      [managerOne],
    )
    expect(separatedManagerRoles.rows).toEqual([
      {
        slug: 'institution_pilot_staff',
        permissions: ['institution.pilot.access', 'teacher.classrooms.manage'],
      },
    ])
    const managerTeacherGuard = await client.query(
      'SELECT public.teacher_classroom_is_teacher($1) AS allowed',
      [managerOne],
    )
    expect(managerTeacherGuard.rows[0].allowed).toBe(false)
    await expectPgError(
      () => authenticatedRpc(
        platformAdmin,
        'public.list_pilot_institutions($1)',
        [platformAdmin],
        'aal1',
      ),
      '42501',
    )

    expect(await rpc('public.provision_pilot_institution($1,$2,$3,$4)', [
      platformAdmin, 'Bilge Pilot Bir', managerOne, requestId,
    ])).toMatchObject({ replayed: true, institution: { id: institutionOne } })
    await expectPgError(
      () => rpc('public.provision_pilot_institution($1,$2,$3,$4)', [
        platformAdmin, 'Farklı İsim', managerOne, requestId,
      ]),
      '22023',
    )
  })

  it('enforces exact multi-scope institution analysis, tenant isolation and 3-person aggregate privacy', async () => {
    await client.query('BEGIN')
    try {
      async function expectServiceError(query, values, code) {
        await client.query('SAVEPOINT expected_scope_error')
        await client.query('SET ROLE service_role')
        let caught
        try {
          await client.query(query, values)
        } catch (error) {
          caught = error
        }
        await client.query('ROLLBACK TO SAVEPOINT expected_scope_error')
        await client.query('RESET ROLE')
        await client.query('RELEASE SAVEPOINT expected_scope_error')
        expect(caught?.code).toBe(code)
      }
      async function expectAuthenticatedScopeError(userId, query, values, code, aal = 'aal2') {
        await client.query('SAVEPOINT expected_authenticated_scope_error')
        await client.query('SET ROLE authenticated')
        await client.query("SELECT set_config('app.uid',$1,false)", [userId])
        await client.query("SELECT set_config('request.jwt.claims',$1,false)", [
          JSON.stringify({ sub: userId, aal }),
        ])
        let caught
        try {
          await client.query(query, values)
        } catch (error) {
          caught = error
        }
        await client.query('ROLLBACK TO SAVEPOINT expected_authenticated_scope_error')
        await client.query('RESET ROLE')
        await client.query("SELECT set_config('app.uid','',false)")
        await client.query("SELECT set_config('request.jwt.claims','{}',false)")
        await client.query('RELEASE SAVEPOINT expected_authenticated_scope_error')
        expect(caught?.code).toBe(code)
      }
      async function expectOwnerError(query, values, code) {
        await client.query('SAVEPOINT expected_owner_scope_error')
        let caught
        try {
          await client.query(query, values)
        } catch (error) {
          caught = error
        }
        await client.query('ROLLBACK TO SAVEPOINT expected_owner_scope_error')
        await client.query('RELEASE SAVEPOINT expected_owner_scope_error')
        expect(caught?.code).toBe(code)
      }

      const outsider = randomUUID()
      const students = Array.from({ length: 7 }, () => randomUUID())
      for (const [index, userId] of [outsider, ...students].entries()) {
        await client.query(
          'INSERT INTO public.profiles(id,username,display_name) VALUES($1,$2,$3)',
          [userId, `scope-${index}`, `Scope ${index}`],
        )
        await client.query(
          'INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())',
          [userId, `scope-${index}@example.com`],
        )
      }
      const outsideTenant = (await client.query(
        `INSERT INTO public.pilot_institutions(
          name,status,student_limit,staff_limit,created_by,pilot_kind
        ) VALUES('Kapsam Dışı Kurum','active',20,2,$1,'legacy')
        RETURNING id`,
        [platformAdmin],
      )).rows[0].id
      await client.query(
        `INSERT INTO public.pilot_institution_memberships(
          institution_id,user_id,role,status,assigned_by
        ) VALUES($1,$2,'manager','active',$3)`,
        [outsideTenant, outsider, platformAdmin],
      )

      const mathNodes = Array.from({ length: 4 }, () => randomUUID())
      const fenNodes = Array.from({ length: 4 }, () => randomUUID())
      await client.query(`
        INSERT INTO public.curriculum_nodes(
          id,parent_id,code,title,node_type,game,exam_ref,taxonomy_version,category
        ) VALUES
          ($1,NULL,'MAT-C','Matematik','course','matematik','TYT','ba-tyt-math-v1',NULL),
          ($2,$1,'MAT-U','Matematik Birimi','unit','matematik','TYT','ba-tyt-math-v1',NULL),
          ($3,$2,'MAT-T','Matematik Konusu','topic','matematik','TYT','ba-tyt-math-v1','temel'),
          ($4,$3,'MAT-O','Matematik Kazanımı','outcome','matematik','TYT','ba-tyt-math-v1','temel'),
          ($5,NULL,'FEN-C','Fen','course','fen','TYT','ba-tyt-fen-v1',NULL),
          ($6,$5,'FEN-U','Fen Birimi','unit','fen','TYT','ba-tyt-fen-v1',NULL),
          ($7,$6,'FEN-T','Fen Konusu','topic','fen','TYT','ba-tyt-fen-v1','fizik'),
          ($8,$7,'FEN-O','Fen Kazanımı','outcome','fen','TYT','ba-tyt-fen-v1','fizik')
      `, [...mathNodes, ...fenNodes])
      await client.query(
        `UPDATE public.curriculum_outcomes
         SET node_id=$1,title='Matematik Kazanımı',category='temel',sort_order=1
         WHERE code='MAT-TEST-01'`,
        [mathNodes[3]],
      )
      await client.query(
        `INSERT INTO public.curriculum_outcomes(
          code,node_id,title,category,sort_order,game,exam_ref,taxonomy_version,is_active
        ) VALUES('FEN-TEST-01',$1,'Fen Kazanımı','fizik',1,'fen','TYT','ba-tyt-fen-v1',true)`,
        [fenNodes[3]],
      )
      await client.query(`
        INSERT INTO public.curriculum_scope_releases(
          game,display_exam_ref,question_exam_ref,taxonomy_version,release_status,diagnostic_enabled
        ) VALUES
          ('fen','TYT','TYT','ba-tyt-fen-v1','released',false),
          ('turkce','TYT','TYT','ba-tyt-turkce-v2','released',false);
        INSERT INTO public.test_curriculum_scope_integrity(
          game,display_exam_ref,taxonomy_version,result
        ) VALUES
          ('fen','TYT','ba-tyt-fen-v1',
           '{"total":1,"mapped":1,"unmapped":0,"scopeMismatch":0,"nodeOrphan":0,"outcomeOrphan":0,"primaryMismatch":0,"emptyOutcome":0}'::jsonb),
          ('turkce','TYT','ba-tyt-turkce-v2',
           '{"total":1,"mapped":1,"unmapped":0,"scopeMismatch":0,"nodeOrphan":0,"outcomeOrphan":0,"primaryMismatch":0,"emptyOutcome":0}'::jsonb);
        INSERT INTO public.institution_scope_capabilities(
          game,display_exam_ref,question_exam_ref,taxonomy_version,
          capability_status,scope_policy_version,student_analysis_enabled,
          aggregate_enabled,report_enabled,program_enabled,released_at
        ) VALUES(
          'fen','TYT','TYT','ba-tyt-fen-v1','released','institution-scope-v1',
          true,true,false,false,clock_timestamp()
        );
      `)

      const classroom = (await client.query(
        `INSERT INTO public.teacher_classrooms(teacher_id,name,institution_id)
         VALUES($1,'Kapsam Sınıfı',$2) RETURNING id`,
        [managerOne, institutionOne],
      )).rows[0].id
      const twoPersonClassroom = (await client.query(
        `INSERT INTO public.teacher_classrooms(teacher_id,name,institution_id)
         VALUES($1,'İki Kişilik Sınıf',$2) RETURNING id`,
        [managerOne, institutionOne],
      )).rows[0].id
      const threePersonClassroom = (await client.query(
        `INSERT INTO public.teacher_classrooms(teacher_id,name,institution_id)
         VALUES($1,'Üç Kişilik Sınıf',$2) RETURNING id`,
        [managerOne, institutionOne],
      )).rows[0].id
      const outsideClassroom = (await client.query(
        `INSERT INTO public.teacher_classrooms(teacher_id,name,institution_id)
         VALUES($1,'Başka Kiracı Sınıfı',$2) RETURNING id`,
        [outsider, outsideTenant],
      )).rows[0].id

      const acceptedAt = new Date(Date.now() - 70 * 24 * 60 * 60 * 1000)
      const primaryMember = (await client.query(
        `INSERT INTO public.teacher_classroom_memberships(
          classroom_id,student_id,accepted_at
        ) VALUES($1,$2,$3) RETURNING member_ref`,
        [classroom, students[0], acceptedAt],
      )).rows[0].member_ref
      const fenOnlyMember = (await client.query(
        `INSERT INTO public.teacher_classroom_memberships(
          classroom_id,student_id,accepted_at
        ) VALUES($1,$2,$3) RETURNING id,member_ref`,
        [classroom, students[6], acceptedAt],
      )).rows[0]
      for (const studentId of students.slice(1, 3)) {
        await client.query(
          `INSERT INTO public.teacher_classroom_memberships(
            classroom_id,student_id,accepted_at
          ) VALUES($1,$2,$3)`,
          [twoPersonClassroom, studentId, acceptedAt],
        )
      }
      for (const studentId of students.slice(3, 6)) {
        await client.query(
          `INSERT INTO public.teacher_classroom_memberships(
            classroom_id,student_id,accepted_at
          ) VALUES($1,$2,$3)`,
          [threePersonClassroom, studentId, acceptedAt],
        )
      }

      const listed = await rpc('public.list_released_institution_scopes()')
      expect(listed).toEqual([
        expect.objectContaining({
          game: 'fen',
          displayExamRef: 'TYT',
          taxonomyVersion: 'ba-tyt-fen-v1',
          scopePolicyVersion: 'institution-scope-v1',
        }),
        expect.objectContaining({
          game: 'matematik',
          displayExamRef: 'TYT',
          taxonomyVersion: 'ba-tyt-math-v1',
          scopePolicyVersion: 'institution-scope-v1',
        }),
      ])

      const windowEnd = new Date()
      const math = await rpc(
        'public.get_institution_student_learning_analysis_v2($1,$2,$3,$4,$5,$6)',
        [managerOne, classroom, primaryMember, 'matematik', 'TYT', windowEnd],
      )
      const fen = await rpc(
        'public.get_institution_student_learning_analysis_v2($1,$2,$3,$4,$5,$6)',
        [managerOne, classroom, primaryMember, 'fen', 'TYT', windowEnd],
      )
      expect(math.scope).toMatchObject({
        game: 'matematik',
        examRef: 'TYT',
        taxonomyVersion: 'ba-tyt-math-v1',
        institutionReportingEnabled: true,
        modelVersion: 'institution-evidence-v2',
      })
      expect(math.outcomes.map((outcome) => outcome.code)).toEqual(['MAT-TEST-01'])
      expect(fen.scope).toMatchObject({
        game: 'fen',
        examRef: 'TYT',
        taxonomyVersion: 'ba-tyt-fen-v1',
        scopePolicyVersion: 'institution-scope-v1',
      })
      expect(fen.outcomes.map((outcome) => outcome.code)).toEqual(['FEN-TEST-01'])

      expect(await authenticatedRpc(
        managerOne,
        'public.list_released_institution_scopes()',
      )).toHaveLength(2)
      await expectAuthenticatedScopeError(
        managerOne,
        'SELECT public.list_released_institution_scopes()',
        [],
        '42501',
        'aal1',
      )

      await expectServiceError(
        'SELECT public.resolve_released_institution_scope($1,$2)',
        ['fen', 'tyt'],
        '22023',
      )
      await expectServiceError(
        'SELECT public.resolve_released_institution_scope($1,$2)',
        ['turkce', 'TYT'],
        'P0002',
      )
      await expectServiceError(
        'SELECT public.get_institution_student_learning_analysis_v2($1,$2,$3,$4,$5,$6)',
        [managerOne, outsideClassroom, primaryMember, 'matematik', 'TYT', windowEnd],
        '42501',
      )

      await client.query(
        `UPDATE public.test_curriculum_scope_integrity
         SET result=jsonb_set(result,'{unmapped}','1'::jsonb)
         WHERE game='fen' AND display_exam_ref='TYT'`,
      )

      await expectOwnerError(
        `UPDATE public.institution_scope_capabilities
         SET taxonomy_version='ba-tyt-fen-v2'
         WHERE game='fen' AND display_exam_ref='TYT'`,
        [],
        '23514',
      )
      await expectOwnerError(
        `UPDATE public.institution_scope_capabilities
         SET capability_status='validating'
         WHERE game='fen' AND display_exam_ref='TYT'`,
        [],
        '23514',
      )
      await client.query(
        `UPDATE public.test_curriculum_scope_integrity
         SET result=jsonb_set(result,'{unmapped}','0'::jsonb)
         WHERE game='fen' AND display_exam_ref='TYT'`,
      )

      const followupWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const followupOpenedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
      await client.query(
        `INSERT INTO public.institution_student_followups(
          institution_id,classroom_id,membership_id,student_id,teacher_id,
          reason_code,opened_at,game,display_exam_ref,question_exam_ref,
          taxonomy_version,scope_policy_version
        )
        SELECT $1,$2,membership.id,membership.student_id,$3,
          'support_needed',$4,'matematik','TYT','TYT',
          'ba-tyt-math-v1','institution-scope-v1'
        FROM public.teacher_classroom_memberships AS membership
        WHERE membership.classroom_id=$2 AND membership.member_ref=$5`,
        [institutionOne, classroom, managerOne, followupOpenedAt, primaryMember],
      )
      await client.query(
        `INSERT INTO public.institution_student_followups(
          institution_id,classroom_id,membership_id,student_id,teacher_id,
          reason_code,opened_at,game,display_exam_ref,question_exam_ref,
          taxonomy_version,scope_policy_version
        ) VALUES(
          $1,$2,$3,$4,$5,'inactivity',$6,'fen','TYT','TYT',
          'ba-tyt-fen-v1','institution-scope-v1'
        )`,
        [
          institutionOne, classroom, fenOnlyMember.id, students[6], managerOne,
          followupOpenedAt,
        ],
      )
      const mathFollowup = await rpc(
        'public.get_institution_classroom_followup_metrics_v2($1,$2,$3,$4,$5,$6)',
        [managerOne, classroom, 'matematik', 'TYT', followupWindowStart, windowEnd],
      )
      const fenFollowup = await rpc(
        'public.get_institution_classroom_followup_metrics_v2($1,$2,$3,$4,$5,$6)',
        [managerOne, classroom, 'fen', 'TYT', followupWindowStart, windowEnd],
      )
      expect(mathFollowup).toMatchObject({
        scope: {
          game: 'matematik', examRef: 'TYT', taxonomyVersion: 'ba-tyt-math-v1',
        },
        followedMemberRefs: [primaryMember],
      })
      expect(fenFollowup).toMatchObject({
        scope: { game: 'fen', examRef: 'TYT', taxonomyVersion: 'ba-tyt-fen-v1' },
        followedMemberRefs: [fenOnlyMember.member_ref],
      })
      expect(mathFollowup.scope).not.toHaveProperty('displayExamRef')
      expect(fenFollowup.scope).not.toHaveProperty('displayExamRef')
      const fenProgramCoverage = await rpc(
        'public.get_institution_classroom_published_program_members_v2($1,$2,$3,$4,$5,$6)',
        [managerOne, classroom, 'fen', 'TYT', followupWindowStart, windowEnd],
      )
      expect(fenProgramCoverage).toEqual({
        scope: {
          game: 'fen',
          examRef: 'TYT',
          questionExamRef: 'TYT',
          taxonomyVersion: 'ba-tyt-fen-v1',
          scopePolicyVersion: 'institution-scope-v1',
        },
        memberRefs: [],
      })
      await client.query(
        `UPDATE public.test_curriculum_scope_integrity
         SET result=jsonb_set(result,'{unmapped}','1'::jsonb)
         WHERE game='fen' AND display_exam_ref='TYT'`,
      )
      await expectServiceError(
        'SELECT public.resolve_released_institution_scope($1,$2)',
        ['fen', 'TYT'],
        '23514',
      )
      await client.query(
        `UPDATE public.test_curriculum_scope_integrity
         SET result=jsonb_set(result,'{unmapped}','0'::jsonb)
         WHERE game='fen' AND display_exam_ref='TYT'`,
      )

      const suppressed = await rpc(
        'public.get_institution_classroom_growth_metrics_v2($1,$2,$3,$4,$5)',
        [managerOne, twoPersonClassroom, 'matematik', 'TYT', windowEnd],
      )
      expect(suppressed).toMatchObject({
        supported: false,
        reason: 'insufficient_group',
        modelVersion: 'institution-growth-v2',
      })
      expect(suppressed).not.toHaveProperty('eligibleStudentCount')
      expect(suppressed).not.toHaveProperty('positiveGrowthStudentCount')
      expect(suppressed).not.toHaveProperty('excludedInsufficientCount')

      const supported = await rpc(
        'public.get_institution_classroom_growth_metrics_v2($1,$2,$3,$4,$5)',
        [managerOne, threePersonClassroom, 'matematik', 'TYT', windowEnd],
      )
      expect(supported).toMatchObject({
        supported: true,
        eligibleStudentCount: 0,
        positiveGrowthStudentCount: 0,
        excludedInsufficientCount: 3,
      })

      const privileges = (await client.query(`SELECT
        has_function_privilege('authenticated',
          'public.get_institution_student_learning_analysis_v2(uuid,uuid,text,text,text,timestamptz)',
          'EXECUTE') AS authenticated,
        has_function_privilege('service_role',
          'public.get_institution_student_learning_analysis_v2(uuid,uuid,text,text,text,timestamptz)',
          'EXECUTE') AS service_role,
        has_function_privilege('anon',
          'public.list_released_institution_scopes()',
          'EXECUTE') AS anon
      `)).rows[0]
      expect(privileges).toEqual({ authenticated: true, service_role: true, anon: false })
    } finally {
      await client.query('ROLLBACK')
      await client.query('RESET ROLE')
      await client.query("SELECT set_config('app.uid','',false)")
      await client.query("SELECT set_config('request.jwt.claims','{}',false)")
    }
  })

  it('provisions only a bounded JWT/AAL2 invitation-free pilot with one immutable audit event', async () => {
    const privileges = await client.query(`
      SELECT
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
        has_function_privilege('public', p.oid, 'EXECUTE') AS public
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'provision_free_pilot_institution'
    `)
    expect(privileges.rows).toEqual([{
      authenticated: true,
      anon: false,
      service_role: false,
      public: false,
    }])

    await expectPgError(
      () => client.query(
        `INSERT INTO public.pilot_institutions(
           name,created_by,student_limit,staff_limit,pilot_kind,review_due_at,approval_ref
         ) VALUES($1,$2,30,2,'invitation_free',now() + interval '30 days',NULL)`,
        ['Kapalı kapıda doğrudan canary', platformAdmin],
      ),
      '55000',
    )

    const expression = 'public.provision_free_pilot_institution($1,$2,$3,$4,$5,$6,$7,$8)'
    const readinessRef = 'READINESS-TEST-001'
    await expectPgError(
      () => rpc(expression, [
        platformAdmin, 'Service Role Kurumu', freePilotManager, 'PILOT-SERVICE-001', 30, 2, 30, randomUUID(),
      ]),
      '42501',
    )
    await expectPgError(
      () => authenticatedRpc(platformAdmin, expression, [
        platformAdmin, 'AAL1 Kurumu', freePilotManager, 'PILOT-AAL1-001', 30, 2, 30, randomUUID(),
      ], 'aal1'),
      '42501',
    )
    await expectPgError(
      () => authenticatedRpc(platformAdmin, expression, [
        managerOne, 'Aktör Sapması', freePilotManager, 'PILOT-ACTOR-001', 30, 2, 30, randomUUID(),
      ]),
      '42501',
    )
    await expectPgError(
      () => authenticatedRpc(platformAdmin, expression, [
        platformAdmin, 'Aşırı Kapasite', freePilotManager, 'PILOT-QUOTA-001', 41, 2, 30, randomUUID(),
      ]),
      '22023',
    )

    await expectPgError(
      () => authenticatedRpc(platformAdmin, expression, [
        platformAdmin, 'Kapalı DB Kapısı', freePilotManager, 'PILOT-GATE-001', 30, 2, 30, randomUUID(),
      ]),
      '55000',
    )
    await expectPgError(
      () => client.query(
        `UPDATE public.institution_pilot_controls
         SET enabled=true
         WHERE control_key='free_provisioning'`,
      ),
      '22023',
    )

    await client.query('BEGIN')
    try {
      await client.query(
        "SELECT set_config('app.institution_control_change_ref',$1,true)",
        ['CONTROL-TEST-NO-EVIDENCE-001'],
      )
      await expectPgError(
        () => client.query(
          `UPDATE public.institution_pilot_controls
           SET enabled=true
           WHERE control_key='free_provisioning'`,
        ),
        '55000',
      )
    } finally {
      await client.query('ROLLBACK')
    }

    const emptyReadiness = await client.query(
      `SELECT count(*)::int AS count
       FROM public.institution_free_pilot_readiness_attestations`,
    )
    expect(emptyReadiness.rows[0].count).toBe(0)
    await expectPgError(
      () => client.query(
        `INSERT INTO public.institution_free_pilot_readiness_attestations(
           readiness_ref,
           legal_approval_ref,
           institution_dpa_ref,
           retention_decision_ref,
           vendor_register_ref,
           tenant_ab_evidence_ref,
           credential_rotation_ref,
           backup_restore_ref,
           account_readiness_ref,
           accountable_owner_ref,
           valid_until
         ) VALUES(
           'READINESS-TOO-LONG-001',
           'LEGAL-TEST-EXPIRY-001',
           'DPA-TEST-EXPIRY-001',
           'RETENTION-TEST-EXPIRY-001',
           'VENDORS-TEST-EXPIRY-001',
           'TENANT-AB-TEST-EXPIRY-001',
           'DB-CREDENTIAL-TEST-EXPIRY-001',
           'RESTORE-TEST-EXPIRY-001',
           'ACCOUNTS-TEST-EXPIRY-001',
           'OWNER-TEST-EXPIRY-001',
           clock_timestamp() + interval '8 days'
         )`,
      ),
      '22023',
    )

    // Prove the readiness package is truly single-use under concurrency, not
    // only across sequential calls. Both suspended inserts bypass the separate
    // one-open-pilot index, so the control-row lock + consumption PK are the
    // only mechanisms allowed to serialize them.
    const raceReadinessRef = 'READINESS-RACE-001'
    await client.query(
      `INSERT INTO public.institution_free_pilot_readiness_attestations(
         readiness_ref,legal_approval_ref,institution_dpa_ref,
         retention_decision_ref,vendor_register_ref,tenant_ab_evidence_ref,
         credential_rotation_ref,backup_restore_ref,account_readiness_ref,
         accountable_owner_ref,valid_until
       ) VALUES(
         $1,'LEGAL-RACE-001','DPA-RACE-001','RETENTION-RACE-001',
         'VENDORS-RACE-001','TENANT-AB-RACE-001','DB-CREDENTIAL-RACE-001',
         'RESTORE-RACE-001','ACCOUNTS-RACE-001','OWNER-RACE-001',
         clock_timestamp() + interval '2 hours'
       )`,
      [raceReadinessRef],
    )
    await client.query('BEGIN')
    try {
      await client.query(
        "SELECT set_config('app.institution_control_change_ref',$1,true)",
        ['CONTROL-RACE-ENABLE-001'],
      )
      await client.query(
        "SELECT set_config('app.institution_readiness_ref',$1,true)",
        [raceReadinessRef],
      )
      await client.query(
        `UPDATE public.institution_pilot_controls
         SET enabled=true WHERE control_key='free_provisioning'`,
      )
      await client.query('COMMIT')
    } catch (controlError) {
      await client.query('ROLLBACK')
      throw controlError
    }

    const raceWriterOne = new pg.Client({ connectionString: url })
    const raceWriterTwo = new pg.Client({ connectionString: url })
    await raceWriterOne.connect()
    await raceWriterTwo.connect()
    let firstRaceInstitutionId
    try {
      await raceWriterOne.query('BEGIN')
      await raceWriterTwo.query('BEGIN')
      firstRaceInstitutionId = (await raceWriterOne.query(
        `INSERT INTO public.pilot_institutions(
           name,created_by,status,student_limit,staff_limit,pilot_kind,
           review_due_at,approval_ref
         ) VALUES(
           'Readiness Race One',$1,'suspended',1,1,'invitation_free',
           clock_timestamp() + interval '14 days','PILOT-RACE-001'
         ) RETURNING id`,
        [platformAdmin],
      )).rows[0].id

      let secondSettled = false
      const secondRace = raceWriterTwo.query(
        `INSERT INTO public.pilot_institutions(
           name,created_by,status,student_limit,staff_limit,pilot_kind,
           review_due_at,approval_ref
         ) VALUES(
           'Readiness Race Two',$1,'suspended',1,1,'invitation_free',
           clock_timestamp() + interval '14 days','PILOT-RACE-002'
         ) RETURNING id`,
        [platformAdmin],
      ).then(
        (result) => ({ result, error: null }),
        (error) => ({ result: null, error }),
      ).finally(() => { secondSettled = true })

      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(secondSettled).toBe(false)
      await raceWriterOne.query('COMMIT')
      const secondOutcome = await secondRace
      expect(secondOutcome.result).toBeNull()
      expect(secondOutcome.error?.code).toBe('55000')
    } finally {
      await raceWriterOne.query('ROLLBACK').catch(() => undefined)
      await raceWriterTwo.query('ROLLBACK').catch(() => undefined)
      await raceWriterOne.end()
      await raceWriterTwo.end()
    }
    expect((await client.query(
      `SELECT institution_id FROM public.institution_free_pilot_readiness_consumptions
       WHERE readiness_ref=$1`,
      [raceReadinessRef],
    )).rows).toEqual([{ institution_id: firstRaceInstitutionId }])

    await client.query('BEGIN')
    try {
      await client.query(
        "SELECT set_config('app.institution_control_change_ref',$1,true)",
        ['CONTROL-RACE-DISABLE-001'],
      )
      await client.query(
        `UPDATE public.institution_pilot_controls
         SET enabled=false WHERE control_key='free_provisioning'`,
      )
      await client.query('COMMIT')
    } catch (controlError) {
      await client.query('ROLLBACK')
      throw controlError
    }

    await client.query(
      `INSERT INTO public.institution_free_pilot_readiness_attestations(
         readiness_ref,
         legal_approval_ref,
         institution_dpa_ref,
         retention_decision_ref,
         vendor_register_ref,
         tenant_ab_evidence_ref,
         credential_rotation_ref,
         backup_restore_ref,
         account_readiness_ref,
         accountable_owner_ref,
         valid_until
       ) VALUES(
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp() + interval '2 hours'
       )`,
      [
        readinessRef,
        'LEGAL-TEST-001',
        'DPA-TEST-001',
        'RETENTION-TEST-001',
        'VENDORS-TEST-001',
        'TENANT-AB-TEST-001',
        'DB-CREDENTIAL-TEST-001',
        'RESTORE-TEST-001',
        'ACCOUNTS-TEST-001',
        'OWNER-TEST-001',
      ],
    )

    const readinessPrivileges = await client.query(`
      SELECT
        has_table_privilege(
          'authenticated',
          'public.institution_free_pilot_readiness_attestations',
          'SELECT'
        ) AS authenticated_attestations,
        has_table_privilege(
          'service_role',
          'public.institution_free_pilot_readiness_attestations',
          'SELECT'
        ) AS service_attestations,
        has_table_privilege(
          'authenticated',
          'public.institution_free_pilot_readiness_consumptions',
          'SELECT'
        ) AS authenticated_consumptions,
        has_table_privilege(
          'service_role',
          'public.institution_free_pilot_readiness_consumptions',
          'SELECT'
        ) AS service_consumptions
    `)
    expect(readinessPrivileges.rows[0]).toEqual({
      authenticated_attestations: false,
      service_attestations: false,
      authenticated_consumptions: false,
      service_consumptions: false,
    })
    await expectPgError(
      () => client.query(
        `UPDATE public.institution_free_pilot_readiness_attestations
         SET valid_until=valid_until + interval '1 hour'
         WHERE readiness_ref=$1`,
        [readinessRef],
      ),
      '42501',
    )
    await expectPgError(
      () => client.query(
        `DELETE FROM public.institution_free_pilot_readiness_attestations
         WHERE readiness_ref=$1`,
        [readinessRef],
      ),
      '42501',
    )

    await client.query('BEGIN')
    try {
      await client.query(
        "SELECT set_config('app.institution_control_change_ref',$1,true)",
        ['CONTROL-TEST-UNKNOWN-EVIDENCE-001'],
      )
      await client.query(
        "SELECT set_config('app.institution_readiness_ref',$1,true)",
        ['READINESS-UNKNOWN-001'],
      )
      await expectPgError(
        () => client.query(
          `UPDATE public.institution_pilot_controls
           SET enabled=true
           WHERE control_key='free_provisioning'`,
        ),
        '55000',
      )
    } finally {
      await client.query('ROLLBACK')
    }

    await client.query('BEGIN')
    try {
      await client.query(
        "SELECT set_config('app.institution_control_change_ref',$1,true)",
        ['CONTROL-TEST-ENABLE-001'],
      )
      await client.query(
        "SELECT set_config('app.institution_readiness_ref',$1,true)",
        [readinessRef],
      )
      await client.query(
        `UPDATE public.institution_pilot_controls
         SET enabled=true
         WHERE control_key='free_provisioning'`,
      )
      await client.query('COMMIT')
    } catch (controlError) {
      await client.query('ROLLBACK')
      throw controlError
    }
    const controlEvents = await client.query(
      `SELECT previous_enabled,enabled,change_reference,readiness_ref
       FROM public.institution_pilot_control_events
       WHERE control_key='free_provisioning'
       ORDER BY changed_at,id`,
    )
    expect(controlEvents.rows).toEqual([
      {
        previous_enabled: false,
        enabled: true,
        change_reference: 'CONTROL-RACE-ENABLE-001',
        readiness_ref: raceReadinessRef,
      },
      {
        previous_enabled: true,
        enabled: false,
        change_reference: 'CONTROL-RACE-DISABLE-001',
        readiness_ref: null,
      },
      {
        previous_enabled: false,
        enabled: true,
        change_reference: 'CONTROL-TEST-ENABLE-001',
        readiness_ref: readinessRef,
      },
    ])

    const requestId = randomUUID()
    await expectPgError(
      () => rpc(
        'public.provision_pilot_institution($1,$2,$3,$4)',
        [
          platformAdmin,
          'DB Kapısı Kapalı Ticari Pilot',
          paidPilotManagerAfterMigration,
          requestId,
        ],
      ),
      '55000',
    )
    await expectPgError(
      () => client.query(
        `INSERT INTO public.pilot_institutions(name,created_by,pilot_kind)
         VALUES($1,$2,'commercial')`,
        ['Doğrudan ticari tenant', platformAdmin],
      ),
      '55000',
    )
    await client.query('BEGIN')
    try {
      await client.query(
        "SELECT set_config('app.institution_control_change_ref',$1,true)",
        ['CONTROL-COMMERCIAL-ENABLE-001'],
      )
      await client.query(
        `UPDATE public.institution_pilot_controls
         SET enabled=true
         WHERE control_key='commercial_provisioning'`,
      )
      await client.query('COMMIT')
    } catch (controlError) {
      await client.query('ROLLBACK')
      throw controlError
    }
    const paidAfterMigration = await rpc(
      'public.provision_pilot_institution($1,$2,$3,$4)',
      [
        platformAdmin,
        'Migration Sonrası Ticari Pilot',
        paidPilotManagerAfterMigration,
        requestId,
      ],
    )
    const paidKind = await client.query(
      'SELECT pilot_kind FROM public.pilot_institutions WHERE id=$1',
      [paidAfterMigration.institution.id],
    )
    expect(paidKind.rows).toEqual([{ pilot_kind: 'commercial' }])
    await expectPgError(
      () => client.query(
        "UPDATE public.pilot_institutions SET pilot_kind='legacy' WHERE id=$1",
        [paidAfterMigration.institution.id],
      ),
      '23514',
    )
    await expectPgError(
      () => client.query(
        "UPDATE public.pilot_institutions SET pilot_kind='commercial' WHERE id=$1",
        [institutionOne],
      ),
      '23514',
    )
    await client.query('BEGIN')
    try {
      await client.query(
        "SELECT set_config('app.institution_control_change_ref',$1,true)",
        ['CONTROL-COMMERCIAL-DISABLE-001'],
      )
      await client.query(
        `UPDATE public.institution_pilot_controls
         SET enabled=false
         WHERE control_key='commercial_provisioning'`,
      )
      await client.query('COMMIT')
    } catch (controlError) {
      await client.query('ROLLBACK')
      throw controlError
    }
    const commercialControlEvents = await client.query(
      `SELECT previous_enabled,enabled,change_reference
       FROM public.institution_pilot_control_events
       WHERE control_key='commercial_provisioning'
       ORDER BY changed_at`,
    )
    expect(commercialControlEvents.rows).toEqual([
      {
        previous_enabled: false,
        enabled: true,
        change_reference: 'CONTROL-COMMERCIAL-ENABLE-001',
      },
      {
        previous_enabled: true,
        enabled: false,
        change_reference: 'CONTROL-COMMERCIAL-DISABLE-001',
      },
    ])

    await expectPgError(
      () => client.query(
        `INSERT INTO public.pilot_institutions(
           name,created_by,student_limit,staff_limit,pilot_kind,review_due_at,approval_ref
         ) VALUES($1,$2,30,2,'invitation_free',now() + interval '30 days',NULL)`,
        ['Onaysız ücretsiz canary', platformAdmin],
      ),
      '23514',
    )
    await expectPgError(
      () => client.query(
        `INSERT INTO public.pilot_institutions(
           name,created_by,status,student_limit,staff_limit,pilot_kind,review_due_at,approval_ref
         ) VALUES($1,$2,'suspended',41,2,'invitation_free',now() + interval '30 days',$3)`,
        ['Öğrenci sınırı aşılmış canary', platformAdmin, 'PILOT-LIMIT-STUDENT-001'],
      ),
      '23514',
    )
    await expectPgError(
      () => client.query(
        `INSERT INTO public.pilot_institutions(
           name,created_by,status,student_limit,staff_limit,pilot_kind,review_due_at,approval_ref
         ) VALUES($1,$2,'suspended',40,3,'invitation_free',now() + interval '30 days',$3)`,
        ['Personel sınırı aşılmış canary', platformAdmin, 'PILOT-LIMIT-STAFF-001'],
      ),
      '23514',
    )
    await expectPgError(
      () => client.query(
        `INSERT INTO public.pilot_institutions(
           name,created_by,status,student_limit,staff_limit,pilot_kind,review_due_at,approval_ref
         ) VALUES($1,$2,'suspended',40,2,'invitation_free',now() + interval '13 days',$3)`,
        ['Alt süre sınırı aşılmış canary', platformAdmin, 'PILOT-LIMIT-MIN-DAYS-001'],
      ),
      '23514',
    )
    await expectPgError(
      () => client.query(
        `INSERT INTO public.pilot_institutions(
           name,created_by,status,student_limit,staff_limit,pilot_kind,review_due_at,approval_ref
         ) VALUES($1,$2,'suspended',40,2,'invitation_free',now() + interval '61 days',$3)`,
        ['Süre sınırı aşılmış canary', platformAdmin, 'PILOT-LIMIT-DAYS-001'],
      ),
      '23514',
    )
    const boundaryCreatedAt = new Date()
    await client.query('BEGIN')
    try {
      await client.query(
        `INSERT INTO public.pilot_institutions(
           name,created_by,status,student_limit,staff_limit,pilot_kind,
           review_due_at,approval_ref,created_at
         ) VALUES(
           $1,$2,'suspended',40,2,'invitation_free',
           $3::timestamptz + interval '60 days',$4,$3
         )`,
        [
          'Tam sınırda askıya alınmış canary',
          platformAdmin,
          boundaryCreatedAt,
          'PILOT-LIMIT-BOUNDARY-001',
        ],
      )
    } finally {
      // A valid boundary fixture would consume the one-shot readiness package.
      await client.query('ROLLBACK')
    }

    const before = Date.now()
    const provisioned = await authenticatedRpc(platformAdmin, expression, [
      platformAdmin, 'Davetli Ücretsiz Canary', freePilotManager,
      'PILOT-2026-001', 30, 2, 30, requestId,
    ])
    const reviewDueAt = new Date(provisioned.institution.reviewDueAt).getTime()
    expect(provisioned).toMatchObject({
      replayed: false,
      institution: {
        name: 'Davetli Ücretsiz Canary',
        status: 'pilot',
        studentLimit: 30,
        staffLimit: 2,
        pilotKind: 'invitation_free',
        approvalReference: 'PILOT-2026-001',
      },
      membership: { role: 'manager' },
    })
    expect(reviewDueAt).toBeGreaterThanOrEqual(before + 29 * 24 * 60 * 60 * 1000)
    expect(reviewDueAt).toBeLessThanOrEqual(Date.now() + 31 * 24 * 60 * 60 * 1000)

    const readinessConsumption = await client.query(
      `SELECT readiness_ref,institution_id
       FROM public.institution_free_pilot_readiness_consumptions
       WHERE readiness_ref=$1`,
      [readinessRef],
    )
    expect(readinessConsumption.rows).toEqual([{
      readiness_ref: readinessRef,
      institution_id: provisioned.institution.id,
    }])

    await expectPgError(
      () => authenticatedRpc(platformAdmin, expression, [
        platformAdmin,
        'İkinci Eşzamanlı Canary',
        freePilotManagerTwo,
        'PILOT-2026-002',
        30,
        2,
        30,
        randomUUID(),
      ]),
      '23505',
    )
    await expectPgError(
      () => client.query(
        `INSERT INTO public.pilot_institutions(
           name,created_by,student_limit,staff_limit,pilot_kind,review_due_at,approval_ref
         ) VALUES($1,$2,30,2,'invitation_free',now() + interval '30 days',$3)`,
        ['Doğrudan ikinci canary', platformAdmin, 'PILOT-2026-DIRECT-002'],
      ),
      '55000',
    )

    await expectPgError(
      () => authenticatedRpc(
        freePilotManager,
        'public.get_my_pilot_institution($1)',
        [freePilotManager],
        'aal1',
      ),
      '42501',
    )
    for (const [directExpression, directValues] of directTenantRpcCalls(
      freePilotManager,
      provisioned.institution.id,
    )) {
      await expectPgError(
        () => authenticatedRpc(
          freePilotManager,
          directExpression,
          directValues,
          'aal1',
        ),
        '42501',
      )
    }

    expect(await authenticatedRpc(
      freePilotManager,
      'public.set_my_institution_manager_teacher_role($1,$2,$3)',
      [freePilotManager, true, randomUUID()],
    )).toMatchObject({ enabled: true, replayed: false })
    const freeClassroom = await authenticatedRpc(
      freePilotManager,
      'public.create_my_institution_classroom($1,$2,$3,$4)',
      [
        freePilotManager,
        provisioned.membership.memberRef,
        'Ücretsiz Canary Sınıfı',
        randomUUID(),
      ],
    )
    const freeClassroomId = freeClassroom.classroom.id
    const freeInviteDigest = 'f'.repeat(64)
    await authenticatedRpc(
      freePilotManager,
      'public.issue_teacher_classroom_invite($1,$2,$3,$4,$5,$6)',
      [
        freePilotManager,
        freeClassroomId,
        freeInviteDigest,
        new Date(Date.now() + 60 * 60 * 1000),
        1,
        randomUUID(),
      ],
    )
    const freeInviteAcceptRequest = randomUUID()
    expect(await authenticatedRpc(
      freePilotStudent,
      'public.accept_teacher_classroom_invite($1,$2,$3,$4,$5)',
      [
        freePilotStudent,
        freeInviteDigest,
        'notice-v1',
        'consent-v1',
        freeInviteAcceptRequest,
      ],
      'aal1',
    )).toMatchObject({ membershipStatus: 'active', replayed: false })

    await authenticatedRpc(
      freePilotManager,
      'public.set_teacher_classroom_exam_mode($1,$2,$3,$4,$5)',
      [
        freePilotManager,
        freeClassroomId,
        provisioned.institution.id,
        true,
        randomUUID(),
      ],
    )
    expect(await rpc('public.get_my_assistance_policy($1)', [freePilotStudent]))
      .toMatchObject({ examMode: true, board: false, coach: false, assistant: false })

    const freeQuestionId = randomUUID()
    await client.query(
      `INSERT INTO public.questions(id,game,category,topic,difficulty,content,is_active)
       VALUES($1,'matematik','Temel','Toplama',1,$2::jsonb,true)`,
      [
        freeQuestionId,
        JSON.stringify({ question: 'İki artı iki kaçtır?', options: ['3', '4'], answer: 1 }),
      ],
    )
    const freeAssignment = await authenticatedRpc(
      freePilotManager,
      'public.publish_teacher_assignment($1,$2,$3,$4,$5,$6,$7)',
      [
        freePilotManager,
        freeClassroomId,
        'Canary ödevi',
        JSON.stringify([{ position: 1, questionId: freeQuestionId }]),
        new Date(Date.now() - 60 * 1000),
        new Date(Date.now() + 60 * 60 * 1000),
        randomUUID(),
      ],
    )
    const freeAssignmentAnswers = JSON.stringify([{ position: 1, selectedOption: 1 }])
    const freeAssignmentSubmitRequest = randomUUID()
    expect(await authenticatedRpc(
      freePilotStudent,
      'public.submit_teacher_assignment($1,$2,$3,$4)',
      [
        freePilotStudent,
        freeAssignment.assignmentId,
        freeAssignmentAnswers,
        freeAssignmentSubmitRequest,
      ],
      'aal1',
    )).toMatchObject({ assignmentId: freeAssignment.assignmentId, replayed: false })
    expect(await authenticatedRpc(
      freePilotStudent,
      'public.submit_teacher_assignment($1,$2,$3,$4)',
      [
        freePilotStudent,
        freeAssignment.assignmentId,
        freeAssignmentAnswers,
        freeAssignmentSubmitRequest,
      ],
      'aal1',
    )).toMatchObject({ assignmentId: freeAssignment.assignmentId, replayed: true })

    const membership = await client.query(
      `SELECT id,member_ref FROM public.teacher_classroom_memberships
       WHERE classroom_id=$1 AND student_id=$2 AND status='active'`,
      [freeClassroomId, freePilotStudent],
    )
    const weekStart = (await client.query(
      "SELECT to_char(date_trunc('week',current_date)::date,'YYYY-MM-DD') AS value",
    )).rows[0].value
    const programItems = JSON.stringify([{
      position: 1,
      scheduledDate: weekStart,
      taskType: 'diagnostic',
      title: 'Canary tanı çalışması',
      reasonCode: 'diagnostic_gap',
      outcomeCode: 'MAT-TEST-01',
      durationMinutes: 20,
      targetQuestionCount: 10,
    }])
    const freeProgramRequest = randomUUID()
    const freeProgram = await authenticatedRpc(
      freePilotManager,
      'public.create_institution_study_program_draft($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        freePilotManager,
        freeClassroomId,
        membership.rows[0].member_ref,
        weekStart,
        30,
        'institution-program-v1',
        programItems,
        freeProgramRequest,
      ],
    )
    expect((await client.query(`SELECT taxonomy_version FROM public.institution_study_programs
      WHERE program_ref=$1`, [freeProgram.programRef])).rows[0]).toEqual({
      taxonomy_version: 'ba-tyt-math-v1',
    })
    const successfulProgramUpdateRequest = randomUUID()
    expect(await authenticatedRpc(
      freePilotManager,
      'public.update_institution_study_program_draft($1,$2,$3,$4,$5,$6)',
      [
        freePilotManager,
        freeProgram.programRef,
        weekStart,
        30,
        programItems,
        successfulProgramUpdateRequest,
      ],
    )).toMatchObject({ programRef: freeProgram.programRef, replayed: false })
    await client.query(`UPDATE public.curriculum_scope_releases
      SET taxonomy_version='ba-tyt-math-v2'
      WHERE game='matematik' AND display_exam_ref='TYT'`)
    expect(await authenticatedRpc(
      freePilotManager,
      'public.create_institution_study_program_draft($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        freePilotManager,
        freeClassroomId,
        membership.rows[0].member_ref,
        weekStart,
        30,
        'institution-program-v1',
        programItems,
        freeProgramRequest,
      ],
    )).toMatchObject({ programRef: freeProgram.programRef, replayed: true })
    await expectPgError(
      () => authenticatedRpc(
        freePilotManager,
        'public.create_institution_study_program_draft($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          freePilotManager,
          freeClassroomId,
          membership.rows[0].member_ref,
          weekStart,
          35,
          'institution-program-v1',
          programItems,
          freeProgramRequest,
        ],
      ),
      '22023',
    )
    expect(await authenticatedRpc(
      freePilotManager,
      'public.update_institution_study_program_draft($1,$2,$3,$4,$5,$6)',
      [
        freePilotManager,
        freeProgram.programRef,
        weekStart,
        30,
        programItems,
        successfulProgramUpdateRequest,
      ],
    )).toMatchObject({ programRef: freeProgram.programRef, replayed: true })
    await expectPgError(
      () => authenticatedRpc(
        freePilotManager,
        'public.update_institution_study_program_draft($1,$2,$3,$4,$5,$6)',
        [
          freePilotManager,
          freeProgram.programRef,
          weekStart,
          30,
          programItems,
          randomUUID(),
        ],
      ),
      '22023',
    )
    const blockedProgramPublishRequest = randomUUID()
    await expectPgError(
      () => authenticatedRpc(
        freePilotManager,
        'public.publish_institution_study_program($1,$2,$3)',
        [freePilotManager, freeProgram.programRef, blockedProgramPublishRequest],
      ),
      '22023',
    )
    await client.query(`UPDATE public.curriculum_scope_releases
      SET taxonomy_version='ba-tyt-math-v1',question_exam_ref='LGS'
      WHERE game='matematik' AND display_exam_ref='TYT'`)
    await expectPgError(
      () => authenticatedRpc(
        freePilotManager,
        'public.create_institution_study_program_draft($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          freePilotManager,
          freeClassroomId,
          membership.rows[0].member_ref,
          weekStart,
          30,
          'institution-program-v1',
          programItems,
          randomUUID(),
        ],
      ),
      '22023',
    )
    await expectPgError(
      () => authenticatedRpc(
        freePilotManager,
        'public.update_institution_study_program_draft($1,$2,$3,$4,$5,$6)',
        [
          freePilotManager,
          freeProgram.programRef,
          weekStart,
          30,
          programItems,
          randomUUID(),
        ],
      ),
      '22023',
    )
    await expectPgError(
      () => authenticatedRpc(
        freePilotManager,
        'public.publish_institution_study_program($1,$2,$3)',
        [freePilotManager, freeProgram.programRef, blockedProgramPublishRequest],
      ),
      '22023',
    )
    await client.query(`UPDATE public.curriculum_scope_releases
      SET question_exam_ref='TYT'
      WHERE game='matematik' AND display_exam_ref='TYT'`)
    await authenticatedRpc(
      freePilotManager,
      'public.publish_institution_study_program($1,$2,$3)',
      [freePilotManager, freeProgram.programRef, blockedProgramPublishRequest],
    )
    expect((await rpc(
      'public.get_my_institution_study_programs($1,$2)',
      [freePilotStudent, weekStart],
    )).programs).toHaveLength(1)

    expect(await authenticatedRpc(
      freePilotManager,
      'public.grant_my_institution_support_access($1,$2,$3,$4)',
      [freePilotManager, 30, 'Canary süresince kontrollü destek', randomUUID()],
    )).toMatchObject({ active: true, replayed: false })

    expect(await authenticatedRpc(platformAdmin, expression, [
      platformAdmin, 'Davetli Ücretsiz Canary', freePilotManager,
      'PILOT-2026-001', 30, 2, 30, requestId,
    ])).toMatchObject({ replayed: true, institution: { id: provisioned.institution.id } })
    await expectPgError(
      () => authenticatedRpc(platformAdmin, expression, [
        platformAdmin, 'Davetli Ücretsiz Canary', freePilotManager,
        'PILOT-2026-001', 31, 2, 30, requestId,
      ]),
      '22023',
    )

    const audit = await client.query(
      `SELECT metadata
       FROM public.institution_operation_events
       WHERE institution_id=$1 AND event_type='institution_provisioned' AND request_id=$2`,
      [provisioned.institution.id, requestId],
    )
    expect(audit.rows).toEqual([{
      metadata: {
        pilotKind: 'invitation_free',
        approvalReference: 'PILOT-2026-001',
        studentLimit: 30,
        staffLimit: 2,
        reviewDueAt: provisioned.institution.reviewDueAt,
      },
    }])
    const crossOperationAudit = await client.query(
      `SELECT institution_id,source
       FROM public.institution_operation_events
       WHERE actor_user_id=$1
         AND event_type='institution_provisioned'
         AND request_id=$2
       ORDER BY source`,
      [platformAdmin, requestId],
    )
    expect(crossOperationAudit.rows).toEqual([
      {
        institution_id: provisioned.institution.id,
        source: 'free_pilot_request',
      },
      {
        institution_id: paidAfterMigration.institution.id,
        source: 'institution_request',
      },
    ])

    const directory = await authenticatedRpc(
      platformAdmin,
      'public.list_pilot_institutions($1)',
      [platformAdmin],
    )
    expect(directory.databaseControls).toEqual({
      freePilotProvisioningEnabled: true,
      commercialProvisioningEnabled: false,
    })
    expect(directory.institutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: provisioned.institution.id,
        pilotKind: 'invitation_free',
        approvalReference: 'PILOT-2026-001',
        reviewDueAt: provisioned.institution.reviewDueAt,
        studentLimit: 30,
        staffLimit: 2,
      }),
    ]))

    // Simulate wall-clock passage without weakening the production trigger:
    // move the fixture's creation and deadline together so the original pilot
    // duration remains valid while authorization observes an elapsed deadline.
    await client.query(
      'ALTER TABLE public.pilot_institutions DISABLE TRIGGER pilot_institutions_free_lifecycle_guard',
    )
    try {
      await client.query(
        `UPDATE public.pilot_institutions
         SET created_at=clock_timestamp() - interval '31 days',
             review_due_at=clock_timestamp() - interval '1 minute'
         WHERE id=$1`,
        [provisioned.institution.id],
      )
    } finally {
      await client.query(
        'ALTER TABLE public.pilot_institutions ENABLE TRIGGER pilot_institutions_free_lifecycle_guard',
      )
    }
    await expectPgError(
      () => authenticatedRpc(
        freePilotManager,
        'public.get_my_pilot_institution($1)',
        [freePilotManager],
      ),
      'P0002',
    )
    const expiredOperational = await client.query(
      'SELECT public.institution_pilot_is_operational($1) AS allowed',
      [provisioned.institution.id],
    )
    expect(expiredOperational.rows[0].allowed).toBe(false)
    for (const [directExpression, directValues] of directTenantRpcCalls(
      freePilotManager,
      provisioned.institution.id,
    )) {
      await expectPgError(
        () => authenticatedRpc(freePilotManager, directExpression, directValues),
        '42501',
      )
    }
    for (const [replayExpression, replayValues] of [
      [
        'public.transfer_my_pilot_institution_manager($1,$2,$3)',
        [freePilotManager, 'c'.repeat(32), randomUUID()],
      ],
      [
        'public.resolve_institution_student_followup($1,$2,$3)',
        [freePilotManager, 'd'.repeat(32), randomUUID()],
      ],
      [
        'public.review_institution_study_program($1,$2,$3,$4,$5)',
        [freePilotManager, 'e'.repeat(32), 'effective', null, randomUUID()],
      ],
    ]) {
      await expectPgError(
        () => authenticatedRpc(freePilotManager, replayExpression, replayValues),
        '42501',
      )
    }
    await expectPgError(
      () => authenticatedRpc(
        freePilotStudent,
        'public.accept_teacher_classroom_invite($1,$2,$3,$4,$5)',
        [
          freePilotStudent,
          freeInviteDigest,
          'notice-v1',
          'consent-v1',
          freeInviteAcceptRequest,
        ],
        'aal1',
      ),
      'P0003',
    )
    await expectPgError(
      () => authenticatedRpc(
        freePilotStudent,
        'public.submit_teacher_assignment($1,$2,$3,$4)',
        [
          freePilotStudent,
          freeAssignment.assignmentId,
          freeAssignmentAnswers,
          freeAssignmentSubmitRequest,
        ],
        'aal1',
      ),
      'P0002',
    )
    expect((await rpc(
      'public.get_my_institution_study_programs($1,$2)',
      [freePilotStudent, weekStart],
    )).programs).toEqual([])
    expect(await rpc('public.get_my_assistance_policy($1)', [freePilotStudent]))
      .toMatchObject({ examMode: false, board: true, coach: true, assistant: true })
    expect(await authenticatedRpc(
      freePilotManager,
      'public.revoke_my_institution_support_access($1,$2)',
      [freePilotManager, randomUUID()],
    )).toMatchObject({ active: false, replayed: false })
    expect(await authenticatedRpc(
      freePilotStudent,
      'public.withdraw_teacher_classroom_membership($1,$2,$3)',
      [freePilotStudent, freeClassroomId, randomUUID()],
      'aal1',
    )).toMatchObject({ membershipStatus: 'withdrawn', replayed: false })

    const suspendRequestId = randomUUID()
    expect(await authenticatedRpc(
      platformAdmin,
      'public.set_pilot_institution_status($1,$2,$3,$4,$5)',
      [
        platformAdmin,
        provisioned.institution.id,
        'suspended',
        'Ücretsiz canary değerlendirme süresi tamamlandı.',
        suspendRequestId,
      ],
    )).toMatchObject({ status: 'suspended', changed: true })
    await expectPgError(
      () => authenticatedRpc(platformAdmin, expression, [
        platformAdmin,
        'Tüketilmiş readiness yeniden kullanılamaz',
        freePilotManagerTwo,
        'PILOT-REUSE-001',
        30,
        2,
        30,
        randomUUID(),
      ]),
      '55000',
    )
    await expectPgError(
      () => authenticatedRpc(
        platformAdmin,
        'public.set_pilot_institution_status($1,$2,$3,$4,$5)',
        [
          platformAdmin,
          provisioned.institution.id,
          'active',
          'Süresi geçmiş canary yeniden açılmamalıdır.',
          randomUUID(),
        ],
      ),
      '23514',
    )
    const lifecycleAudit = await client.query(
      `SELECT count(*)::int AS count
       FROM public.institution_operation_events
       WHERE institution_id=$1 AND event_type='institution_status_changed' AND request_id=$2`,
      [provisioned.institution.id, suspendRequestId],
    )
    expect(lifecycleAudit.rows[0].count).toBe(1)

    // A lost-ledger retry after an opening must close provisioning once and
    // remain idempotent on the next retry. Existing tenant rows stay intact.
    await client.query(freePilotReadinessEvidenceGateSql)
    await client.query(freePilotReadinessEvidenceGateSql)
    const retryClosure = await client.query(`
      SELECT
        (SELECT enabled FROM public.institution_pilot_controls
         WHERE control_key='free_provisioning') AS enabled,
        (SELECT count(*)::int
         FROM public.institution_pilot_control_events
         WHERE control_key='free_provisioning'
           AND change_reference LIKE 'MIGRATION-167-READINESS-GATE-%') AS event_count,
        (SELECT count(*)::int FROM public.pilot_institutions
         WHERE id=$1) AS institution_count
    `, [provisioned.institution.id])
    expect(retryClosure.rows[0]).toEqual({
      enabled: false,
      event_count: 1,
      institution_count: 1,
    })

    // Closing the one-shot gate blocks new provisioning, but the exact
    // historical request remains a safe idempotent replay. A payload mismatch
    // must still fail before any gate-dependent behavior is considered.
    expect(await authenticatedRpc(platformAdmin, expression, [
      platformAdmin, 'Davetli Ücretsiz Canary', freePilotManager,
      'PILOT-2026-001', 30, 2, 30, requestId,
    ])).toMatchObject({ replayed: true, institution: { id: provisioned.institution.id } })
    await expectPgError(
      () => authenticatedRpc(platformAdmin, expression, [
        platformAdmin, 'Davetli Ücretsiz Canary', freePilotManager,
        'PILOT-2026-001', 31, 2, 30, requestId,
      ]),
      '22023',
    )
    await expectPgError(
      () => authenticatedRpc(platformAdmin, expression, [
        platformAdmin, 'Yeni Kapalı Gate İsteği', freePilotManagerTwo,
        'PILOT-2026-NEW', 10, 1, 14, randomUUID(),
      ]),
      '55000',
    )
  }, 30_000)

  it('lists tenants for platform admins without exposing the directory to managers', async () => {
    await expectPgError(
      () => authenticatedRpc(managerOne, 'public.list_pilot_institutions($1)', [managerOne]),
      '42501',
    )
    const directory = await authenticatedRpc(
      platformAdmin,
      'public.list_pilot_institutions($1)',
      [platformAdmin],
    )
    expect(directory.institutions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: institutionOne,
        name: 'Bilge Pilot Bir',
        staffCount: 1,
        classroomCount: 0,
        studentCount: 0,
        supportAccess: expect.objectContaining({ active: false }),
      }),
    ]))
  })

  it('lets only a JWT-bound platform admin suspend and reactivate a tenant with immutable evidence', async () => {
    const suspendRequest = randomUUID()
    const suspended = await authenticatedRpc(
      platformAdmin,
      'public.set_pilot_institution_status($1,$2,$3,$4,$5)',
      [platformAdmin, institutionOne, 'suspended', 'Security review in progress.', suspendRequest],
    )
    expect(suspended).toMatchObject({
      institutionId: institutionOne,
      previousStatus: 'pilot',
      status: 'suspended',
      changed: true,
      replayed: false,
    })
    await expectPgError(
      () => authenticatedRpc(managerOne, 'public.set_pilot_institution_status($1,$2,$3,$4,$5)', [
        managerOne, institutionOne, 'active', 'Unauthorized lifecycle attempt.', randomUUID(),
      ]),
      '42501',
    )
    const activated = await authenticatedRpc(
      platformAdmin,
      'public.set_pilot_institution_status($1,$2,$3,$4,$5)',
      [platformAdmin, institutionOne, 'active', 'Security review completed successfully.', randomUUID()],
    )
    expect(activated).toMatchObject({ previousStatus: 'suspended', status: 'active', changed: true })
    const event = await client.query(
      `SELECT metadata FROM public.institution_operation_events
       WHERE institution_id=$1 AND event_type='institution_status_changed' AND request_id=$2`,
      [institutionOne, suspendRequest],
    )
    expect(event.rows[0].metadata).toMatchObject({
      previousStatus: 'pilot',
      status: 'suspended',
      reason: 'Security review in progress.',
      changed: true,
    })
  })

  it('explicitly gives one manager the teacher system role without a duplicate membership', async () => {
    await expectPgError(
      () => rpc('public.create_teacher_classroom($1,$2,$3)', [
        managerOne, 'Rol Öncesi Sınıf', randomUUID(),
      ]),
      '42501',
    )

    const requestId = randomUUID()
    expect(await rpc('public.set_my_institution_manager_teacher_role($1,$2,$3)', [
      managerOne, true, requestId,
    ])).toMatchObject({ memberRef: managerMemberRef, enabled: true, replayed: false })
    expect(await rpc('public.set_my_institution_manager_teacher_role($1,$2,$3)', [
      managerOne, true, requestId,
    ])).toMatchObject({ memberRef: managerMemberRef, enabled: true, replayed: true })
    await expectPgError(
      () => rpc('public.set_my_institution_manager_teacher_role($1,$2,$3)', [
        managerOne, false, requestId,
      ]),
      '22023',
    )

    const membershipCount = await client.query(
      `SELECT count(*)::int AS count
       FROM public.pilot_institution_memberships
       WHERE institution_id=$1 AND user_id=$2 AND status='active'`,
      [institutionOne, managerOne],
    )
    expect(membershipCount.rows[0].count).toBe(1)
    const managerTeacher = await client.query(
      'SELECT public.teacher_classroom_is_teacher($1) AS allowed',
      [managerOne],
    )
    expect(managerTeacher.rows[0].allowed).toBe(true)

    const roleDirectory = await rpc('public.get_my_institution_role_directory($1)', [managerOne])
    const manager = roleDirectory.members.find((member) => member.memberRef === managerMemberRef)
    const teacherRole = roleDirectory.roles.find((role) => role.roleKey === 'teacher')
    expect(manager.roleRefs).toContain(teacherRole.roleRef)
    expect(teacherRole.memberCount).toBe(1)

    const tracking = await rpc('public.get_institution_tracking_directory($1)', [managerOne])
    expect(tracking.membership).toEqual({ role: 'manager', teacherEnabled: true })
    expect(tracking.classrooms).toEqual([])
    await expectPgError(
      () => authenticatedRpc(
        managerOne,
        'public.get_my_teacher_classrooms($1)',
        [managerOne],
        'aal1',
      ),
      '42501',
    )
  })

  it('blocks legacy classroom RPCs while the linked institution is suspended', async () => {
    await authenticatedRpc(
      platformAdmin,
      'public.set_pilot_institution_status($1,$2,$3,$4,$5)',
      [platformAdmin, institutionOne, 'suspended', 'Tenant access regression check.', randomUUID()],
    )
    await expectPgError(
      () => authenticatedRpc(
        managerOne,
        'public.create_teacher_classroom($1,$2,$3)',
        [managerOne, 'Askıda Sınıf', randomUUID()],
      ),
      '42501',
    )
    await authenticatedRpc(
      platformAdmin,
      'public.set_pilot_institution_status($1,$2,$3,$4,$5)',
      [platformAdmin, institutionOne, 'active', 'Tenant access regression check completed.', randomUUID()],
    )
  })

  it('keeps support access manager-controlled, read-only, expiring and replay-safe', async () => {
    expect(await rpc('public.get_my_institution_support_access($1)', [managerOne]))
      .toMatchObject({ institutionId: institutionOne, active: false, scope: 'read_only' })

    const requestId = randomUUID()
    const granted = await rpc(
      'public.grant_my_institution_support_access($1,$2,$3,$4)',
      [managerOne, 60, 'Kurum kurulumunu birlikte kontrol etmek icin.', requestId],
    )
    expect(granted).toMatchObject({
      institutionId: institutionOne,
      active: true,
      scope: 'read_only',
      replayed: false,
    })
    expect(await rpc(
      'public.grant_my_institution_support_access($1,$2,$3,$4)',
      [managerOne, 60, 'Kurum kurulumunu birlikte kontrol etmek icin.', requestId],
    )).toMatchObject({ grantRef: granted.grantRef, replayed: true })
    await expectPgError(
      () => authenticatedRpc(
        managerOne,
        'public.grant_my_institution_support_access($1,$2,$3,$4)',
        [managerOne, 60, 'Kurum kurulumunu birlikte kontrol etmek icin.', requestId],
        'aal1',
      ),
      '42501',
    )
    await expectPgError(
      () => authenticatedRpc(
        managerOne,
        'public.get_my_institution_support_access($1)',
        [managerOne],
        'aal1',
      ),
      '42501',
    )
    const supportAccess = await client.query(
      `SELECT public.institution_support_has_access($1,$3) AS platform,
              public.institution_support_has_access($2,$3) AS manager`,
      [platformAdmin, managerOne, institutionOne],
    )
    expect(supportAccess.rows[0]).toEqual({ platform: true, manager: false })
    expect(await rpc('public.get_institution_support_directory($1,$2)', [platformAdmin, institutionOne]))
      .toMatchObject({
        institution: { id: institutionOne, name: 'Bilge Pilot Bir' },
        access: { scope: 'read_only' },
        classrooms: [],
      })

    const revoked = await rpc(
      'public.revoke_my_institution_support_access($1,$2)',
      [managerOne, randomUUID()],
    )
    expect(revoked).toMatchObject({ active: false, scope: 'read_only', replayed: false })
    const revokedSupportAccess = await client.query(
      'SELECT public.institution_support_has_access($1,$2) AS allowed',
      [platformAdmin, institutionOne],
    )
    expect(revokedSupportAccess.rows[0].allowed).toBe(false)
    await expectPgError(
      () => rpc('public.get_institution_support_directory($1,$2)', [platformAdmin, institutionOne]),
      '42501',
    )
  })

  it('keeps a global teacher role insufficient until tenant membership exists', async () => {
    await client.query(
      `INSERT INTO public.user_roles(user_id,role_id,assigned_by)
       SELECT $1,id,$2 FROM public.roles WHERE slug='teacher_pilot'`,
      [teacherOne, platformAdmin],
    )
    const retainedTeacherRole = await client.query(
      `SELECT count(*)::int AS count
       FROM public.user_roles AS user_role
       JOIN public.roles AS role ON role.id = user_role.role_id
       WHERE user_role.user_id = $1 AND role.slug = 'teacher_pilot'`,
      [teacherOne],
    )
    expect(retainedTeacherRole.rows[0].count).toBe(1)
    await expectPgError(
      () => rpc('public.create_teacher_classroom($1,$2,$3)', [teacherOne, 'Yetkisiz', randomUUID()]),
      '42501',
    )
  })

  it('lets the scoped manager add a teacher and atomically binds new classrooms', async () => {
    await expectPgError(
      () => rpc('public.add_my_institution_teacher_by_email($1,$2,$3)', [
        managerOne, 'kayitli-degil@example.com', randomUUID(),
      ]),
      'P0002',
    )
    const requestId = randomUUID()
    const added = await rpc('public.add_my_institution_teacher_by_email($1,$2,$3)', [
      managerOne, 'PILOT-3@EXAMPLE.COM', requestId,
    ])
    teacherMemberRef = added.memberRef
    expect(added).toMatchObject({ role: 'teacher', replayed: false })
    expect(await rpc('public.add_my_institution_teacher_by_email($1,$2,$3)', [
      managerOne, 'pilot-3@example.com', requestId,
    ])).toMatchObject({ memberRef: teacherMemberRef, replayed: true })

    const managerRequestId = randomUUID()
    const managed = await rpc('public.create_my_institution_classroom($1,$2,$3,$4)', [
      managerOne, teacherMemberRef, 'TYT Matematik A', managerRequestId,
    ])
    expect(managed).toMatchObject({
      classroom: { name: 'TYT Matematik A', status: 'active' },
      teacher: { memberRef: teacherMemberRef },
      replayed: false,
    })
    expect(await rpc('public.create_my_institution_classroom($1,$2,$3,$4)', [
      managerOne, teacherMemberRef, 'TYT Matematik A', managerRequestId,
    ])).toMatchObject({ classroom: { id: managed.classroom.id }, replayed: true })
    await expectPgError(
      () => rpc('public.create_my_institution_classroom($1,$2,$3,$4)', [
        managerOne, teacherMemberRef, 'Farklı Sınıf', managerRequestId,
      ]),
      '22023',
    )
    await expectPgError(
      () => rpc('public.create_my_institution_classroom($1,$2,$3,$4)', [
        teacherOne, teacherMemberRef, 'Yetkisiz Sınıf', randomUUID(),
      ]),
      '42501',
    )
    const managedRow = await client.query(
      'SELECT institution_id,teacher_id FROM public.teacher_classrooms WHERE id=$1',
      [managed.classroom.id],
    )
    expect(managedRow.rows[0]).toEqual({ institution_id: institutionOne, teacher_id: teacherOne })

    const remover = new pg.Client({ connectionString: url })
    const competingWriter = new pg.Client({ connectionString: url })
    await remover.connect()
    await competingWriter.connect()
    try {
      await remover.query('BEGIN')
      await remover.query(
        `UPDATE public.pilot_institution_memberships
         SET status='removed', ended_at=now()
         WHERE institution_id=$1 AND user_id=$2`,
        [institutionOne, teacherOne],
      )
      const competing = rpcOn(
        competingWriter,
        'public.create_my_institution_classroom($1,$2,$3,$4)',
        [managerOne, teacherMemberRef, 'Eşzamanlı Kaldırma', randomUUID()],
      ).then(
        (result) => ({ result, error: null }),
        (error) => ({ result: null, error }),
      )
      await new Promise((resolve) => setTimeout(resolve, 100))
      await remover.query('COMMIT')
      const outcome = await competing
      expect(outcome.result).toBeNull()
      expect(outcome.error?.code).toBe('P0002')
    } finally {
      await remover.query('ROLLBACK').catch(() => undefined)
      await remover.end()
      await competingWriter.end()
      await client.query(
        `UPDATE public.pilot_institution_memberships
         SET status='active', ended_at=NULL
         WHERE institution_id=$1 AND user_id=$2`,
        [institutionOne, teacherOne],
      )
    }

    const created = await rpc('public.create_teacher_classroom($1,$2,$3)', [
      teacherOne, '12-A Matematik', randomUUID(),
    ])
    const row = await client.query(
      'SELECT institution_id,teacher_id FROM public.teacher_classrooms WHERE id=$1',
      [created.classroom.id],
    )
    expect(row.rows[0]).toEqual({ institution_id: institutionOne, teacher_id: teacherOne })
  })

  it('keeps tenant roles manager-owned, delegable-only and effective on the directory', async () => {
    const managerClassroom = await rpc('public.create_my_institution_classroom($1,$2,$3,$4)', [
      managerOne, managerMemberRef, 'Kurum Yöneticisi Sınıfı', randomUUID(),
    ])
    expect(managerClassroom.teacher.memberRef).toBe(managerMemberRef)
    expect((await rpc('public.get_institution_tracking_directory($1)', [managerOne])).classrooms)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: managerClassroom.classroom.id, canManagePrograms: true }),
      ]))
    await expectPgError(
      () => rpc('public.set_my_institution_manager_teacher_role($1,$2,$3)', [
        managerOne, false, randomUUID(),
      ]),
      'P0003',
    )
    expect((await rpc('public.get_institution_tracking_directory($1)', [teacherOne])).classrooms)
      .toHaveLength(2)

    const requestId = randomUUID()
    const created = await rpc('public.create_my_institution_role($1,$2,$3,$4,$5)', [
      managerOne,
      'Rehberlik Koordinatörü',
      'Kurumun bütün aktif sınıflarını takip eder.',
      ['institution.classrooms.view_all'],
      requestId,
    ])
    customRoleRef = created.roleRef
    expect(await rpc('public.create_my_institution_role($1,$2,$3,$4,$5)', [
      managerOne,
      'Rehberlik Koordinatörü',
      'Kurumun bütün aktif sınıflarını takip eder.',
      ['institution.classrooms.view_all'],
      requestId,
    ])).toMatchObject({ roleRef: customRoleRef, replayed: true })

    await expectPgError(
      () => rpc('public.create_my_institution_role($1,$2,$3,$4,$5)', [
        managerOne, 'Yetki Yükseltme', 'Yönetici yetkisi alınmamalı.',
        ['institution.roles.manage'], randomUUID(),
      ]),
      '42501',
    )
    await expectPgError(
      () => rpc('public.get_my_institution_role_directory($1)', [teacherOne]),
      '42501',
    )

    const roleDirectory = await rpc('public.get_my_institution_role_directory($1)', [managerOne])
    expect(roleDirectory.roles).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleRef: customRoleRef, system: false, memberCount: 0 }),
      expect.objectContaining({ roleKey: 'manager', system: true }),
      expect.objectContaining({ roleKey: 'teacher', system: true }),
    ]))
    await rpc('public.set_my_institution_role_assignment($1,$2,$3,$4,$5)', [
      managerOne, customRoleRef, teacherMemberRef, true, randomUUID(),
    ])
    const teacherPermission = await client.query(
      'SELECT public.institution_member_has_permission($1,$2,$3) AS allowed',
      [teacherOne, institutionOne, 'institution.classrooms.view_all'],
    )
    expect(teacherPermission.rows[0].allowed).toBe(true)
    expect((await rpc('public.get_institution_tracking_directory($1)', [teacherOne])).classrooms)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: managerClassroom.classroom.id }),
      ]))
  })

  it('blocks cross-tenant management and enforces the six-person capacity', async () => {
    await setProvisioningControl(
      'commercial_provisioning',
      true,
      'CONTROL-COMMERCIAL-TENANT2-ENABLE-001',
    )
    let second
    try {
      second = await rpc('public.provision_pilot_institution($1,$2,$3,$4)', [
        platformAdmin, 'Bilge Pilot İki', managerTwo, randomUUID(),
      ])
    } finally {
      await setProvisioningControl(
        'commercial_provisioning',
        false,
        'CONTROL-COMMERCIAL-TENANT2-DISABLE-001',
      )
    }
    institutionTwo = second.institution.id
    await expectPgError(
      () => rpc('public.add_pilot_institution_teacher($1,$2,$3,$4)', [
        managerTwo, institutionOne, capacityTeachers[0], randomUUID(),
      ]),
      '42501',
    )
    expect((await rpc('public.get_my_pilot_institution($1)', [managerTwo])).institution.id)
      .toBe(second.institution.id)
    await expectPgError(
      () => rpc('public.set_my_institution_role_assignment($1,$2,$3,$4,$5)', [
        managerTwo, customRoleRef, teacherMemberRef, true, randomUUID(),
      ]),
      'P0002',
    )
    await expectPgError(
      () => rpc('public.create_my_institution_classroom($1,$2,$3,$4)', [
        managerTwo, teacherMemberRef, 'Kiracılar Arası Sınıf', randomUUID(),
      ]),
      'P0002',
    )

    // manager + teacherOne + four more teachers = six active staff.
    for (const teacherId of capacityTeachers.slice(0, 4)) {
      await rpc('public.add_pilot_institution_teacher($1,$2,$3,$4)', [
        managerOne, institutionOne, teacherId, randomUUID(),
      ])
    }
    await expectPgError(
      () => rpc('public.add_pilot_institution_teacher($1,$2,$3,$4)', [
        managerOne, institutionOne, capacityTeachers[4], randomUUID(),
      ]),
      'P0003',
    )
  })

  it('closes every helper for the whole classroom while exam mode is on', async () => {
    const examStudent = randomUUID()
    const outsideStudent = randomUUID()
    await client.query(
      'INSERT INTO public.profiles(id,username,display_name) VALUES($1,$2,$3),($4,$5,$6)',
      [examStudent, 'exam-student', 'Sinav Ogrencisi', outsideStudent, 'free-student', 'Serbest Ogrenci'],
    )
    const examClass = await rpc('public.create_teacher_classroom($1,$2,$3)', [
      teacherOne, '11-B Sinav', randomUUID(),
    ])
    await client.query(
      'INSERT INTO public.teacher_classroom_memberships(classroom_id,student_id) VALUES($1,$2)',
      [examClass.classroom.id, examStudent],
    )

    // Sinav modu kapaliyken ucu de acik.
    expect(await rpc('public.get_my_assistance_policy($1)', [examStudent])).toMatchObject({
      examMode: false, board: true, coach: true, assistant: true,
    })

    // Ogretmen acinca sinifin tamami icin ucu birden kapanir.
    const requestId = randomUUID()
    expect(await rpc('public.set_teacher_classroom_exam_mode($1,$2,$3,$4,$5)', [
      teacherOne, examClass.classroom.id, institutionOne, true, requestId,
    ])).toMatchObject({ examMode: true, replayed: false })
    const examModeAudit = await client.query(
      `SELECT metadata FROM public.institution_operation_events
       WHERE event_type='exam_mode_changed' AND request_id=$1`,
      [requestId],
    )
    expect(examModeAudit.rows[0].metadata).toMatchObject({
      enabled: true,
      expiresAt: expect.any(String),
    })
    expect(await rpc('public.get_my_assistance_policy($1)', [examStudent])).toMatchObject({
      examMode: true, board: false, coach: false, assistant: false,
    })

    // Ayni istek tekrarlanirsa yeni pencere acilmaz.
    expect(await rpc('public.set_teacher_classroom_exam_mode($1,$2,$3,$4,$5)', [
      teacherOne, examClass.classroom.id, institutionOne, true, requestId,
    ])).toMatchObject({ replayed: true })

    // Baska sinifin ogrencisi etkilenmez.
    expect(await rpc('public.get_my_assistance_policy($1)', [outsideStudent])).toMatchObject({
      examMode: false, board: true,
    })

    // Sinifin sahibi olmayan ayni kurum ogretmeni degistiremez.
    await expectPgError(
      () => rpc('public.set_teacher_classroom_exam_mode($1,$2,$3,$4,$5)', [
        capacityTeachers[0], examClass.classroom.id, institutionOne, false, randomUUID(),
      ]),
      'P0002',
    )
    // Yanlis tenant kimligiyle cagri reddedilir.
    await expectPgError(
      () => rpc('public.set_teacher_classroom_exam_mode($1,$2,$3,$4,$5)', [
        teacherOne, examClass.classroom.id, institutionTwo, false, randomUUID(),
      ]),
      '42501',
    )

    // Ogretmen kapatmayi unutursa pencere kendiliginden duser.
    await client.query(
      "UPDATE public.teacher_classrooms SET exam_mode_expires_at = now() - interval '1 minute' WHERE id=$1",
      [examClass.classroom.id],
    )
    expect(await rpc('public.get_my_assistance_policy($1)', [examStudent])).toMatchObject({
      examMode: false, board: true, coach: true, assistant: true,
    })

    // Acik pencere ogretmen tarafindan da kapatilabilir.
    await rpc('public.set_teacher_classroom_exam_mode($1,$2,$3,$4,$5)', [
      teacherOne, examClass.classroom.id, institutionOne, true, randomUUID(),
    ])
    expect(await rpc('public.get_my_assistance_policy($1)', [examStudent])).toMatchObject({ examMode: true })
    await rpc('public.set_teacher_classroom_exam_mode($1,$2,$3,$4,$5)', [
      teacherOne, examClass.classroom.id, institutionOne, false, randomUUID(),
    ])
    expect(await rpc('public.get_my_assistance_policy($1)', [examStudent])).toMatchObject({
      examMode: false, board: true, coach: true, assistant: true,
    })
  })

  it('cuts teacher RPC access when the tenant manager removes membership', async () => {
    await expectPgError(
      () => rpc('public.remove_pilot_institution_teacher($1,$2,$3,$4)', [
        managerOne, institutionOne, teacherMemberRef, randomUUID(),
      ]),
      'P0003',
    )
    await client.query(
      `UPDATE public.teacher_classrooms
       SET status='archived', archived_at=now()
       WHERE institution_id=$1 AND teacher_id=$2 AND status='active'`,
      [institutionOne, teacherOne],
    )

    const remover = new pg.Client({ connectionString: url })
    const competingWriter = new pg.Client({ connectionString: url })
    await remover.connect()
    await competingWriter.connect()
    let removed
    let competing
    try {
      await remover.query('BEGIN')
      removed = await rpcOn(
        remover,
        'public.remove_pilot_institution_teacher($1,$2,$3,$4)',
        [managerOne, institutionOne, teacherMemberRef, randomUUID()],
      )
      competing = rpcOn(
        competingWriter,
        'public.create_teacher_classroom($1,$2,$3)',
        [teacherOne, 'Kaldırma Yarışı', randomUUID()],
      ).then(
        (result) => ({ result, error: null }),
        (error) => ({ result: null, error }),
      )
      await new Promise((resolve) => setTimeout(resolve, 100))
      await remover.query('COMMIT')
    } finally {
      await remover.query('ROLLBACK').catch(() => undefined)
      await remover.end()
    }
    const competingOutcome = await competing
    await competingWriter.end()
    expect(removed).toMatchObject({ memberRef: teacherMemberRef, status: 'removed' })
    expect(competingOutcome.result).toBeNull()
    expect(competingOutcome.error?.code).toBe('42501')
    const retainedTeacherRole = await client.query(
      `SELECT count(*)::int AS count
       FROM public.user_roles AS user_role
       JOIN public.roles AS role ON role.id = user_role.role_id
       WHERE user_role.user_id = $1 AND role.slug = 'teacher_pilot'`,
      [teacherOne],
    )
    expect(retainedTeacherRole.rows[0].count).toBe(1)
    await expectPgError(
      () => rpc('public.add_pilot_institution_teacher($1,$2,$3,$4)', [
        managerTwo, institutionTwo, teacherOne, randomUUID(),
      ]),
      '23514',
    )
    await expectPgError(
      () => rpc('public.get_my_teacher_classrooms($1)', [teacherOne]),
      '42501',
    )
    await expectPgError(
      () => rpc('public.get_my_pilot_institution($1)', [teacherOne]),
      'P0002',
    )
  })

  it('enforces tenant-wide student seats, records immutable events and transfers the manager', async () => {
    const nextManager = capacityTeachers[5]
    const added = await rpc('public.add_pilot_institution_teacher($1,$2,$3,$4)', [
      managerTwo, institutionTwo, nextManager, randomUUID(),
    ])
    const firstClass = await rpc('public.create_teacher_classroom($1,$2,$3)', [
      nextManager, 'Kota Sınıfı A', randomUUID(),
    ])
    const secondClass = await rpc('public.create_teacher_classroom($1,$2,$3)', [
      nextManager, 'Kota Sınıfı B', randomUUID(),
    ])
    await client.query(
      'UPDATE public.pilot_institutions SET student_limit=1 WHERE id=$1',
      [institutionTwo],
    )

    const firstStudent = randomUUID()
    const secondStudent = randomUUID()
    await client.query(
      'INSERT INTO public.profiles(id,username,display_name) VALUES($1,$2,$3),($4,$5,$6)',
      [firstStudent, 'quota-student-one', 'Kota Öğrencisi Bir', secondStudent, 'quota-student-two', 'Kota Öğrencisi İki'],
    )
    const firstDigest = 'a'.repeat(64)
    const firstInviteRequest = randomUUID()
    const issuedInvite = await rpc('public.issue_teacher_classroom_invite($1,$2,$3,$4,$5,$6)', [
      nextManager, firstClass.classroom.id, firstDigest,
      new Date(Date.now() + 60 * 60 * 1000), 3, firstInviteRequest,
    ])
    const inviteAudit = await client.query(
      `SELECT classroom_id,target_ref FROM public.institution_operation_events
       WHERE event_type='invite_issued' AND request_id=$1`,
      [firstInviteRequest],
    )
    expect(inviteAudit.rows[0]).toMatchObject({
      classroom_id: firstClass.classroom.id,
      target_ref: issuedInvite.inviteRef,
    })
    const firstAcceptRequest = randomUUID()
    expect(await rpc('public.accept_teacher_classroom_invite($1,$2,$3,$4,$5)', [
      firstStudent, firstDigest, 'notice-v1', 'consent-v1', firstAcceptRequest,
    ])).toMatchObject({ membershipStatus: 'active', replayed: false })
    expect(await rpc('public.accept_teacher_classroom_invite($1,$2,$3,$4,$5)', [
      firstStudent, firstDigest, 'notice-v1', 'consent-v1', firstAcceptRequest,
    ])).toMatchObject({ replayed: true })
    await expectPgError(
      () => rpc('public.accept_teacher_classroom_invite($1,$2,$3,$4,$5)', [
        secondStudent, firstDigest, 'notice-v1', 'consent-v1', randomUUID(),
      ]),
      '23514',
    )

    const secondDigest = 'b'.repeat(64)
    await rpc('public.issue_teacher_classroom_invite($1,$2,$3,$4,$5,$6)', [
      nextManager, secondClass.classroom.id, secondDigest,
      new Date(Date.now() + 60 * 60 * 1000), 1, randomUUID(),
    ])
    expect(await rpc('public.accept_teacher_classroom_invite($1,$2,$3,$4,$5)', [
      firstStudent, secondDigest, 'notice-v1', 'consent-v1', randomUUID(),
    ])).toMatchObject({ membershipStatus: 'active' })
    expect((await rpc('public.get_my_pilot_institution($1)', [managerTwo])).institution)
      .toMatchObject({ studentCount: 1, studentLimit: 1 })

    const transferRequest = randomUUID()
    const transferred = await rpc('public.transfer_my_pilot_institution_manager($1,$2,$3)', [
      managerTwo, added.memberRef, transferRequest,
    ])
    expect(transferred).toMatchObject({
      previousManagerRef: expect.any(String),
      managerRef: added.memberRef,
      replayed: false,
    })
    expect(await rpc('public.transfer_my_pilot_institution_manager($1,$2,$3)', [
      managerTwo, added.memberRef, transferRequest,
    ])).toMatchObject({ managerRef: added.memberRef, replayed: true })
    await expectPgError(
      () => rpc('public.get_my_institution_role_directory($1)', [managerTwo]),
      '42501',
    )
    expect((await rpc('public.get_my_institution_role_directory($1)', [nextManager])).members)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ memberRef: added.memberRef, membershipRole: 'manager' }),
      ]))

    const audit = await rpc('public.get_my_institution_operation_events($1,$2)', [nextManager, 100])
    expect(audit.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'manager_transferred', subjectAlias: expect.any(String) }),
      expect.objectContaining({ eventType: 'student_joined', classroomName: 'Kota Sınıfı A' }),
      expect.objectContaining({ eventType: 'student_joined', classroomName: 'Kota Sınıfı B' }),
    ]))
    expect(audit.events.filter((event) => event.eventType === 'student_joined')).toHaveLength(2)

    const eventRow = await client.query(
      'SELECT id FROM public.institution_operation_events WHERE institution_id=$1 LIMIT 1',
      [institutionTwo],
    )
    await expectPgError(
      () => client.query('DELETE FROM public.institution_operation_events WHERE id=$1', [eventRow.rows[0].id]),
      '42501',
    )
  })

  it('denies direct tenant-table DML even to service_role', async () => {
    await expectPgError(
      () => service(
        'INSERT INTO public.pilot_institutions(name,created_by) VALUES($1,$2)',
        ['Direct', platformAdmin],
      ),
      '42501',
    )
    await expectPgError(
      () => service(
        'INSERT INTO public.institution_roles(institution_id,name,created_by) VALUES($1,$2,$3)',
        [institutionOne, 'Direct Role', managerOne],
      ),
      '42501',
    )
  })

  it('uses reviewRef as the immutable study-program review target', async () => {
    const requestId = randomUUID()
    const reviewRef = 'c'.repeat(32)
    await client.query(
      `INSERT INTO public.pilot_institution_requests(
         user_id,operation,request_id,payload_hash,result
       ) VALUES($1,'review_study_program',$2,$3,jsonb_build_object('reviewRef',$4::text))`,
      [managerOne, requestId, 'c'.repeat(64), reviewRef],
    )
    const event = await client.query(
      `SELECT target_ref FROM public.institution_operation_events
       WHERE event_type='study_program_reviewed' AND request_id=$1`,
      [requestId],
    )
    expect(event.rows[0].target_ref).toBe(reviewRef)
  })

  it('does not export student-owned rows merely because the requester is their teacher', async () => {
    await client.query(`
      CREATE TABLE public.dsar_teacher_student_fixture(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id uuid NOT NULL,
        teacher_id uuid NOT NULL,
        private_student_note text NOT NULL
      )
    `)
    await client.query(
      `INSERT INTO public.dsar_teacher_student_fixture(student_id,teacher_id,private_student_note)
       VALUES($1,$2,'student-only')`,
      [platformAdmin, teacherOne],
    )
    const teacherExport = await rpc('public.export_account_data($1)', [teacherOne])
    const studentExport = await rpc('public.export_account_data($1)', [platformAdmin])
    expect(teacherExport.tables.dsar_teacher_student_fixture).toBeUndefined()
    expect(studentExport.tables.dsar_teacher_student_fixture).toEqual([
      expect.objectContaining({ student_id: platformAdmin, private_student_note: 'student-only' }),
    ])
  })

  it('exports a minimized reporter-owned report without disclosing it to the reported user', async () => {
    await client.query(`
      CREATE TABLE public.user_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id uuid NOT NULL,
        reported_user_id uuid NOT NULL,
        report_type text NOT NULL,
        reason text,
        status text,
        admin_note text,
        resolved_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await client.query(
      `INSERT INTO public.user_reports(
         reporter_id,reported_user_id,report_type,reason,status,admin_note,resolved_by
       ) VALUES($1,$2,'spam','repeated messages','resolved','internal moderation note',$3)`,
      [teacherOne, platformAdmin, managerOne],
    )

    const reporterExport = await rpc('public.export_account_data($1)', [teacherOne])
    const reportedUserExport = await rpc('public.export_account_data($1)', [platformAdmin])
    expect(reporterExport.tables.user_reports).toEqual([
      expect.objectContaining({
        reportedUserId: platformAdmin,
        reportType: 'spam',
        reason: 'repeated messages',
        status: 'resolved',
      }),
    ])
    expect(reporterExport.tables.user_reports[0]).not.toHaveProperty('reporter_id')
    expect(reporterExport.tables.user_reports[0]).not.toHaveProperty('admin_note')
    expect(reporterExport.tables.user_reports[0]).not.toHaveProperty('resolved_by')
    expect(reportedUserExport.tables.user_reports).toBeUndefined()
  })

  it('prunes old idempotency rows without touching immutable institution events', async () => {
    const oldRequest = randomUUID()
    const teacherRequest = randomUUID()
    const eventCountBefore = await client.query(
      'SELECT count(*)::int AS count FROM public.institution_operation_events',
    )
    await client.query(
      `INSERT INTO public.pilot_institution_requests(
         user_id,operation,request_id,payload_hash,result,created_at
       ) VALUES($1,'retention_fixture',$2,$3,'{}'::jsonb,clock_timestamp()-interval '100 days')`,
      [platformAdmin, oldRequest, 'a'.repeat(64)],
    )
    await client.query(
      `INSERT INTO public.teacher_classroom_requests(
         user_id,operation,request_id,payload_hash,result,created_at
       ) VALUES($1,'retention_fixture',$2,$3,'{}'::jsonb,clock_timestamp()-interval '100 days')`,
      [platformAdmin, teacherRequest, 'b'.repeat(64)],
    )
    const result = await service(
      `SELECT public.prune_institution_request_ledgers(
         clock_timestamp()-interval '90 days'
       ) AS result`,
    )
    expect(result.rows[0].result).toMatchObject({
      pilotInstitutionRequestsDeleted: 1,
      teacherClassroomRequestsDeleted: 1,
      requestTombstonesCreated: 2,
    })
    const eventCountAfter = await client.query(
      'SELECT count(*)::int AS count FROM public.institution_operation_events',
    )
    expect(eventCountAfter.rows[0].count).toBe(eventCountBefore.rows[0].count)
    await expectPgError(
      () => client.query(
        `INSERT INTO public.pilot_institution_requests(
           user_id,operation,request_id,payload_hash,result
         ) VALUES($1,'retention_fixture_reuse',$2,$3,'{}'::jsonb)`,
        [platformAdmin, oldRequest, 'd'.repeat(64)],
      ),
      '23505',
    )
  })

  it('keeps a terminally archived tenant visible in the platform directory', async () => {
    await authenticatedRpc(
      platformAdmin,
      'public.set_pilot_institution_status($1,$2,$3,$4,$5)',
      [platformAdmin, institutionTwo, 'archived', 'Pilot sözleşmesi kapatıldı ve kayıt arşivlendi.', randomUUID()],
    )

    const directory = await authenticatedRpc(
      platformAdmin,
      'public.list_pilot_institutions($1)',
      [platformAdmin],
    )
    expect(directory.institutions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: institutionTwo, status: 'archived' }),
    ]))
  })

  it('releases 195-200 in order, replays safely, and rejects malformed proof rows', async () => {
    await client.query(`
      ALTER TABLE public.questions
        ADD COLUMN IF NOT EXISTS subcategory text,
        ADD COLUMN IF NOT EXISTS level_tag text,
        ADD COLUMN IF NOT EXISTS exam_ref text,
        ADD COLUMN IF NOT EXISTS base_points smallint DEFAULT 30,
        ADD COLUMN IF NOT EXISTS published_revision_id uuid;
      ALTER TABLE public.verified_attempts
        ADD COLUMN IF NOT EXISTS game text,
        ADD COLUMN IF NOT EXISTS mode text,
        ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        ADD COLUMN IF NOT EXISTS completed_at timestamptz,
        ADD COLUMN IF NOT EXISTS session_id uuid,
        ADD COLUMN IF NOT EXISTS question_ids uuid[];
      ALTER TABLE public.session_answers
        ADD COLUMN IF NOT EXISTS user_id uuid,
        ADD COLUMN IF NOT EXISTS question_id uuid,
        ADD COLUMN IF NOT EXISTS is_correct boolean,
        ADD COLUMN IF NOT EXISTS is_skipped boolean,
        ADD COLUMN IF NOT EXISTS question_revision_id uuid;
      ALTER TABLE public.curriculum_scope_releases
        ADD COLUMN IF NOT EXISTS mapping_mode text NOT NULL DEFAULT 'category_proxy',
        ADD COLUMN IF NOT EXISTS released_at timestamptz,
        ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();

      CREATE TABLE public.question_content_revisions(
        id uuid PRIMARY KEY,
        question_id uuid NOT NULL REFERENCES public.questions(id),
        status text NOT NULL,
        game text NOT NULL,
        category text NOT NULL,
        subcategory text,
        topic text,
        difficulty smallint NOT NULL,
        level_tag text,
        exam_ref text,
        content jsonb NOT NULL,
        content_sha256 text NOT NULL
      );
      CREATE TABLE public.question_outcomes(
        question_id uuid NOT NULL REFERENCES public.questions(id),
        outcome_id uuid NOT NULL REFERENCES public.curriculum_outcomes(id),
        weight numeric(6,3) NOT NULL DEFAULT 1,
        is_primary boolean NOT NULL DEFAULT false,
        mapping_source text NOT NULL DEFAULT 'manual',
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY(question_id,outcome_id)
      );
      CREATE TABLE public.verified_attempt_question_revisions(
        attempt_id uuid NOT NULL,
        question_id uuid NOT NULL,
        revision_id uuid,
        game text,
        category text,
        exam_ref text,
        difficulty smallint,
        PRIMARY KEY(attempt_id,question_id)
      );
      CREATE TABLE public.mastery_materialized_attempts(
        attempt_id uuid PRIMARY KEY
      );

      UPDATE public.curriculum_scope_releases
      SET mapping_mode='category_proxy', released_at=clock_timestamp(),
          updated_at=clock_timestamp()
      WHERE game='matematik' AND display_exam_ref='TYT';
      INSERT INTO public.curriculum_scope_releases(
        game,display_exam_ref,question_exam_ref,taxonomy_version,
        release_status,mapping_mode,diagnostic_enabled,released_at
      ) VALUES
        ('fen','TYT','TYT','ba-tyt-fen-v1','released','category_proxy',false,clock_timestamp()),
        ('turkce','TYT','TYT','ba-tyt-turkce-v2','released','category_proxy',false,clock_timestamp()),
        ('wordquest','YDT',NULL,'ba-ydt-eng-v1','released','split_scope',false,clock_timestamp()),
        ('sosyal','TYT','TYT','ba-tyt-sosyal-v1','draft','category_proxy',false,NULL);
      INSERT INTO public.test_curriculum_scope_integrity(
        game,display_exam_ref,taxonomy_version,result
      ) VALUES
        ('fen','TYT','ba-tyt-fen-v1',
          '{"total":10,"mapped":10,"unmapped":0,"scopeMismatch":0,"nodeOrphan":0,"outcomeOrphan":0,"primaryMismatch":0,"emptyOutcome":0}'::jsonb),
        ('turkce','TYT','ba-tyt-turkce-v2',
          '{"total":10,"mapped":10,"unmapped":0,"scopeMismatch":0,"nodeOrphan":0,"outcomeOrphan":0,"primaryMismatch":0,"emptyOutcome":0}'::jsonb),
        ('wordquest','YDT','ba-ydt-eng-v1',
          '{"total":14,"mapped":14,"unmapped":0,"scopeMismatch":0,"nodeOrphan":0,"outcomeOrphan":0,"primaryMismatch":0,"emptyOutcome":0}'::jsonb),
        ('sosyal','TYT','ba-tyt-sosyal-v1',
          '{"total":0,"mapped":0,"unmapped":0,"scopeMismatch":0,"nodeOrphan":0,"outcomeOrphan":0,"primaryMismatch":0,"emptyOutcome":1}'::jsonb);
    `)

    async function seedDiagnosticScope({
      game, displayExamRef, questionExamRef, taxonomyVersion, categories,
    }) {
      for (const [categoryIndex, categorySpec] of categories.entries()) {
        const [
          category,
          candidateCount,
          outcomeCode = `GATE-${game.toUpperCase()}-${categoryIndex + 1}`,
          mappingSource = 'taxonomy_auto',
          reuseExistingOutcome = false,
        ] = categorySpec
        const nodeId = randomUUID()
        let outcomeId
        await client.query(`INSERT INTO public.curriculum_nodes(
          id,parent_id,code,title,node_type,is_active,game,exam_ref,taxonomy_version,category
        ) VALUES($1,NULL,$2,$3,'outcome',true,$4,$5,$6,$7)`, [
          nodeId,
          `gate-${game}-${displayExamRef}-${category}`,
          `${game} ${category}`,
          game,
          displayExamRef,
          taxonomyVersion,
          category,
        ])
        if (reuseExistingOutcome) {
          const existingOutcome = (await client.query(`UPDATE public.curriculum_outcomes
            SET category=$2,sort_order=$3,node_id=$7
            WHERE code=$1
              AND game=$4
              AND exam_ref=$5
              AND taxonomy_version=$6
            RETURNING id`, [
            outcomeCode, category, categoryIndex + 1,
            game, displayExamRef, taxonomyVersion, nodeId,
          ])).rows
          expect(existingOutcome).toHaveLength(1)
          outcomeId = existingOutcome[0].id
        } else {
          outcomeId = randomUUID()
          await client.query(`INSERT INTO public.curriculum_outcomes(
            id,code,node_id,title,category,sort_order,game,exam_ref,taxonomy_version,is_active
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true)`, [
            outcomeId,
            outcomeCode,
            nodeId,
            `${game} ${category}`,
            category,
            categoryIndex + 1,
            game,
            displayExamRef,
            taxonomyVersion,
          ])
        }
        for (let questionIndex = 0; questionIndex < candidateCount; questionIndex += 1) {
          const questionId = randomUUID()
          const revisionId = randomUUID()
          const content = {
            question: `${game} ${category} ${questionIndex + 1}`,
            options: ['A', 'B', 'C', 'D'],
            answer: 1,
          }
          const contentHash = randomUUID().replaceAll('-', '').repeat(2)
          const difficulty = (questionIndex % 5) + 1
          await client.query(`INSERT INTO public.questions(
            id,game,category,difficulty,content,is_active,exam_ref,base_points
          ) VALUES($1,$2,$3,$4,$5::jsonb,true,$6,30)`, [
            questionId, game, category, difficulty, JSON.stringify(content), questionExamRef,
          ])
          await client.query(`INSERT INTO public.question_content_revisions(
            id,question_id,status,game,category,difficulty,exam_ref,content,content_sha256
          ) VALUES($1,$2,'published',$3,$4,$5,$6,$7::jsonb,$8)`, [
            revisionId, questionId, game, category, difficulty, questionExamRef,
            JSON.stringify(content), contentHash,
          ])
          await client.query(
            'UPDATE public.questions SET published_revision_id=$1 WHERE id=$2',
            [revisionId, questionId],
          )
          await client.query(`INSERT INTO public.question_outcomes(
            question_id,outcome_id,weight,is_primary,mapping_source,created_at
          ) SELECT $1,outcome.id,1,true,$3,
              CASE WHEN $3='manual' THEN outcome.created_at ELSE clock_timestamp() END
            FROM public.curriculum_outcomes AS outcome
            WHERE outcome.id=$2`, [questionId, outcomeId, mappingSource])
        }
      }
    }

    async function mathLegacyProvenance() {
      return (await client.query(`SELECT
        count(*)::integer AS mapping_count,
        count(*) FILTER (WHERE mapping.mapping_source='manual')::integer AS manual_count,
        count(*) FILTER (WHERE mapping.mapping_source='taxonomy_auto')::integer AS auto_count,
        bool_and(mapping.is_primary) AS all_primary,
        bool_and(mapping.weight=1) AS all_unit_weight,
        bool_and(mapping.created_at=outcome.created_at) AS timestamps_bound,
        (SELECT count(*)::integer
         FROM public.curriculum_outcomes AS scope_outcome
         WHERE scope_outcome.game='matematik'
           AND scope_outcome.exam_ref='TYT'
           AND scope_outcome.taxonomy_version='ba-tyt-math-v1'
           AND scope_outcome.is_active) AS scope_outcome_count
      FROM public.question_outcomes AS mapping
      JOIN public.curriculum_outcomes AS outcome ON outcome.id=mapping.outcome_id
      WHERE outcome.code='MAT-SAY-01'`)).rows[0]
    }

    await seedDiagnosticScope({
      game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
      taxonomyVersion: 'ba-tyt-math-v1',
      categories: [
        ['sayilar', 2, 'MAT-SAY-01', 'manual'],
        ['denklemler_gate', 2, 'MAT-TEST-01', 'taxonomy_auto', true],
        ['fonksiyonlar_gate', 2],
        ['problemler_gate', 2], ['geometri_gate', 1], ['olasilik_gate', 1],
      ],
    })
    await seedDiagnosticScope({
      game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
      taxonomyVersion: 'ba-tyt-fen-v1',
      categories: [['fizik', 4], ['kimya', 4], ['biyoloji', 2]],
    })
    await seedDiagnosticScope({
      game: 'turkce', displayExamRef: 'TYT', questionExamRef: 'TYT',
      taxonomyVersion: 'ba-tyt-turkce-v2',
      categories: [
        ['paragraf', 2], ['dil_bilgisi', 2], ['sozcuk', 2],
        ['anlam_bilgisi', 2], ['yazim_kurallari', 2],
      ],
    })
    await seedDiagnosticScope({
      game: 'wordquest', displayExamRef: 'YDT', questionExamRef: null,
      taxonomyVersion: 'ba-ydt-eng-v1',
      categories: [
        ['vocabulary', 2], ['phrasal_verbs', 2], ['grammar', 2],
        ['sentence_completion', 2], ['cloze_test', 2], ['restatement', 2],
        ['dialogue', 2],
      ],
    })

    expect(await mathLegacyProvenance()).toEqual({
      mapping_count: 2,
      manual_count: 2,
      auto_count: 0,
      all_primary: true,
      all_unit_weight: true,
      timestamps_bound: true,
      scope_outcome_count: 6,
    })

    await client.query(adaptiveDiagnosticSql)
    await client.query(adaptiveDiagnosticEvidenceSql)
    await client.query(adaptiveDiagnosticRegistryGateSql)
    await client.query(adaptiveDiagnosticV3Sql)
    expect(await mathLegacyProvenance()).toEqual({
      mapping_count: 2,
      manual_count: 0,
      auto_count: 2,
      all_primary: true,
      all_unit_weight: true,
      timestamps_bound: true,
      scope_outcome_count: 6,
    })

    async function expectMigrationRollback(setupSql, migrationSql) {
      await client.query('BEGIN')
      let caught
      try {
        await client.query(setupSql)
        await client.query(migrationSql)
      } catch (error) {
        caught = error
      } finally {
        await client.query('ROLLBACK')
      }
      expect(caught?.code).toBe('23514')
    }

    async function proofTimestamp(table, keyColumn, keyValue) {
      return (await client.query(
        `SELECT released_at::text,updated_at::text FROM public.${table} WHERE ${keyColumn}=$1`,
        [keyValue],
      )).rows[0]
    }

    const applied = []
    await expectMigrationRollback(`INSERT INTO public.adaptive_diagnostic_blueprints(
      blueprint_version,game,display_exam_ref,question_exam_ref,taxonomy_version,
      policy_version,question_count,outcome_count,max_per_outcome,
      candidate_gate_version,requires_revision_snapshot,capability_status,released_at
    ) VALUES('ba-tyt-fen-diagnostic-v1','fen','TYT','TYT','ba-tyt-fen-v1',
      'adaptive-screening-v1',10,3,4,'exact-single-outcome-v1',true,
      'validating',clock_timestamp())`, fenDiagnosticReleaseSql)
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.adaptive_diagnostic_blueprints
      WHERE blueprint_version='ba-tyt-fen-diagnostic-v1'`)).rows[0].count).toBe(0)
    expect((await client.query(`SELECT diagnostic_enabled FROM public.curriculum_scope_releases
      WHERE game='fen' AND display_exam_ref='TYT'`)).rows[0].diagnostic_enabled).toBe(false)

    await client.query(fenDiagnosticReleaseSql)
    applied.push(195)
    const fenDiagnosticProof = await proofTimestamp(
      'adaptive_diagnostic_blueprints', 'blueprint_version', 'ba-tyt-fen-diagnostic-v1',
    )
    await client.query(fenDiagnosticReleaseSql)
    expect(await proofTimestamp(
      'adaptive_diagnostic_blueprints', 'blueprint_version', 'ba-tyt-fen-diagnostic-v1',
    )).toEqual(fenDiagnosticProof)
    await client.query(`UPDATE public.curriculum_scope_releases SET diagnostic_enabled=false
      WHERE game='fen' AND display_exam_ref='TYT'`)
    await client.query(fenDiagnosticReleaseSql)
    expect((await client.query(
      "SELECT public.resolve_released_diagnostic_scope('fen','TYT') AS scope",
    )).rows[0].scope).toBeNull()
    await client.query(`UPDATE public.curriculum_scope_releases SET diagnostic_enabled=true
      WHERE game='fen' AND display_exam_ref='TYT'`)

    await expectMigrationRollback(`INSERT INTO public.institution_scope_capabilities(
      game,display_exam_ref,question_exam_ref,taxonomy_version,capability_status,
      scope_policy_version,student_analysis_enabled,aggregate_enabled,
      report_enabled,program_enabled,released_at
    ) VALUES('fen','TYT','TYT','ba-tyt-fen-v1','validating',
      'institution-scope-v1',true,true,false,false,clock_timestamp())`, fenInstitutionReleaseSql)
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.institution_scope_capabilities
      WHERE game='fen' AND display_exam_ref='TYT'`)).rows[0].count).toBe(0)
    await client.query(fenInstitutionReleaseSql)
    applied.push(196)
    const fenInstitutionProof = await proofTimestamp(
      'institution_scope_capabilities', 'game', 'fen',
    )
    await client.query(fenInstitutionReleaseSql)
    expect(await proofTimestamp(
      'institution_scope_capabilities', 'game', 'fen',
    )).toEqual(fenInstitutionProof)

    await expectMigrationRollback(`INSERT INTO public.adaptive_diagnostic_blueprints(
      blueprint_version,game,display_exam_ref,question_exam_ref,taxonomy_version,
      policy_version,question_count,outcome_count,max_per_outcome,
      candidate_gate_version,requires_revision_snapshot,capability_status,released_at
    ) VALUES('ba-tyt-turkce-diagnostic-v1','turkce','TYT','TYT','ba-tyt-turkce-v2',
      'adaptive-screening-v1',10,5,2,'exact-single-outcome-v1',true,
      'validating',clock_timestamp())`, turkishDiagnosticReleaseSql)
    await client.query(turkishDiagnosticReleaseSql)
    applied.push(197)
    const turkishDiagnosticProof = await proofTimestamp(
      'adaptive_diagnostic_blueprints', 'blueprint_version', 'ba-tyt-turkce-diagnostic-v1',
    )
    await client.query(turkishDiagnosticReleaseSql)
    expect(await proofTimestamp(
      'adaptive_diagnostic_blueprints', 'blueprint_version', 'ba-tyt-turkce-diagnostic-v1',
    )).toEqual(turkishDiagnosticProof)
    await client.query(`UPDATE public.curriculum_scope_releases SET diagnostic_enabled=false
      WHERE game='turkce' AND display_exam_ref='TYT'`)
    await client.query(turkishDiagnosticReleaseSql)
    expect((await client.query(
      "SELECT public.resolve_released_diagnostic_scope('turkce','TYT') AS scope",
    )).rows[0].scope).toBeNull()
    await client.query(`UPDATE public.curriculum_scope_releases SET diagnostic_enabled=true
      WHERE game='turkce' AND display_exam_ref='TYT'`)

    await expectMigrationRollback(`INSERT INTO public.institution_scope_capabilities(
      game,display_exam_ref,question_exam_ref,taxonomy_version,capability_status,
      scope_policy_version,student_analysis_enabled,aggregate_enabled,
      report_enabled,program_enabled,released_at
    ) VALUES('turkce','TYT','TYT','ba-tyt-turkce-v2','validating',
      'institution-scope-v1',true,true,false,false,clock_timestamp())`, turkishInstitutionReleaseSql)
    await client.query(turkishInstitutionReleaseSql)
    applied.push(198)
    const turkishInstitutionProof = await proofTimestamp(
      'institution_scope_capabilities', 'game', 'turkce',
    )
    await client.query(turkishInstitutionReleaseSql)
    expect(await proofTimestamp(
      'institution_scope_capabilities', 'game', 'turkce',
    )).toEqual(turkishInstitutionProof)

    await expectMigrationRollback(`INSERT INTO public.adaptive_diagnostic_blueprints(
      blueprint_version,game,display_exam_ref,question_exam_ref,taxonomy_version,
      policy_version,question_count,outcome_count,max_per_outcome,
      candidate_gate_version,requires_revision_snapshot,capability_status,released_at
    ) VALUES('ba-ydt-eng-diagnostic-v1','wordquest','YDT',NULL,'ba-ydt-eng-v1',
      'adaptive-screening-v1',10,7,2,'exact-single-outcome-v1',true,
      'validating',clock_timestamp())`, wordquestDiagnosticReleaseSql)
    await client.query(wordquestDiagnosticReleaseSql)
    applied.push(199)
    const wordquestDiagnosticProof = await proofTimestamp(
      'adaptive_diagnostic_blueprints', 'blueprint_version', 'ba-ydt-eng-diagnostic-v1',
    )
    await client.query(wordquestDiagnosticReleaseSql)
    expect(await proofTimestamp(
      'adaptive_diagnostic_blueprints', 'blueprint_version', 'ba-ydt-eng-diagnostic-v1',
    )).toEqual(wordquestDiagnosticProof)
    await client.query(`UPDATE public.curriculum_scope_releases SET diagnostic_enabled=false
      WHERE game='wordquest' AND display_exam_ref='YDT'`)
    await client.query(wordquestDiagnosticReleaseSql)
    expect((await client.query(
      "SELECT public.resolve_released_diagnostic_scope('wordquest','YDT') AS scope",
    )).rows[0].scope).toBeNull()
    await client.query(`UPDATE public.curriculum_scope_releases SET diagnostic_enabled=true
      WHERE game='wordquest' AND display_exam_ref='YDT'`)

    await expectMigrationRollback(`INSERT INTO public.institution_scope_capabilities(
      game,display_exam_ref,question_exam_ref,taxonomy_version,capability_status,
      scope_policy_version,student_analysis_enabled,aggregate_enabled,
      report_enabled,program_enabled,released_at
    ) VALUES('wordquest','YDT',NULL,'ba-ydt-eng-v1','validating',
      'institution-scope-v1',true,true,false,false,clock_timestamp())`, wordquestInstitutionReleaseSql)
    await client.query(wordquestInstitutionReleaseSql)
    applied.push(200)
    const wordquestInstitutionProof = await proofTimestamp(
      'institution_scope_capabilities', 'game', 'wordquest',
    )
    await client.query(wordquestInstitutionReleaseSql)
    expect(await proofTimestamp(
      'institution_scope_capabilities', 'game', 'wordquest',
    )).toEqual(wordquestInstitutionProof)
    expect(applied).toEqual([195, 196, 197, 198, 199, 200])

    // A deliberate emergency disable is an operator-owned forward state. A
    // full release-chain replay must revalidate immutable proof, keep every
    // released timestamp stable, and never switch diagnostics back on. The
    // already-released institution aggregate remains readable, but reports
    // the live diagnosticEnabled=false snapshot.
    await client.query(`UPDATE public.curriculum_scope_releases
      SET diagnostic_enabled=false
      WHERE (game,display_exam_ref) IN (('fen','TYT'),('turkce','TYT'),('wordquest','YDT'))`)
    for (const migrationSql of [
      fenDiagnosticReleaseSql,
      fenInstitutionReleaseSql,
      turkishDiagnosticReleaseSql,
      turkishInstitutionReleaseSql,
      wordquestDiagnosticReleaseSql,
      wordquestInstitutionReleaseSql,
    ]) await client.query(migrationSql)
    expect((await client.query(`SELECT game,diagnostic_enabled
      FROM public.curriculum_scope_releases
      WHERE game IN ('fen','turkce','wordquest') ORDER BY game`)).rows).toEqual([
      { game: 'fen', diagnostic_enabled: false },
      { game: 'turkce', diagnostic_enabled: false },
      { game: 'wordquest', diagnostic_enabled: false },
    ])
    for (const [game, examRef, diagnosticProof, institutionProof] of [
      ['fen', 'TYT', fenDiagnosticProof, fenInstitutionProof],
      ['turkce', 'TYT', turkishDiagnosticProof, turkishInstitutionProof],
      ['wordquest', 'YDT', wordquestDiagnosticProof, wordquestInstitutionProof],
    ]) {
      expect((await client.query(
        'SELECT public.resolve_released_diagnostic_scope($1,$2) AS scope',
        [game, examRef],
      )).rows[0].scope).toBeNull()
      expect((await client.query(
        'SELECT public.resolve_released_institution_scope($1,$2) AS scope',
        [game, examRef],
      )).rows[0].scope.diagnosticEnabled).toBe(false)
      expect(await proofTimestamp(
        'adaptive_diagnostic_blueprints', 'blueprint_version',
        `ba-${game === 'wordquest' ? 'ydt-eng' : `tyt-${game}`}-diagnostic-v1`,
      )).toEqual(diagnosticProof)
      expect(await proofTimestamp(
        'institution_scope_capabilities', 'game', game,
      )).toEqual(institutionProof)
    }
    await client.query(`UPDATE public.curriculum_scope_releases
      SET diagnostic_enabled=true
      WHERE (game,display_exam_ref) IN (('fen','TYT'),('turkce','TYT'),('wordquest','YDT'))`)

    const diagnosticScopes = {}
    const institutionScopes = {}
    for (const [game, examRef] of [['fen', 'TYT'], ['turkce', 'TYT'], ['wordquest', 'YDT']]) {
      diagnosticScopes[game] = (await client.query(
        'SELECT public.resolve_released_diagnostic_scope($1,$2) AS scope',
        [game, examRef],
      )).rows[0].scope
      institutionScopes[game] = (await client.query(
        'SELECT public.resolve_released_institution_scope($1,$2) AS scope',
        [game, examRef],
      )).rows[0].scope
    }
    expect(diagnosticScopes).toEqual({
      fen: {
        game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-fen-v1', policyVersion: 'adaptive-screening-v1',
        questionCount: 10, outcomeCount: 3, maxPerOutcome: 4,
      },
      turkce: {
        game: 'turkce', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-turkce-v2', policyVersion: 'adaptive-screening-v1',
        questionCount: 10, outcomeCount: 5, maxPerOutcome: 2,
      },
      wordquest: {
        game: 'wordquest', displayExamRef: 'YDT', questionExamRef: null,
        taxonomyVersion: 'ba-ydt-eng-v1', policyVersion: 'adaptive-screening-v1',
        questionCount: 10, outcomeCount: 7, maxPerOutcome: 2,
      },
    })
    expect(institutionScopes).toEqual({
      fen: {
        game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-fen-v1', scopePolicyVersion: 'institution-scope-v1',
        diagnosticEnabled: true,
      },
      turkce: {
        game: 'turkce', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-turkce-v2', scopePolicyVersion: 'institution-scope-v1',
        diagnosticEnabled: true,
      },
      wordquest: {
        game: 'wordquest', displayExamRef: 'YDT', questionExamRef: null,
        taxonomyVersion: 'ba-ydt-eng-v1', scopePolicyVersion: 'institution-scope-v1',
        diagnosticEnabled: true,
      },
    })

    expect((await client.query(`SELECT game,student_analysis_enabled,aggregate_enabled,
      report_enabled,program_enabled,capability_status
      FROM public.institution_scope_capabilities
      WHERE game IN ('fen','turkce','wordquest') ORDER BY game`)).rows).toEqual([
      { game: 'fen', student_analysis_enabled: true, aggregate_enabled: true, report_enabled: false, program_enabled: false, capability_status: 'released' },
      { game: 'turkce', student_analysis_enabled: true, aggregate_enabled: true, report_enabled: false, program_enabled: false, capability_status: 'released' },
      { game: 'wordquest', student_analysis_enabled: true, aggregate_enabled: true, report_enabled: false, program_enabled: false, capability_status: 'released' },
    ])
    for (const [game, examRef] of [['fen', 'TYT'], ['turkce', 'TYT'], ['wordquest', 'YDT']]) {
      await expectPgError(
        () => client.query(
          "SELECT public.institution_scope_capability_snapshot($1,$2,'report')",
          [game, examRef],
        ),
        'P0002',
      )
      await expectPgError(
        () => client.query(
          "SELECT public.institution_scope_capability_snapshot($1,$2,'program')",
          [game, examRef],
        ),
        'P0002',
      )
    }

    // Reuse the already-provisioned tenant: migration 168 deliberately keeps
    // the global provisioning gate closed, which must not be weakened merely
    // to exercise a read-only multi-scope RPC.
    const scopeManager = managerOne
    const scopeClassroom = (await client.query(`INSERT INTO public.teacher_classrooms(
      teacher_id,name,institution_id
    ) VALUES($1,'Release Gate Classroom',$2) RETURNING id`, [
      scopeManager, institutionOne,
    ])).rows[0].id
    const windowEnd = new Date()
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000)
    for (const [game, examRef, taxonomyVersion, questionExamRef] of [
      ['fen', 'TYT', 'ba-tyt-fen-v1', 'TYT'],
      ['turkce', 'TYT', 'ba-tyt-turkce-v2', 'TYT'],
      ['wordquest', 'YDT', 'ba-ydt-eng-v1', null],
    ]) {
      expect(await authenticatedRpc(
        scopeManager,
        'public.get_institution_classroom_published_program_members_v2($1,$2,$3,$4,$5,$6)',
        [scopeManager, scopeClassroom, game, examRef, windowStart, windowEnd],
      )).toEqual({
        scope: {
          game, examRef, questionExamRef, taxonomyVersion,
          scopePolicyVersion: 'institution-scope-v1',
        },
        memberRefs: [],
      })
    }

    expect((await client.query(`SELECT release_status,diagnostic_enabled,released_at
      FROM public.curriculum_scope_releases
      WHERE game='sosyal' AND display_exam_ref='TYT'`)).rows[0]).toEqual({
      release_status: 'draft', diagnostic_enabled: false, released_at: null,
    })
    expect((await client.query(`SELECT
      (SELECT count(*)::integer FROM public.adaptive_diagnostic_blueprints WHERE game='sosyal') AS diagnostic,
      (SELECT count(*)::integer FROM public.institution_scope_capabilities WHERE game='sosyal') AS institution`)).rows[0]).toEqual({
      diagnostic: 0, institution: 0,
    })
    expect((await client.query(
      "SELECT public.resolve_released_diagnostic_scope('sosyal','TYT') AS scope",
    )).rows[0].scope).toBeNull()
  }, 120_000)

  it('binds institution program execution to verified work, diagnostics, and a mature Istanbul review gate', async () => {
    // The 195-200 test above establishes the disposable question/revision and
    // diagnostic chain on which 201 depends.  Compile 201 only after that
    // real chain exists, rather than validating its trigger bodies as text.
    const legacyStudent = randomUUID()
    await client.query(
      'INSERT INTO public.profiles(id,username,display_name) VALUES($1,$2,$3)',
      [legacyStudent, 'legacy-diagnostic-student', 'legacy-diagnostic-student'],
    )
    const legacyClassroom = (await client.query(`INSERT INTO public.teacher_classrooms(
      teacher_id,name,institution_id
    ) VALUES($1,'Legacy Diagnostic Classroom',$2) RETURNING id`, [managerOne, institutionOne])).rows[0].id
    const legacyMembership = (await client.query(`INSERT INTO public.teacher_classroom_memberships(
      classroom_id,student_id
    ) VALUES($1,$2) RETURNING id`, [legacyClassroom, legacyStudent])).rows[0].id
    const legacyOutcomes = (await client.query(`SELECT code,title
      FROM public.curriculum_outcomes
      WHERE game='matematik' AND exam_ref='TYT' AND taxonomy_version='ba-tyt-math-v1'
        AND is_active
        AND code IN ('MAT-SAY-01','MAT-TEST-01','GATE-MATEMATIK-3')
      ORDER BY code`)).rows
    expect(legacyOutcomes).toHaveLength(3)
    const legacyWeekStart = (await client.query(
      "SELECT date_trunc('week',clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date AS value",
    )).rows[0].value
    const legacyProgram = (await client.query(`INSERT INTO public.institution_study_programs(
      institution_id,classroom_id,membership_id,student_id,teacher_id,week_start,status,
      daily_minute_limit,model_version,item_count,reviewed_at,published_at,
      game,display_exam_ref,question_exam_ref,taxonomy_version,scope_policy_version
    ) VALUES($1,$2,$3,$4,$5,$6,'published',30,'institution-program-v1',3,
      clock_timestamp(),clock_timestamp(),'matematik','TYT','TYT','ba-tyt-math-v1','institution-scope-v1'
    ) RETURNING id`, [
      institutionOne, legacyClassroom, legacyMembership, legacyStudent, managerOne, legacyWeekStart,
    ])).rows[0]
    for (let index = 0; index < legacyOutcomes.length; index += 1) {
      await client.query(`INSERT INTO public.institution_study_program_items(
        program_id,position,scheduled_date,task_type,title,reason_code,outcome_code,
        duration_minutes,target_question_count
      ) VALUES($1,$2,$3,'diagnostic',$4,'diagnostic_gap',$5,20,10)`, [
        legacyProgram.id, index + 1, legacyWeekStart,
        `${legacyOutcomes[index].title}: kısa durum tespiti`, legacyOutcomes[index].code,
      ])
    }
    await client.query(institutionProgramExecutionIntegritySql)
    await client.query(institutionProgramExecutionIntegritySql)

    expect((await client.query(`SELECT position,task_type,reason_code
      FROM public.institution_study_program_items WHERE program_id=$1 ORDER BY position`, [
      legacyProgram.id,
    ])).rows).toEqual([
      { position: 1, task_type: 'diagnostic', reason_code: 'diagnostic_gap' },
      { position: 2, task_type: 'verified_questions', reason_code: 'current_target' },
      { position: 3, task_type: 'verified_questions', reason_code: 'current_target' },
    ])
    const reconciliation = (await client.query(`SELECT position,origin,migration_id,reason,
      original_snapshot->>'taskType' AS original_task,
      reconciled_snapshot->>'taskType' AS reconciled_task
      FROM public.institution_program_item_reconciliations
      WHERE program_id=$1 ORDER BY position`, [legacyProgram.id])).rows
    expect(reconciliation).toEqual([
      {
        position: 2, origin: 'system_migration', migration_id: '201',
        reason: 'duplicate_full_scope_diagnostic_to_verified_baseline',
        original_task: 'diagnostic', reconciled_task: 'verified_questions',
      },
      {
        position: 3, origin: 'system_migration', migration_id: '201',
        reason: 'duplicate_full_scope_diagnostic_to_verified_baseline',
        original_task: 'diagnostic', reconciled_task: 'verified_questions',
      },
    ])
    expect((await client.query(`SELECT
      has_table_privilege('public','public.institution_program_item_reconciliations','SELECT') AS public_read,
      has_table_privilege('authenticated','public.institution_program_item_reconciliations','SELECT') AS authenticated_read,
      has_table_privilege('service_role','public.institution_program_item_reconciliations','SELECT') AS service_read`)).rows[0]).toEqual({
      public_read: false, authenticated_read: false, service_read: false,
    })
    await expectPgError(
      () => client.query(`UPDATE public.institution_program_item_reconciliations
        SET reconciled_snapshot=reconciled_snapshot WHERE program_id=$1`, [legacyProgram.id]),
      '42501',
    )

    const student = randomUUID()
    const otherStudent = randomUUID()
    const otherManager = randomUUID()
    for (const [id, name] of [
      [student, 'execution-student'], [otherStudent, 'execution-other'], [otherManager, 'execution-manager'],
    ]) {
      await client.query(
        'INSERT INTO public.profiles(id,username,display_name) VALUES($1,$2,$3)',
        [id, name, name],
      )
      await client.query(
        'INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,clock_timestamp())',
        [id, `${name}@example.com`],
      )
    }

    // Give the second learner a genuine, operational but distinct tenant.
    // Knowing a program_ref must not cross that tenant/student boundary.
    const otherInstitution = (await client.query(`INSERT INTO public.pilot_institutions(
      name,status,created_by,pilot_kind
    ) VALUES('Execution Foreign Tenant','active',$1,'legacy') RETURNING id`, [platformAdmin])).rows[0].id
    await client.query(`INSERT INTO public.pilot_institution_memberships(
      institution_id,user_id,role,assigned_by
    ) VALUES($1,$2,'manager',$3)`, [otherInstitution, otherManager, platformAdmin])
    const otherClassroom = (await client.query(`INSERT INTO public.teacher_classrooms(
      teacher_id,name,institution_id
    ) VALUES($1,'Foreign Execution Classroom',$2) RETURNING id`, [otherManager, otherInstitution])).rows[0].id
    const otherMembership = (await client.query(`INSERT INTO public.teacher_classroom_memberships(
      classroom_id,student_id
    ) VALUES($1,$2) RETURNING id,member_ref`, [otherClassroom, otherStudent])).rows[0]

    const classroom = (await client.query(`INSERT INTO public.teacher_classrooms(
      teacher_id,name,institution_id
    ) VALUES($1,'Execution Integrity Classroom',$2) RETURNING id`, [
      managerOne, institutionOne,
    ])).rows[0].id
    const membership = (await client.query(`INSERT INTO public.teacher_classroom_memberships(
      classroom_id,student_id
    ) VALUES($1,$2) RETURNING id,member_ref,accepted_at`, [classroom, student])).rows[0]
    const outcome = (await client.query(`SELECT id,code,category
      FROM public.curriculum_outcomes
      WHERE game='matematik' AND exam_ref='TYT' AND taxonomy_version='ba-tyt-math-v1'
        AND is_active AND code='MAT-SAY-01'`)).rows[0]
    expect(outcome).toEqual(expect.objectContaining({ code: expect.any(String), category: expect.any(String) }))
    const weekStart = (await client.query(
      "SELECT to_char(date_trunc('week',clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date,'YYYY-MM-DD') AS value",
    )).rows[0].value
    const today = (await client.query(
      "SELECT (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date AS value",
    )).rows[0].value
    const directBypassWeek = (await client.query(
      'SELECT ($1::date + 7)::text AS value', [weekStart],
    )).rows[0].value
    const directBypassItems = JSON.stringify([{
      position: 1,
      scheduledDate: directBypassWeek,
      taskType: 'paper_pack',
      title: 'Baslatilamayan eski RPC gorevi',
      reasonCode: 'challenge',
      durationMinutes: 20,
      targetQuestionCount: 40,
    }])
    const directBypassDraft = await authenticatedRpc(
      managerOne,
      'public.create_institution_study_program_draft_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        managerOne, classroom, membership.member_ref, 'matematik', 'TYT',
        directBypassWeek, 30, 'institution-program-v1', directBypassItems, randomUUID(),
      ],
    )
    await expectPgError(
      () => authenticatedRpc(
        managerOne,
        'public.publish_institution_study_program($1,$2,$3)',
        [managerOne, directBypassDraft.programRef, randomUUID()],
      ),
      '23514',
    )
    expect((await client.query(`SELECT status FROM public.institution_study_programs
      WHERE program_ref=$1`, [directBypassDraft.programRef])).rows[0]).toEqual({ status: 'draft' })

    let program
    await client.query('BEGIN')
    try {
      program = (await client.query(`INSERT INTO public.institution_study_programs(
        institution_id,classroom_id,membership_id,student_id,teacher_id,week_start,status,
        daily_minute_limit,model_version,item_count,
        game,display_exam_ref,question_exam_ref,taxonomy_version,scope_policy_version
      ) VALUES($1,$2,$3,$4,$5,$6,'draft',30,'institution-program-v1',3,
        'matematik','TYT','TYT','ba-tyt-math-v1','institution-scope-v1'
      ) RETURNING id,program_ref`, [
        institutionOne, classroom, membership.id, student, managerOne, weekStart,
      ])).rows[0]
      await client.query(`INSERT INTO public.institution_study_program_items(
        program_id,position,scheduled_date,task_type,title,reason_code,outcome_code,
        duration_minutes,target_question_count
      ) VALUES
        ($1,1,$2::date + 1,'verified_questions','Yarin acilacak pratik','weak_outcome',$3,20,10),
        ($1,2,$2,'verified_questions','On soruluk pratik','weak_outcome',$3,20,10),
        ($1,3,$2,'diagnostic','On soruluk kesif','diagnostic_gap',$3,20,10)`, [
        program.id, today, outcome.code,
      ])
      await client.query(`UPDATE public.institution_study_programs
        SET status='published',reviewed_at=clock_timestamp(),published_at=clock_timestamp()
        WHERE id=$1`, [program.id])
      await client.query('COMMIT')
    } catch (programError) {
      await client.query('ROLLBACK')
      throw programError
    }

    const retiredCapabilityItems = JSON.stringify([{
      position: 1,
      scheduledDate: weekStart,
      taskType: 'verified_questions',
      title: 'Yayin yetkisi emeklilik yarisi',
      reasonCode: 'weak_outcome',
      outcomeCode: outcome.code,
      durationMinutes: 20,
      targetQuestionCount: 10,
    }])
    const retiredCapabilityDraft = await authenticatedRpc(
      otherManager,
      'public.create_institution_study_program_draft_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [
        otherManager, otherClassroom, otherMembership.member_ref, 'matematik', 'TYT',
        weekStart, 30, 'institution-program-v1', retiredCapabilityItems, randomUUID(),
      ],
    )
    const retiredStartRequest = randomUUID()
    await client.query('BEGIN')
    try {
      await client.query(`UPDATE public.institution_scope_capabilities
        SET capability_status='retired'
        WHERE game='matematik' AND display_exam_ref='TYT'`)

      await client.query('SAVEPOINT retired_program_publish')
      await client.query('SELECT public.publish_institution_study_program($1,$2,$3)', [
        otherManager, retiredCapabilityDraft.programRef, randomUUID(),
      ])
      await expectPgError(
        () => client.query('SET CONSTRAINTS institution_program_startable_contract IMMEDIATE'),
        'P0002',
      )
      await client.query('ROLLBACK TO SAVEPOINT retired_program_publish')

      await client.query('SAVEPOINT retired_program_start')
      await expectPgError(
        () => client.query(
          'SELECT public.start_my_institution_study_program_item($1,$2,$3,$4)',
          [student, program.program_ref, 2, retiredStartRequest],
        ),
        'P0002',
      )
      await client.query('ROLLBACK TO SAVEPOINT retired_program_start')
    } finally {
      await client.query('ROLLBACK')
    }
    expect((await client.query(`SELECT status FROM public.institution_study_programs
      WHERE program_ref=$1`, [retiredCapabilityDraft.programRef])).rows[0]).toEqual({ status: 'draft' })
    expect((await client.query(`SELECT count(*)::integer AS count
      FROM public.institution_study_program_item_executions
      WHERE request_id=$1`, [retiredStartRequest])).rows[0]).toEqual({ count: 0 })

    // The student-facing RPC is server-only.  The execution table itself is
    // private too; public and authenticated callers have neither route.
    const acl = (await client.query(`SELECT
      has_function_privilege('public',
        'public.start_my_institution_study_program_item(uuid,text,smallint,uuid)', 'EXECUTE') AS public_start,
      has_function_privilege('anon',
        'public.start_my_institution_study_program_item(uuid,text,smallint,uuid)', 'EXECUTE') AS anon_start,
      has_function_privilege('authenticated',
        'public.start_my_institution_study_program_item(uuid,text,smallint,uuid)', 'EXECUTE') AS authenticated_start,
      has_function_privilege('service_role',
        'public.start_my_institution_study_program_item(uuid,text,smallint,uuid)', 'EXECUTE') AS service_start,
      has_function_privilege('public',
        'public.get_institution_student_diagnostic_sources(uuid,uuid,text,text,text,timestamptz)', 'EXECUTE') AS public_diagnostic,
      has_function_privilege('anon',
        'public.get_institution_student_diagnostic_sources(uuid,uuid,text,text,text,timestamptz)', 'EXECUTE') AS anon_diagnostic,
      has_function_privilege('authenticated',
        'public.get_institution_student_diagnostic_sources(uuid,uuid,text,text,text,timestamptz)', 'EXECUTE') AS authenticated_diagnostic,
      has_function_privilege('service_role',
        'public.get_institution_student_diagnostic_sources(uuid,uuid,text,text,text,timestamptz)', 'EXECUTE') AS service_diagnostic,
      has_function_privilege('public',
        'public.get_institution_student_reports_v2(uuid,uuid,text,text,text)', 'EXECUTE') AS public_reports,
      has_function_privilege('anon',
        'public.get_institution_student_reports_v2(uuid,uuid,text,text,text)', 'EXECUTE') AS anon_reports,
      has_function_privilege('authenticated',
        'public.get_institution_student_reports_v2(uuid,uuid,text,text,text)', 'EXECUTE') AS authenticated_reports,
      has_function_privilege('service_role',
        'public.get_institution_student_reports_v2(uuid,uuid,text,text,text)', 'EXECUTE') AS service_reports,
      has_table_privilege('public','public.institution_study_program_item_executions','SELECT') AS public_table,
      has_table_privilege('authenticated','public.institution_study_program_item_executions','SELECT') AS authenticated_table,
      has_table_privilege('service_role','public.institution_study_program_item_executions','SELECT') AS service_table`)).rows[0]
    expect(acl).toEqual({
      public_start: false, anon_start: false, authenticated_start: false, service_start: true,
      public_diagnostic: false, anon_diagnostic: false,
      authenticated_diagnostic: true, service_diagnostic: true,
      public_reports: false, anon_reports: false,
      authenticated_reports: false, service_reports: true,
      public_table: false, authenticated_table: false, service_table: false,
    })
    expect(await authenticatedRpc(
      managerOne,
      `public.get_institution_student_diagnostic_sources(
        $1,$2,$3,$4,$5,clock_timestamp()+interval '1 second'
      )`,
      [managerOne, classroom, membership.member_ref, 'matematik', 'TYT'],
    )).toEqual({ sources: [] })
    await expectPgError(
      () => authenticatedRpc(
        managerOne,
        `public.get_institution_student_diagnostic_sources(
          $1,$2,$3,$4,$5,clock_timestamp()+interval '1 second'
        )`,
        [managerOne, classroom, membership.member_ref, 'matematik', 'TYT'],
        'aal1',
      ),
      '42501',
    )
    await expectPgError(
      () => authenticatedRpc(
        otherManager,
        `public.get_institution_student_diagnostic_sources(
          $1,$2,$3,$4,$5,clock_timestamp()+interval '1 second'
        )`,
        [otherManager, classroom, membership.member_ref, 'matematik', 'TYT'],
      ),
      '42501',
    )
    await expectPgError(
      () => authenticatedRpc(
        student,
        'public.start_my_institution_study_program_item($1,$2,$3,$4)',
        [student, program.program_ref, 2, randomUUID()],
      ),
      '42501',
    )

    await expectPgError(
      () => rpc('public.start_my_institution_study_program_item($1,$2,$3,$4)', [
        student, program.program_ref, 1, randomUUID(),
      ]),
      '22023',
    )
    await expectPgError(
      () => rpc('public.start_my_institution_study_program_item($1,$2,$3,$4)', [
        otherStudent, program.program_ref, 2, randomUUID(),
      ]),
      'P0002',
    )

    const seedPracticeAttempt = async (attemptId, sessionId, startedAtSql = 'clock_timestamp()') => {
      await client.query('INSERT INTO public.game_sessions(id,user_id) VALUES($1,$2)', [sessionId, student])
      await client.query(`INSERT INTO public.verified_attempts(id,user_id,game,mode,started_at)
        VALUES($1,$2,'matematik','practice',${startedAtSql})`, [attemptId, student])
      for (let index = 0; index < 10; index += 1) {
        const answerId = randomUUID()
        await client.query(`INSERT INTO public.session_answers(
          id,session_id,user_id,question_id,is_correct,is_skipped
        ) VALUES($1,$2,$3,$4,true,false)`, [answerId, sessionId, student, randomUUID()])
        await client.query(`INSERT INTO public.mastery_outcome_evidence(
          answer_id,attempt_id,user_id,outcome_id,is_correct,mapping_weight,
          difficulty_weighted_earned,difficulty_weighted_possible,max_hint_stage
        ) VALUES($1,$2,$3,$4,true,1,1,1,0)`, [answerId, attemptId, student, outcome.id])
      }
    }
    const preStartSessionId = randomUUID()
    const preStartAttemptId = randomUUID()
    await seedPracticeAttempt(
      preStartAttemptId, preStartSessionId, "clock_timestamp()-interval '1 minute'",
    )

    const practiceRequest = randomUUID()
    const startedPractice = await rpc('public.start_my_institution_study_program_item($1,$2,$3,$4)', [
      student, program.program_ref, 2, practiceRequest,
    ])
    expect(startedPractice).toMatchObject({ status: 'started', replayed: false })
    expect(startedPractice.startTarget).toMatchObject({ kind: 'practice', requiredMode: 'practice' })
    expect(startedPractice.startTarget.href).toContain('mode=practice')
    expect(await rpc('public.start_my_institution_study_program_item($1,$2,$3,$4)', [
      student, program.program_ref, 2, practiceRequest,
    ])).toMatchObject({ status: 'started', replayed: true })
    await expectPgError(
      () => rpc('public.start_my_institution_study_program_item($1,$2,$3,$4)', [
        student, program.program_ref, 3, randomUUID(),
      ]),
      '23505',
    )

    await client.query(`UPDATE public.verified_attempts
      SET session_id=$2,completed_at=clock_timestamp() WHERE id=$1`, [preStartAttemptId, preStartSessionId])
    expect((await client.query(`SELECT execution.status,
        execution.verified_attempt_id IS NOT NULL AS bound,
        attempt.started_at<execution.started_at AS source_predates_execution
      FROM public.institution_study_program_item_executions execution
      JOIN public.verified_attempts attempt ON attempt.id=$2
      WHERE execution.program_id=$1 AND execution.position=2`, [
      program.id, preStartAttemptId,
    ])).rows[0]).toEqual({
      status: 'started', bound: false, source_predates_execution: true,
    })

    const sessionId = randomUUID()
    const attemptId = randomUUID()
    await seedPracticeAttempt(attemptId, sessionId)
    await client.query(`UPDATE public.verified_attempts
      SET session_id=$2,completed_at=clock_timestamp() WHERE id=$1`, [attemptId, sessionId])
    expect((await client.query(`SELECT status,verified_attempt_id IS NOT NULL AS bound
      FROM public.institution_study_program_item_executions
      WHERE program_id=$1 AND position=2`, [program.id])).rows[0]).toEqual({
      status: 'completed', bound: true,
    })
    expect((await client.query(`SELECT status FROM public.institution_study_program_items
      WHERE program_id=$1 AND position=2`, [program.id])).rows[0]).toEqual({ status: 'completed' })

    const diagnosticQuestions = (await client.query(`SELECT DISTINCT ON (mapping.outcome_id)
      question.id,mapping.outcome_id
      FROM public.questions AS question
      JOIN public.question_outcomes AS mapping
        ON mapping.question_id=question.id AND mapping.is_primary
      JOIN public.curriculum_outcomes AS mapped_outcome
        ON mapped_outcome.id=mapping.outcome_id
      WHERE question.game='matematik' AND question.exam_ref='TYT' AND question.is_active
        AND mapped_outcome.game='matematik' AND mapped_outcome.exam_ref='TYT'
        AND mapped_outcome.taxonomy_version='ba-tyt-math-v1'
      ORDER BY mapping.outcome_id,question.id`)).rows
    const diagnosticCandidates = (await client.query(`SELECT question.id,mapping.outcome_id
      FROM public.questions AS question
      JOIN public.question_outcomes AS mapping
        ON mapping.question_id=question.id AND mapping.is_primary
      JOIN public.curriculum_outcomes AS mapped_outcome
        ON mapped_outcome.id=mapping.outcome_id
      WHERE question.game='matematik' AND question.exam_ref='TYT' AND question.is_active
        AND mapped_outcome.game='matematik' AND mapped_outcome.exam_ref='TYT'
        AND mapped_outcome.taxonomy_version='ba-tyt-math-v1'
      ORDER BY mapping.outcome_id,question.id`)).rows
    const firstPerOutcome = diagnosticQuestions.map((row) => row.id)
    const remaining = diagnosticCandidates
      .filter((row) => !firstPerOutcome.includes(row.id))
      .map((row) => row.id)
    const diagnosticPlan = [...firstPerOutcome, ...remaining].slice(0, 10)
    expect(diagnosticPlan).toHaveLength(10)

    const finishDiagnosticSession = async (sessionId, firstQuestionId) => {
      let currentQuestionId = firstQuestionId
      for (let index = 0; index < 10; index += 1) {
        const nextQuestionId = index === 9 ? null : diagnosticPlan[index + 1]
        const recorded = await rpc('public.record_adaptive_diagnostic_answer_v3($1,$2,$3,$4,$5,$6,$7)', [
          student, sessionId, currentQuestionId, 0, 100, randomUUID(), nextQuestionId,
        ])
        if (index < 9) currentQuestionId = recorded.nextQuestionId
        else expect(recorded.status).toBe('completed')
      }
    }

    const preStartDiagnosticId = randomUUID()
    const preStartDiagnostic = await rpc('public.start_adaptive_diagnostic_v3($1,$2,$3,$4,$5)', [
      student, preStartDiagnosticId, 'matematik', 'TYT', diagnosticPlan[0],
    ])
    expect(preStartDiagnostic).toMatchObject({
      sessionId: preStartDiagnosticId, resumed: false, questionCount: 10,
    })

    const startedDiagnostic = await rpc('public.start_my_institution_study_program_item($1,$2,$3,$4)', [
      student, program.program_ref, 3, randomUUID(),
    ])
    expect(startedDiagnostic).toMatchObject({ status: 'started', replayed: false })
    expect(startedDiagnostic.startTarget).toMatchObject({ kind: 'diagnostic', requiredMode: 'diagnostic' })

    await finishDiagnosticSession(preStartDiagnosticId, preStartDiagnostic.currentQuestionId)
    expect((await client.query(`SELECT execution.status,
        execution.diagnostic_session_id IS NOT NULL AS bound,
        session.started_at<execution.started_at AS source_predates_execution
      FROM public.institution_study_program_item_executions execution
      JOIN public.adaptive_diagnostic_sessions session ON session.id=$2
      WHERE execution.program_id=$1 AND execution.position=3`, [
      program.id, preStartDiagnosticId,
    ])).rows[0]).toEqual({
      status: 'started', bound: false, source_predates_execution: true,
    })

    const diagnosticSessionId = randomUUID()
    const startedSession = await rpc('public.start_adaptive_diagnostic_v3($1,$2,$3,$4,$5)', [
      student, diagnosticSessionId, 'matematik', 'TYT', diagnosticPlan[0],
    ])
    expect(startedSession).toMatchObject({ sessionId: diagnosticSessionId, resumed: false, questionCount: 10 })
    await finishDiagnosticSession(diagnosticSessionId, startedSession.currentQuestionId)
    expect((await client.query(`SELECT status,diagnostic_session_id IS NOT NULL AS bound
      FROM public.institution_study_program_item_executions
      WHERE program_id=$1 AND position=3`, [program.id])).rows[0]).toEqual({
      status: 'completed', bound: true,
    })
    expect((await client.query(`SELECT status FROM public.institution_study_program_items
      WHERE program_id=$1 AND position=3`, [program.id])).rows[0]).toEqual({ status: 'completed' })

    // Publication age alone is intentionally insufficient.  The same program
    // becomes eligible only after an executed item exists and the Istanbul
    // calendar reaches weekStart + 14 days.
    expect((await client.query(`SELECT
      public.institution_study_program_review_ready($1,$2::date) AS before_maturity,
      public.institution_study_program_review_ready($1,$3::date) AS at_maturity`, [
      program.id,
      (await client.query('SELECT ($1::date + 13)::text AS value', [weekStart])).rows[0].value,
      (await client.query('SELECT ($1::date + 14)::text AS value', [weekStart])).rows[0].value,
    ])).rows[0]).toEqual({ before_maturity: false, at_maturity: true })
    const completionEvents = (await client.query(`SELECT count(*)::int AS count
      FROM public.institution_operation_events
      WHERE source='program_execution' AND target_ref=$1
        AND event_type IN ('study_program_item_started','study_program_item_completed')`, [program.program_ref])).rows[0]
    expect(completionEvents.count).toBe(4)

    // Evidence visible to an institution begins no earlier than the exact
    // classroom acceptance instant, even when the nominal baseline reaches
    // two weeks farther back.
    expect((await client.query(`SELECT
      (public.institution_study_program_review_evidence($1)->>'baselineWindowStart')::timestamptz
        = membership.accepted_at AS baseline_clamped,
      (public.institution_study_program_review_evidence($1)->>'currentWindowStart')::timestamptz
        >= membership.accepted_at AS current_clamped
      FROM public.teacher_classroom_memberships membership WHERE membership.id=$2`, [
      program.id, membership.id,
    ])).rows[0]).toEqual({ baseline_clamped: true, current_clamped: true })

    // A soft-deleted learner may still have an auth session and an active
    // membership.  Neither replay nor a late attempt completion may use that
    // stale lifecycle state to advance an institution-owned task.
    const deletedStudent = randomUUID()
    await client.query(
      'INSERT INTO public.profiles(id,username,display_name) VALUES($1,$2,$3)',
      [deletedStudent, 'execution-deleted', 'execution-deleted'],
    )
    await client.query(
      'INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,clock_timestamp())',
      [deletedStudent, 'execution-deleted@example.com'],
    )
    const deletedMembership = (await client.query(`INSERT INTO public.teacher_classroom_memberships(
      classroom_id,student_id
    ) VALUES($1,$2) RETURNING id,member_ref`, [classroom, deletedStudent])).rows[0]
    let deletedProgram
    await client.query('BEGIN')
    try {
      deletedProgram = (await client.query(`INSERT INTO public.institution_study_programs(
        institution_id,classroom_id,membership_id,student_id,teacher_id,week_start,status,
        daily_minute_limit,model_version,item_count,
        game,display_exam_ref,question_exam_ref,taxonomy_version,scope_policy_version
      ) VALUES($1,$2,$3,$4,$5,$6,'draft',30,'institution-program-v1',1,
        'matematik','TYT','TYT','ba-tyt-math-v1','institution-scope-v1'
      ) RETURNING id,program_ref`, [
        institutionOne, classroom, deletedMembership.id, deletedStudent, managerOne, weekStart,
      ])).rows[0]
      await client.query(`INSERT INTO public.institution_study_program_items(
        program_id,position,scheduled_date,task_type,title,reason_code,outcome_code,
        duration_minutes,target_question_count
      ) VALUES($1,1,$2,'verified_questions','Silinmis profil yarisi','weak_outcome',$3,20,10)`, [
        deletedProgram.id, today, outcome.code,
      ])
      await client.query(`UPDATE public.institution_study_programs
        SET status='published',reviewed_at=clock_timestamp(),published_at=clock_timestamp()
        WHERE id=$1`, [deletedProgram.id])
      await client.query('COMMIT')
    } catch (deletedProgramError) {
      await client.query('ROLLBACK')
      throw deletedProgramError
    }
    await client.query(`INSERT INTO public.institution_student_reports(
      institution_id,classroom_id,membership_id,student_id,teacher_id,
      model_version,period_start,period_end,snapshot,
      game,display_exam_ref,question_exam_ref,taxonomy_version,scope_policy_version
    ) VALUES($1,$2,$3,$4,$5,'institution-student-report-v1',
      clock_timestamp()-interval '1 day',clock_timestamp(),$6::jsonb,
      'matematik','TYT','TYT','ba-tyt-math-v1','institution-scope-v1')`, [
      institutionOne, classroom, deletedMembership.id, deletedStudent, managerOne,
      JSON.stringify({
        modelVersion: 'institution-student-report-v1',
        scope: {
          game: 'matematik', examRef: 'TYT', questionExamRef: 'TYT',
          taxonomyVersion: 'ba-tyt-math-v1', scopePolicyVersion: 'institution-scope-v1',
        },
      }),
    ])
    expect((await rpc(
      'public.get_institution_student_reports_v2($1,$2,$3,$4,$5)',
      [managerOne, classroom, deletedMembership.member_ref, 'matematik', 'TYT'],
    )).reports).toHaveLength(1)
    const deletedRequest = randomUUID()
    expect(await rpc('public.start_my_institution_study_program_item($1,$2,$3,$4)', [
      deletedStudent, deletedProgram.program_ref, 1, deletedRequest,
    ])).toMatchObject({ status: 'started', replayed: false })
    const deletedSessionId = randomUUID()
    const deletedAttemptId = randomUUID()
    await client.query('INSERT INTO public.game_sessions(id,user_id) VALUES($1,$2)', [
      deletedSessionId, deletedStudent,
    ])
    await client.query(`INSERT INTO public.verified_attempts(id,user_id,game,mode)
      VALUES($1,$2,'matematik','practice')`, [deletedAttemptId, deletedStudent])
    for (let index = 0; index < 10; index += 1) {
      const answerId = randomUUID()
      await client.query(`INSERT INTO public.session_answers(
        id,session_id,user_id,question_id,is_correct,is_skipped
      ) VALUES($1,$2,$3,$4,true,false)`, [
        answerId, deletedSessionId, deletedStudent, randomUUID(),
      ])
      await client.query(`INSERT INTO public.mastery_outcome_evidence(
        answer_id,attempt_id,user_id,outcome_id,is_correct,mapping_weight,
        difficulty_weighted_earned,difficulty_weighted_possible,max_hint_stage
      ) VALUES($1,$2,$3,$4,true,1,1,1,0)`, [
        answerId, deletedAttemptId, deletedStudent, outcome.id,
      ])
    }
    await client.query('UPDATE public.profiles SET deleted_at=clock_timestamp() WHERE id=$1', [deletedStudent])
    await expectPgError(
      () => rpc('public.get_institution_student_reports_v2($1,$2,$3,$4,$5)', [
        managerOne, classroom, deletedMembership.member_ref, 'matematik', 'TYT',
      ]),
      'P0002',
    )
    await client.query(`UPDATE public.verified_attempts
      SET session_id=$2,completed_at=clock_timestamp() WHERE id=$1`, [deletedAttemptId, deletedSessionId])
    expect((await client.query(`SELECT execution.status,item.status AS item_status
      FROM public.institution_study_program_item_executions execution
      JOIN public.institution_study_program_items item
        ON item.program_id=execution.program_id AND item.position=execution.position
      WHERE execution.program_id=$1 AND execution.position=1`, [deletedProgram.id])).rows[0]).toEqual({
      status: 'started', item_status: 'pending',
    })
    expect((await rpc('public.get_my_institution_study_programs($1,$2)', [
      deletedStudent, today,
    ])).programs).toEqual([])
    await expectPgError(
      () => rpc('public.start_my_institution_study_program_item($1,$2,$3,$4)', [
        deletedStudent, deletedProgram.program_ref, 1, deletedRequest,
      ]),
      'P0002',
    )

    // Withdrawing the original membership immediately removes review access;
    // a published historical program is not an authorization grant.
    await client.query(`UPDATE public.teacher_classroom_memberships
      SET status='withdrawn',ended_at=clock_timestamp() WHERE id=$1`, [membership.id])
    expect((await client.query(`SELECT
      public.institution_study_program_review_ready($1,$2::date) AS ready`, [
      program.id,
      (await client.query('SELECT ($1::date + 14)::text AS value', [weekStart])).rows[0].value,
    ])).rows[0]).toEqual({ ready: false })
    await expectPgError(
      () => rpc('public.preview_institution_study_program_review($1,$2)', [
        managerOne, program.program_ref,
      ]),
      'P0002',
    )
  }, 120_000)
})
