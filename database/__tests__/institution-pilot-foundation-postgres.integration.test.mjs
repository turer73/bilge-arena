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

suite('112-127, 131-135, 145, 149-160, 167-168 and 182-183 institution pilot real PostgreSQL acceptance', () => {
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
      CREATE TABLE public.curriculum_outcomes(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text UNIQUE NOT NULL,
        game text NOT NULL,
        exam_ref text,
        taxonomy_version text,
        is_active boolean NOT NULL DEFAULT true
      );
      CREATE TABLE public.mastery_outcome_evidence(
        answer_id uuid NOT NULL,
        attempt_id uuid NOT NULL,
        user_id uuid NOT NULL,
        outcome_id uuid NOT NULL,
        difficulty_weighted_earned numeric NOT NULL DEFAULT 0,
        difficulty_weighted_possible numeric NOT NULL DEFAULT 0
      );
      CREATE TABLE public.review_cards(id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE public.review_logs(id uuid PRIMARY KEY, user_id uuid);
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
      taxonomy_version text NOT NULL,
      release_status text NOT NULL,
      diagnostic_enabled boolean NOT NULL DEFAULT false,
      PRIMARY KEY(game, display_exam_ref)
    )`)
    await client.query(`INSERT INTO public.curriculum_scope_releases(
      game,display_exam_ref,taxonomy_version,release_status,diagnostic_enabled
    ) VALUES('matematik','TYT','ba-tyt-math-v1','released',true)`)
    await client.query(`INSERT INTO public.curriculum_outcomes(
      code,game,exam_ref,taxonomy_version,is_active
    ) VALUES('MAT-TEST-01','matematik','TYT','ba-tyt-math-v1',true)`)
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
      taskType: 'verified_questions',
      title: 'Canary tekrar çalışması',
      reasonCode: 'current_target',
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
      SET taxonomy_version='ba-tyt-math-v1'
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
  })

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
})
