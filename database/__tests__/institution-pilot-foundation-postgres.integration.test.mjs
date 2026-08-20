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

suite('112-127 and 131-132 institution pilot real PostgreSQL acceptance', () => {
  let client
  let platformAdmin
  let managerOne
  let managerTwo
  let teacherOne
  let institutionOne
  let institutionTwo
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

  async function expectPgError(action, code) {
    let caught
    try {
      await action()
    } catch (error) {
      caught = error
    }
    expect(caught?.code).toBe(code)
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
      CREATE TABLE public.verified_attempts(id uuid PRIMARY KEY);
      CREATE TABLE public.game_sessions(id uuid PRIMARY KEY);
      CREATE TABLE public.session_answers(id uuid PRIMARY KEY);
      CREATE TABLE public.review_cards(id uuid PRIMARY KEY);
      CREATE TABLE public.review_logs(id uuid PRIMARY KEY);
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
    teacherOne = randomUUID()
    for (let index = 0; index < 6; index += 1) capacityTeachers.push(randomUUID())
    const users = [platformAdmin, managerOne, managerTwo, teacherOne, ...capacityTeachers]
    for (const [index, userId] of users.entries()) {
      await client.query(
        'INSERT INTO public.profiles(id,username,display_name) VALUES($1,$2,$3)',
        [userId, `pilot-${index}`, `Pilot ${index}`],
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
    expect(managerTeacherGuard.rows[0].allowed).toBe(true)

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

  it('lists tenants for platform admins without exposing the directory to managers', async () => {
    await expectPgError(
      () => rpc('public.list_pilot_institutions($1)', [managerOne]),
      '42501',
    )
    const directory = await rpc('public.list_pilot_institutions($1)', [platformAdmin])
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
    expect(await rpc('public.institution_support_has_access($1,$2)', [platformAdmin, institutionOne]))
      .toBe(true)
    expect(await rpc('public.institution_support_has_access($1,$2)', [managerOne, institutionOne]))
      .toBe(false)
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
    expect(await rpc('public.institution_support_has_access($1,$2)', [platformAdmin, institutionOne]))
      .toBe(false)
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
    const requestId = randomUUID()
    const added = await rpc('public.add_pilot_institution_teacher($1,$2,$3,$4)', [
      managerOne, institutionOne, teacherOne, requestId,
    ])
    teacherMemberRef = added.memberRef
    expect(added).toMatchObject({ role: 'teacher', replayed: false })
    expect(await rpc('public.add_pilot_institution_teacher($1,$2,$3,$4)', [
      managerOne, institutionOne, teacherOne, requestId,
    ])).toMatchObject({ memberRef: teacherMemberRef, replayed: true })
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
    const managerClassroom = await rpc('public.create_teacher_classroom($1,$2,$3)', [
      managerOne, 'Kurum Yöneticisi Sınıfı', randomUUID(),
    ])
    expect((await rpc('public.get_institution_tracking_directory($1)', [teacherOne])).classrooms)
      .toHaveLength(1)

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
    expect(await rpc('public.institution_member_has_permission($1,$2,$3)', [
      teacherOne, institutionOne, 'institution.classrooms.view_all',
    ])).toBe(true)
    expect((await rpc('public.get_institution_tracking_directory($1)', [teacherOne])).classrooms)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: managerClassroom.classroom.id }),
      ]))
  })

  it('blocks cross-tenant management and enforces the six-person capacity', async () => {
    const second = await rpc('public.provision_pilot_institution($1,$2,$3,$4)', [
      platformAdmin, 'Bilge Pilot İki', managerTwo, randomUUID(),
    ])
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
    const removed = await rpc('public.remove_pilot_institution_teacher($1,$2,$3,$4)', [
      managerOne, institutionOne, teacherMemberRef, randomUUID(),
    ])
    expect(removed).toMatchObject({ memberRef: teacherMemberRef, status: 'removed' })
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
})
