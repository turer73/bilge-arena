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
  .filter((name) => /^(11[4-9]|12[0-4])_.*\.sql$/.test(name))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), 'utf8') }))

suite('112-124 institution pilot real PostgreSQL acceptance', () => {
  let client
  let platformAdmin
  let managerOne
  let managerTwo
  let teacherOne
  let institutionOne
  let institutionTwo
  let teacherMemberRef
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
  })
})
