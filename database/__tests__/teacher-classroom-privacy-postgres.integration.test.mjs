import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const url = process.env.TEACHER_CLASSROOM_TEST_DATABASE_URL
if (url && process.env.TEACHER_CLASSROOM_TEST_DATABASE_DISPOSABLE !== '1') {
  throw new Error('Set TEACHER_CLASSROOM_TEST_DATABASE_DISPOSABLE=1')
}
if (url && !/^bilge_r42_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) {
  throw new Error('Refusing non-disposable teacher-classroom database')
}

const suite = url && process.env.TEACHER_CLASSROOM_TEST_DATABASE_DISPOSABLE === '1'
  ? describe
  : describe.skip
const migrationSql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '105_teacher_classroom_privacy.sql'),
  'utf8',
)

const digest = (value) => createHash('sha256').update(value).digest('hex')

suite('105 teacher classroom privacy real PostgreSQL acceptance', () => {
  let client
  let teacher
  let otherTeacher
  let nonTeacher
  let studentOne
  let studentTwo
  let studentThree
  let studentFour
  let lateStudent
  let classroomId
  let assignmentId
  let questionIds
  let inviteDigest

  async function service(query, values = [], target = client) {
    await target.query('SET ROLE service_role')
    try {
      return await target.query(query, values)
    } finally {
      await target.query('RESET ROLE')
    }
  }

  async function rpc(expression, values = [], target = client) {
    const result = await service(`SELECT ${expression} AS result`, values, target)
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

  async function createClass(owner, name = '12-A Matematik') {
    return rpc('public.create_teacher_classroom($1,$2,$3)', [owner, name, randomUUID()])
  }

  async function issueInvite(owner, classId, tokenDigest, maxUses = 10) {
    return rpc(
      "public.issue_teacher_classroom_invite($1,$2,$3,clock_timestamp()+interval '1 day',$4,$5)",
      [owner, classId, tokenDigest, maxUses, randomUUID()],
    )
  }

  async function acceptInvite(student, tokenDigest, requestId = randomUUID(), target = client) {
    const result = await service(
      'SELECT public.accept_teacher_classroom_invite($1,$2,$3,$4,$5) AS result',
      [student, tokenDigest, 'notice-v1', 'share-v1', requestId],
      target,
    )
    return result.rows[0].result
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query(`
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA auth;
      CREATE SCHEMA public;
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
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
        UNIQUE(user_id, role_id)
      );
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
    await client.query(migrationSql)

    teacher = randomUUID()
    otherTeacher = randomUUID()
    nonTeacher = randomUUID()
    studentOne = randomUUID()
    studentTwo = randomUUID()
    studentThree = randomUUID()
    studentFour = randomUUID()
    lateStudent = randomUUID()
    await client.query(
      `INSERT INTO public.profiles(id,username,display_name) VALUES
        ($1,'ogretmen','Öğretmen Deniz'),
        ($2,'diger-ogretmen','Öğretmen Ece'),
        ($3,'normal','Normal Kullanıcı'),
        ($4,'ogrenci1','Öğrenci Bir'),
        ($5,'ogrenci2','Öğrenci İki'),
        ($6,'ogrenci3','Öğrenci Üç'),
        ($7,'ogrenci4','Öğrenci Dört'),
        ($8,'gec','Geç Katılan')`,
      [teacher, otherTeacher, nonTeacher, studentOne, studentTwo, studentThree, studentFour, lateStudent],
    )
    await client.query(
      `INSERT INTO public.user_roles(user_id,role_id)
       SELECT candidate.user_id,role.id FROM public.roles AS role
       CROSS JOIN unnest($1::uuid[]) AS candidate(user_id)
       WHERE role.slug='teacher_pilot'`,
      [[teacher, otherTeacher]],
    )
    questionIds = [randomUUID(), randomUUID(), randomUUID()]
    for (const [index, questionId] of questionIds.entries()) {
      await client.query(
        `INSERT INTO public.questions(id,game,category,topic,difficulty,content,is_active)
         VALUES($1,'matematik','Temel','Sayılar',2,$2,true)`,
        [questionId, {
          question: `Soru ${index + 1}`,
          options: ['A', 'B', 'C', 'D'],
          answer: index,
          solution: 'teacher must never receive this',
          hint: 'teacher must never receive this',
        }],
      )
    }
    for (const table of [
      'verified_attempts',
      'game_sessions',
      'session_answers',
      'review_cards',
      'review_logs',
      'user_outcome_state',
      'xp_log',
      'reward_ledger',
      'daily_quests',
      'achievements',
      'weekly_learning_league_contributions',
    ]) {
      await client.query(`INSERT INTO public.${table}(id) VALUES($1)`, [randomUUID()])
    }
  })

  afterAll(async () => {
    await client?.end()
  })

  it('requires an assigned teacher role and canonically replays owner-bound class creation', async () => {
    await expectPgError(
      () => rpc('public.create_teacher_classroom($1,$2,$3)', [nonTeacher, 'Yetkisiz', randomUUID()]),
      '42501',
    )
    const requestId = randomUUID()
    const created = await rpc(
      'public.create_teacher_classroom($1,$2,$3)',
      [teacher, '12-A Matematik', requestId],
    )
    classroomId = created.classroom.id
    expect(created).toMatchObject({ replayed: false, classroom: { name: '12-A Matematik' } })
    expect(await rpc(
      'public.create_teacher_classroom($1,$2,$3)',
      [teacher, '12-A Matematik', requestId],
    )).toMatchObject({ replayed: true, classroom: { id: classroomId } })
    expect(await rpc('public.get_my_teacher_classrooms($1)', [teacher])).toMatchObject({
      classrooms: [{
        id: classroomId,
        name: '12-A Matematik',
        activeStudentCount: 0,
        assignmentCount: 0,
      }],
    })
    expect((await rpc('public.get_my_teacher_classrooms($1)', [otherTeacher])).classrooms).toEqual([])
    await expectPgError(
      () => rpc('public.get_my_teacher_classroom_overview($1,$2)', [otherTeacher, classroomId]),
      'P0002',
    )
    await expectPgError(
      () => rpc(
        "public.issue_teacher_classroom_invite($1,$2,$3,clock_timestamp()+interval '1 day',$4,$5)",
        [otherTeacher, classroomId, digest('idor'), 1, randomUUID()],
      ),
      'P0002',
    )
    await expectPgError(
      () => rpc('public.create_teacher_classroom($1,$2,$3)', [teacher, 'Farklı', requestId]),
      '22023',
    )
  })

  it('stores digest-only invites, separates privacy events and serializes one-use concurrency', async () => {
    inviteDigest = digest('class-one-invite')
    const issueRequest = randomUUID()
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString()
    const issued = await rpc(
      'public.issue_teacher_classroom_invite($1,$2,$3,$4::timestamptz,$5,$6)',
      [teacher, classroomId, inviteDigest, expiresAt, 10, issueRequest],
    )
    expect(issued).toMatchObject({ maxUses: 10, usedCount: 0, replayed: false })
    expect(await rpc(
      'public.issue_teacher_classroom_invite($1,$2,$3,$4::timestamptz,$5,$6)',
      [teacher, classroomId, inviteDigest, expiresAt, 10, issueRequest],
    )).toMatchObject({ inviteRef: issued.inviteRef, replayed: true })
    const stored = await client.query(
      'SELECT token_digest,used_count FROM public.teacher_classroom_invites WHERE invite_ref=$1',
      [issued.inviteRef],
    )
    expect(stored.rows[0]).toEqual({ token_digest: inviteDigest, used_count: 0 })
    expect(JSON.stringify(stored.rows[0])).not.toContain('class-one-invite')

    const preview = await rpc(
      'public.preview_teacher_classroom_invite($1,$2)',
      [studentOne, inviteDigest],
    )
    expect(preview).toMatchObject({ classroomName: '12-A Matematik', teacherAlias: 'Öğretmen Deniz' })
    const acceptRequest = randomUUID()
    expect(await acceptInvite(studentOne, inviteDigest, acceptRequest)).toMatchObject({
      membershipStatus: 'active', replayed: false,
    })
    expect(await acceptInvite(studentOne, inviteDigest, acceptRequest)).toMatchObject({ replayed: true })
    expect(await rpc('public.get_my_teacher_classroom_memberships($1)', [studentOne]))
      .toMatchObject({
        classrooms: [{
          id: classroomId,
          name: '12-A Matematik',
          teacherAlias: 'Öğretmen Deniz',
        }],
      })
    const events = await client.query(
      `SELECT event_type,version FROM public.teacher_classroom_privacy_events
       WHERE student_id=$1 ORDER BY created_at,event_type`,
      [studentOne],
    )
    expect(events.rows).toEqual([
      { event_type: 'notice_acknowledged', version: 'notice-v1' },
      { event_type: 'sharing_consented', version: 'share-v1' },
    ])
    await acceptInvite(studentTwo, inviteDigest)

    const concurrencyClass = (await createClass(teacher, 'Eşzamanlılık')).classroom.id
    const oneUseDigest = digest('one-use')
    await issueInvite(teacher, concurrencyClass, oneUseDigest, 1)
    const clientA = new pg.Client({ connectionString: url })
    const clientB = new pg.Client({ connectionString: url })
    await Promise.all([clientA.connect(), clientB.connect()])
    try {
      const settled = await Promise.allSettled([
        acceptInvite(studentThree, oneUseDigest, randomUUID(), clientA),
        acceptInvite(studentFour, oneUseDigest, randomUUID(), clientB),
      ])
      expect(settled.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1)
      const rejected = settled.find((entry) => entry.status === 'rejected')
      expect(rejected?.reason?.code).toBe('P0003')
      expect((await client.query(
        `SELECT used_count FROM public.teacher_classroom_invites WHERE token_digest=$1`,
        [oneUseDigest],
      )).rows[0].used_count).toBe(1)
    } finally {
      await Promise.all([clientA.end(), clientB.end()])
    }

    const revokedDigest = digest('revoked')
    const revoked = await issueInvite(teacher, classroomId, revokedDigest, 1)
    await rpc(
      'public.revoke_teacher_classroom_invite($1,$2,$3)',
      [teacher, revoked.inviteRef, randomUUID()],
    )
    await expectPgError(
      () => rpc('public.preview_teacher_classroom_invite($1,$2)', [lateStudent, revokedDigest]),
      'P0003',
    )
  })

  it('enforces expiry, seven-day/use bounds and the 1/39/40/41 capacity edge', async () => {
    const capacityStudents = Array.from({ length: 41 }, () => randomUUID())
    await client.query(
      `INSERT INTO public.profiles(id,username,display_name)
       SELECT candidate.id,'kap-' || candidate.ordinality,'Kapasite ' || candidate.ordinality
       FROM unnest($1::uuid[]) WITH ORDINALITY AS candidate(id,ordinality)`,
      [capacityStudents],
    )
    const capacityClass = (await createClass(teacher, 'Kapasite Sınırı')).classroom.id
    await expectPgError(
      () => rpc(
        "public.issue_teacher_classroom_invite($1,$2,$3,clock_timestamp()+interval '8 days',$4,$5)",
        [teacher, capacityClass, digest('too-long'), 1, randomUUID()],
      ),
      '22023',
    )
    await expectPgError(
      () => rpc(
        "public.issue_teacher_classroom_invite($1,$2,$3,clock_timestamp()+interval '1 day',$4,$5)",
        [teacher, capacityClass, digest('too-many-uses'), 41, randomUUID()],
      ),
      '22023',
    )

    const capacityDigest = digest('capacity-forty')
    await issueInvite(teacher, capacityClass, capacityDigest, 40)
    await acceptInvite(capacityStudents[0], capacityDigest)
    expect(Number((await client.query(
      `SELECT count(*) AS n FROM public.teacher_classroom_memberships
       WHERE classroom_id=$1 AND status='active'`,
      [capacityClass],
    )).rows[0].n)).toBe(1)

    await client.query(
      `INSERT INTO public.teacher_classroom_memberships(classroom_id,student_id)
       SELECT $1,candidate.id FROM unnest($2::uuid[]) AS candidate(id)`,
      [capacityClass, capacityStudents.slice(1, 39)],
    )
    expect(Number((await client.query(
      `SELECT count(*) AS n FROM public.teacher_classroom_memberships
       WHERE classroom_id=$1 AND status='active'`,
      [capacityClass],
    )).rows[0].n)).toBe(39)
    await acceptInvite(capacityStudents[39], capacityDigest)
    expect(Number((await client.query(
      `SELECT count(*) AS n FROM public.teacher_classroom_memberships
       WHERE classroom_id=$1 AND status='active'`,
      [capacityClass],
    )).rows[0].n)).toBe(40)
    await expectPgError(
      () => acceptInvite(capacityStudents[40], capacityDigest),
      '23514',
    )
    expect((await rpc('public.get_my_teacher_classrooms($1)', [teacher])).classrooms
      .find((classroom) => classroom.id === capacityClass)).toMatchObject({
      activeStudentCount: 40,
      assignmentCount: 0,
    })

    const expiredDigest = digest('already-expired')
    await client.query(
      `INSERT INTO public.teacher_classroom_invites(
        classroom_id,issuer_id,token_digest,created_at,expires_at,max_uses
      ) VALUES($1,$2,$3,clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day',1)`,
      [capacityClass, teacher, expiredDigest],
    )
    await expectPgError(
      () => rpc('public.preview_teacher_classroom_invite($1,$2)', [capacityStudents[40], expiredDigest]),
      'P0003',
    )
  })

  it('serializes publish and invite acceptance without a deadlock or stale recipient leak', async () => {
    const raceStudent = randomUUID()
    const raceLateStudent = randomUUID()
    await client.query(
      `INSERT INTO public.profiles(id,username,display_name) VALUES
       ($1,'race-one','Yarış Bir'),($2,'race-two','Yarış İki')`,
      [raceStudent, raceLateStudent],
    )
    const raceClass = (await createClass(teacher, 'Yarış Sınıfı')).classroom.id
    const seedDigest = digest('race-seed')
    await issueInvite(teacher, raceClass, seedDigest, 1)
    await acceptInvite(raceStudent, seedDigest)
    const lateDigest = digest('race-late')
    await issueInvite(teacher, raceClass, lateDigest, 1)

    const availableFrom = new Date(Date.now() - 60_000).toISOString()
    const dueAt = new Date(Date.now() + 86_400_000).toISOString()
    const items = questionIds.map((questionId, index) => ({ position: index + 1, questionId }))
    const clientA = new pg.Client({ connectionString: url })
    const clientB = new pg.Client({ connectionString: url })
    await Promise.all([clientA.connect(), clientB.connect()])
    try {
      const [published] = await Promise.all([
        rpc(
          'public.publish_teacher_assignment($1,$2,$3,$4::jsonb,$5::timestamptz,$6::timestamptz,$7)',
          [teacher, raceClass, 'Yarış Ödevi', JSON.stringify(items), availableFrom, dueAt, randomUUID()],
          clientA,
        ),
        acceptInvite(raceLateStudent, lateDigest, randomUUID(), clientB),
      ])
      expect([1, 2]).toContain(published.recipientCount)
      const lateAssignments = (await rpc(
        'public.get_my_teacher_assignments($1)',
        [raceLateStudent],
      )).assignments
      expect(lateAssignments.some((assignment) => assignment.id === published.assignmentId))
        .toBe(published.recipientCount === 2)
    } finally {
      await Promise.all([clientA.end(), clientB.end()])
    }
  })

  it('publishes a server-validated recipient snapshot, grades once and isolates all reward state', async () => {
    const items = questionIds.map((questionId, index) => ({ position: index + 1, questionId }))
    const requestId = randomUUID()
    const availableFrom = new Date(Date.now() - 60_000).toISOString()
    const dueAt = new Date(Date.now() + 86_400_000).toISOString()
    const before = await client.query(`
      SELECT 'verified' AS source,count(*)::int AS n FROM public.verified_attempts
      UNION ALL SELECT 'sessions',count(*)::int FROM public.game_sessions
      UNION ALL SELECT 'answers',count(*)::int FROM public.session_answers
      UNION ALL SELECT 'cards',count(*)::int FROM public.review_cards
      UNION ALL SELECT 'logs',count(*)::int FROM public.review_logs
      UNION ALL SELECT 'mastery',count(*)::int FROM public.user_outcome_state
      UNION ALL SELECT 'xp',count(*)::int FROM public.xp_log
      UNION ALL SELECT 'reward',count(*)::int FROM public.reward_ledger
      UNION ALL SELECT 'quests',count(*)::int FROM public.daily_quests
      UNION ALL SELECT 'achievements',count(*)::int FROM public.achievements
      UNION ALL SELECT 'social',count(*)::int FROM public.weekly_learning_league_contributions
      ORDER BY source
    `)
    const invalidQuestion = randomUUID()
    await client.query(
      `INSERT INTO public.questions(id,game,category,topic,difficulty,content,is_active)
       VALUES($1,'matematik','Temel','Bozuk',2,$2,true)`,
      [invalidQuestion, { question: 'Tek seçenekli bozuk soru', options: ['A'], answer: 0 }],
    )
    await expectPgError(
      () => rpc(
        'public.publish_teacher_assignment($1,$2,$3,$4::jsonb,$5::timestamptz,$6::timestamptz,$7)',
        [
          teacher,
          classroomId,
          'Geçersiz Ödev',
          JSON.stringify([{ position: 1, questionId: invalidQuestion }]),
          availableFrom,
          dueAt,
          randomUUID(),
        ],
      ),
      '22023',
    )
    const published = await rpc(
      'public.publish_teacher_assignment($1,$2,$3,$4::jsonb,$5::timestamptz,$6::timestamptz,$7)',
      [teacher, classroomId, 'Üç Soruluk Ödev', JSON.stringify(items), availableFrom, dueAt, requestId],
    )
    assignmentId = published.assignmentId
    expect(published).toMatchObject({ questionCount: 3, recipientCount: 2, replayed: false })
    expect(await rpc(
      'public.publish_teacher_assignment($1,$2,$3,$4::jsonb,$5::timestamptz,$6::timestamptz,$7)',
      [teacher, classroomId, 'Üç Soruluk Ödev', JSON.stringify(items), availableFrom, dueAt, requestId],
    )).toMatchObject({ assignmentId, replayed: true })

    await acceptInvite(lateStudent, inviteDigest)
    const lateList = await rpc('public.get_my_teacher_assignments($1)', [lateStudent])
    expect(lateList.assignments).toEqual([])
    const active = await rpc(
      'public.get_my_teacher_assignment($1,$2)',
      [studentOne, assignmentId],
    )
    expect(active.result).toBeNull()
    expect(JSON.stringify(active)).not.toMatch(/solution|hint|answer|correctOption|questionId/)
    expect(active.items).toHaveLength(3)

    const goodAnswers = [
      { position: 1, selectedOption: 0 },
      { position: 2, selectedOption: null },
      { position: 3, selectedOption: 1 },
    ]
    for (const bad of [
      [{ position: 1, selectedOption: 0 }],
      [{ position: 1, selectedOption: 9 }, { position: 2, selectedOption: null }, { position: 3, selectedOption: 1 }],
      [{ position: 1, selectedOption: 0, extra: true }, { position: 2, selectedOption: null }, { position: 3, selectedOption: 1 }],
      [{ position: 1, selectedOption: 0 }, { position: 1, selectedOption: null }, { position: 3, selectedOption: 1 }],
    ]) {
      await expectPgError(
        () => rpc(
          'public.submit_teacher_assignment($1,$2,$3::jsonb,$4)',
          [studentOne, assignmentId, JSON.stringify(bad), randomUUID()],
        ),
        '22023',
      )
    }
    await expectPgError(
      () => rpc(
        'public.submit_teacher_assignment($1,$2,$3::jsonb,$4)',
        [lateStudent, assignmentId, JSON.stringify(goodAnswers), randomUUID()],
      ),
      'P0002',
    )
    const submitRequest = randomUUID()
    const submitted = await rpc(
      'public.submit_teacher_assignment($1,$2,$3::jsonb,$4)',
      [studentOne, assignmentId, JSON.stringify(goodAnswers), submitRequest],
    )
    expect(submitted).toMatchObject({ answeredCount: 2, correctCount: 1, replayed: false })
    expect(await rpc(
      'public.submit_teacher_assignment($1,$2,$3::jsonb,$4)',
      [studentOne, assignmentId, JSON.stringify(goodAnswers), submitRequest],
    )).toMatchObject({ replayed: true })
    await expectPgError(
      () => rpc(
        'public.submit_teacher_assignment($1,$2,$3::jsonb,$4)',
        [studentOne, assignmentId, JSON.stringify([
          { position: 1, selectedOption: 1 },
          { position: 2, selectedOption: null },
          { position: 3, selectedOption: 1 },
        ]), submitRequest],
      ),
      '22023',
    )
    const finalView = await rpc(
      'public.get_my_teacher_assignment($1,$2)',
      [studentOne, assignmentId],
    )
    expect(finalView.result).toMatchObject({ answeredCount: 2, correctCount: 1 })
    expect(finalView.result.items.map((item) => item.correctOption)).toEqual([0, 1, 2])

    const overview = await rpc(
      'public.get_my_teacher_classroom_overview($1,$2)',
      [teacher, classroomId],
    )
    const serialized = JSON.stringify(overview)
    expect(overview.assignments[0]).toMatchObject({ submittedCount: 1, assignedCount: 2 })
    expect(overview.assignments[0].students.find((student) => student.alias === 'Öğrenci Bir'))
      .toMatchObject({ answeredCount: 2, correctCount: 1, status: 'submitted' })
    for (const forbidden of [...questionIds, studentOne, studentTwo, 'selectedOption', 'correctOption', 'isCorrect']) {
      expect(serialized).not.toContain(forbidden)
    }
    expect((await client.query(`
      SELECT 'verified' AS source,count(*)::int AS n FROM public.verified_attempts
      UNION ALL SELECT 'sessions',count(*)::int FROM public.game_sessions
      UNION ALL SELECT 'answers',count(*)::int FROM public.session_answers
      UNION ALL SELECT 'cards',count(*)::int FROM public.review_cards
      UNION ALL SELECT 'logs',count(*)::int FROM public.review_logs
      UNION ALL SELECT 'mastery',count(*)::int FROM public.user_outcome_state
      UNION ALL SELECT 'xp',count(*)::int FROM public.xp_log
      UNION ALL SELECT 'reward',count(*)::int FROM public.reward_ledger
      UNION ALL SELECT 'quests',count(*)::int FROM public.daily_quests
      UNION ALL SELECT 'achievements',count(*)::int FROM public.achievements
      UNION ALL SELECT 'social',count(*)::int FROM public.weekly_learning_league_contributions
      ORDER BY source
    `)).rows).toEqual(before.rows)

    await client.query('UPDATE public.profiles SET deleted_at=clock_timestamp() WHERE id=$1', [studentOne])
    await expectPgError(
      () => rpc('public.get_my_teacher_assignment($1,$2)', [studentOne, assignmentId]),
      'P0002',
    )
    await expectPgError(
      () => rpc(
        'public.submit_teacher_assignment($1,$2,$3::jsonb,$4)',
        [studentOne, assignmentId, JSON.stringify(goodAnswers), randomUUID()],
      ),
      'P0002',
    )
  })

  it('cuts visibility on withdrawal/removal and keeps all tables private with service-only RPCs', async () => {
    const withdrawalRequest = randomUUID()
    expect(await rpc(
      'public.withdraw_teacher_classroom_membership($1,$2,$3)',
      [studentOne, classroomId, withdrawalRequest],
    )).toMatchObject({ membershipStatus: 'withdrawn', replayed: false })
    expect(await rpc(
      'public.withdraw_teacher_classroom_membership($1,$2,$3)',
      [studentOne, classroomId, withdrawalRequest],
    )).toMatchObject({ replayed: true })
    await expectPgError(
      () => rpc('public.get_my_teacher_assignments($1)', [studentOne]),
      'P0002',
    )
    const afterWithdrawal = await rpc(
      'public.get_my_teacher_classroom_overview($1,$2)',
      [teacher, classroomId],
    )
    expect(JSON.stringify(afterWithdrawal)).not.toContain('Öğrenci Bir')
    expect(afterWithdrawal.classroom.hiddenRecipientCount).toBeGreaterThanOrEqual(1)

    const studentTwoRef = afterWithdrawal.activeStudents
      .find((student) => student.alias === 'Öğrenci İki')?.memberRef
    expect(studentTwoRef).toMatch(/^[0-9a-f]{32}$/)
    await rpc(
      'public.remove_teacher_classroom_member($1,$2,$3,$4)',
      [teacher, classroomId, studentTwoRef, randomUUID()],
    )
    const afterRemoval = await rpc(
      'public.get_my_teacher_classroom_overview($1,$2)',
      [teacher, classroomId],
    )
    expect(JSON.stringify(afterRemoval)).not.toContain('Öğrenci İki')
    expect((await rpc('public.get_my_teacher_classroom_memberships($1)', [studentTwo])).classrooms)
      .toEqual([])
    await expectPgError(
      () => rpc(
        'public.submit_teacher_assignment($1,$2,$3::jsonb,$4)',
        [studentTwo, assignmentId, JSON.stringify([
          { position: 1, selectedOption: 0 },
          { position: 2, selectedOption: null },
          { position: 3, selectedOption: 1 },
        ]), randomUUID()],
      ),
      'P0002',
    )

    const privateTables = [
      'teacher_classrooms',
      'teacher_classroom_requests',
      'teacher_classroom_invites',
      'teacher_classroom_memberships',
      'teacher_classroom_privacy_events',
      'teacher_assignments',
      'teacher_assignment_items',
      'teacher_assignment_recipients',
      'teacher_assignment_submissions',
      'teacher_assignment_submission_items',
    ]
    const tableAcl = await client.query(
      `SELECT target.table_name,actor.role_name,grant_name.privilege,
        has_table_privilege(
          actor.role_name,
          format('public.%I',target.table_name),
          grant_name.privilege
        ) AS allowed
       FROM unnest($1::text[]) AS target(table_name)
       CROSS JOIN unnest($2::text[]) AS actor(role_name)
       CROSS JOIN unnest($3::text[]) AS grant_name(privilege)`,
      [
        privateTables,
        ['anon', 'authenticated', 'service_role'],
        ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'],
      ],
    )
    expect(tableAcl.rows).toHaveLength(privateTables.length * 3 * 7)
    expect(tableAcl.rows.every((entry) => entry.allowed === false)).toBe(true)

    const publicRpcs = [
      'create_teacher_classroom(uuid,text,uuid)',
      'get_my_teacher_classrooms(uuid)',
      'issue_teacher_classroom_invite(uuid,uuid,text,timestamptz,smallint,uuid)',
      'revoke_teacher_classroom_invite(uuid,text,uuid)',
      'preview_teacher_classroom_invite(uuid,text)',
      'accept_teacher_classroom_invite(uuid,text,text,text,uuid)',
      'get_my_teacher_classroom_memberships(uuid)',
      'withdraw_teacher_classroom_membership(uuid,uuid,uuid)',
      'remove_teacher_classroom_member(uuid,uuid,text,uuid)',
      'publish_teacher_assignment(uuid,uuid,text,jsonb,timestamptz,timestamptz,uuid)',
      'get_my_teacher_classroom_overview(uuid,uuid)',
      'get_my_teacher_assignments(uuid)',
      'get_my_teacher_assignment(uuid,uuid)',
      'submit_teacher_assignment(uuid,uuid,jsonb,uuid)',
    ]
    const functionAcl = await client.query(
      `SELECT target.signature,actor.role_name,
        has_function_privilege(
          actor.role_name,
          'public.' || target.signature,
          'EXECUTE'
        ) AS allowed
       FROM unnest($1::text[]) AS target(signature)
       CROSS JOIN unnest($2::text[]) AS actor(role_name)`,
      [publicRpcs, ['anon', 'authenticated', 'service_role']],
    )
    expect(functionAcl.rows).toHaveLength(publicRpcs.length * 3)
    expect(functionAcl.rows.every((entry) => (
      entry.role_name === 'service_role' ? entry.allowed === true : entry.allowed === false
    ))).toBe(true)

    const helperAcl = await client.query(
      `SELECT target.signature,
        has_function_privilege('service_role','public.' || target.signature,'EXECUTE') AS allowed
       FROM unnest($1::text[]) AS target(signature)`,
      [[
        'teacher_classroom_payload_hash(jsonb)',
        'teacher_classroom_is_teacher(uuid)',
        'teacher_classroom_is_blocked(uuid,uuid)',
        'teacher_classroom_safe_alias(uuid)',
      ]],
    )
    expect(helperAcl.rows.every((entry) => entry.allowed === false)).toBe(true)

    const privileges = await client.query(`
      SELECT
        has_function_privilege(
          'service_role',
          'public.submit_teacher_assignment(uuid,uuid,jsonb,uuid)',
          'EXECUTE'
        ) AS service_exec,
        has_function_privilege(
          'authenticated',
          'public.submit_teacher_assignment(uuid,uuid,jsonb,uuid)',
          'EXECUTE'
        ) AS authenticated_exec,
        has_table_privilege('service_role','public.teacher_assignments','INSERT') AS direct_insert,
        (SELECT relrowsecurity FROM pg_class WHERE oid='public.teacher_assignments'::regclass) AS rls
    `)
    expect(privileges.rows[0]).toEqual({
      service_exec: true,
      authenticated_exec: false,
      direct_insert: false,
      rls: true,
    })
    await expectPgError(
      () => service(
        `INSERT INTO public.teacher_classrooms(teacher_id,name) VALUES($1,'Direct')`,
        [teacher],
      ),
      '42501',
    )

    await client.query('DELETE FROM public.user_roles WHERE user_id=$1', [teacher])
    await expectPgError(
      () => rpc('public.get_my_teacher_classroom_overview($1,$2)', [teacher, classroomId]),
      '42501',
    )
  })
})
