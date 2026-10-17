import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { SUPABASE_DEFAULT_PRIVILEGES_SQL } from './supabase-default-privileges.mjs'

// Derin inceleme 2026-10-15 aksiyon 8: admin okumalari AAL2, search_questions
// beyaz listesi, comments yazma yetkisi. Fikstur canli veritabaninin 2026-10-17
// olculen politika ve grant'lerini tasir; ilk test aciklarin fikstur uzerinde
// gercekten var oldugunu gosterir, boylece migration'daki bir satir silinirse
// sonraki testler duser.
const url = process.env.CONTENT_GOVERNANCE_TEST_DATABASE_URL
if (url && process.env.CONTENT_GOVERNANCE_TEST_DATABASE_DISPOSABLE !== '1') {
  throw new Error('Explicit disposable database flag required')
}
if (url && !/^bilge_r43_test_[a-z0-9_]+$/i.test(new URL(url).pathname.slice(1))) {
  throw new Error('Refusing non-disposable admin read privacy database')
}
const suite = url && process.env.CONTENT_GOVERNANCE_TEST_DATABASE_DISPOSABLE === '1' ? describe : describe.skip
const migration = readFileSync(
  new URL('../migrations/20261017090000_admin_read_aal2_privacy_boundaries.sql', import.meta.url), 'utf8',
)

const WHITELIST = ['context', 'options', 'passage', 'question', 'sentence', 'type']

suite('20261017090000 admin read AAL2 and privacy boundaries on real PostgreSQL', () => {
  let client
  let admin
  let student
  let other
  let deletedUser
  let coachQuestion

  const as = async (role, claims, work) => {
    await client.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)])
    await client.query(`SET ROLE ${role}`)
    try {
      return await work()
    } finally {
      await client.query('RESET ROLE')
      await client.query("SELECT set_config('request.jwt.claims','{}',false)")
    }
  }
  const asUser = (userId, aal, work) => as('authenticated', { sub: userId, role: 'authenticated', aal }, work)
  const asAnon = (work) => as('anon', { role: 'anon' }, work)
  const rows = async (sql, values = []) => (await client.query(sql, values)).rows
  const pgError = async (work) => {
    try {
      await work()
    } catch (error) {
      return error.code
    }
    return null
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query(`
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA auth;
      CREATE SCHEMA public;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      $$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid
      $$;
      GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);

      CREATE FUNCTION public.immutable_unaccent(text) RETURNS text
        LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;

      CREATE TABLE public.profiles(
        id uuid PRIMARY KEY REFERENCES auth.users(id), username varchar NOT NULL,
        display_name varchar, avatar_url text, total_xp integer DEFAULT 0, level smallint DEFAULT 1,
        current_streak smallint DEFAULT 0, correct_answers integer DEFAULT 0,
        total_questions integer DEFAULT 0, created_at timestamptz DEFAULT now(),
        deleted_at timestamptz, role text
      );
      CREATE TABLE public.roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text UNIQUE NOT NULL);
      CREATE TABLE public.role_permissions(
        role_id uuid NOT NULL REFERENCES public.roles(id), permission text NOT NULL,
        PRIMARY KEY(role_id, permission)
      );
      CREATE TABLE public.user_roles(
        user_id uuid NOT NULL REFERENCES auth.users(id), role_id uuid NOT NULL REFERENCES public.roles(id),
        PRIMARY KEY(user_id, role_id)
      );
      -- Canli tanim (2026-10-17): kullanici yalniz kendi iznini sorabilir.
      CREATE FUNCTION public.has_permission(p_user_id uuid, p_permission text)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
        SELECT (auth.uid() IS NULL OR auth.uid() = p_user_id)
          AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            JOIN public.role_permissions rp ON rp.role_id = ur.role_id
            WHERE ur.user_id = p_user_id AND rp.permission = p_permission
          );
      $$;

      CREATE TABLE public.admin_logs(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid NOT NULL, action text NOT NULL,
        details jsonb
      );
      CREATE TABLE public.error_reports(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
        description text
      );
      CREATE TABLE public.site_settings(key text PRIMARY KEY, value jsonb);
      CREATE TABLE public.questions(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), external_id varchar, game varchar NOT NULL,
        category varchar, subcategory varchar, topic varchar, difficulty smallint NOT NULL DEFAULT 2,
        level_tag varchar, content jsonb NOT NULL, is_active boolean DEFAULT true,
        is_boss boolean DEFAULT false, source varchar, exam_ref varchar,
        times_answered integer DEFAULT 0, times_correct integer DEFAULT 0,
        created_at timestamptz DEFAULT now()
      );
      CREATE TABLE public.comments(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
        question_id uuid NOT NULL REFERENCES public.questions(id), content text NOT NULL,
        is_deleted boolean DEFAULT false, likes_count integer DEFAULT 0, created_at timestamptz DEFAULT now()
      );

      ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

      -- Canli politikalar (pg_policies, 2026-10-17).
      CREATE POLICY admin_logs_select_rbac ON public.admin_logs FOR SELECT
        USING (public.has_permission((SELECT auth.uid()), 'admin.logs.view'));
      CREATE POLICY error_reports_select ON public.error_reports FOR SELECT TO authenticated
        USING ((SELECT auth.uid()) = user_id OR public.has_permission((SELECT auth.uid()), 'admin.reports.view'));
      CREATE POLICY site_settings_select_rbac ON public.site_settings FOR SELECT
        USING (public.has_permission((SELECT auth.uid()), 'admin.settings.view'));
      CREATE POLICY user_roles_select ON public.user_roles FOR SELECT
        USING (user_id = (SELECT auth.uid()) OR public.has_permission((SELECT auth.uid()), 'admin.roles.view'));
      CREATE POLICY comments_select ON public.comments FOR SELECT USING (is_deleted = false);
      CREATE POLICY comments_insert ON public.comments FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);
      CREATE POLICY comments_update ON public.comments FOR UPDATE
        USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
      CREATE POLICY comments_delete ON public.comments FOR DELETE USING ((SELECT auth.uid()) = user_id);

      -- Canli grant'ler (information_schema.role_table_grants, 2026-10-17).
      GRANT SELECT ON public.admin_logs, public.error_reports, public.site_settings, public.user_roles
        TO anon, authenticated;
      GRANT SELECT ON public.roles, public.role_permissions TO authenticated;
      GRANT ALL ON public.comments TO anon;
      GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.comments TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
      GRANT EXECUTE ON FUNCTION public.immutable_unaccent(text) TO anon, authenticated, service_role;
    `)

    // 165/174 sonrasi canli search_questions ve 060 sonrasi search_profiles_admin:
    // kara liste projeksiyonu ve AAL2'siz izin kontrolu.
    await client.query(`
      CREATE FUNCTION public.search_questions(
        search_q text DEFAULT NULL, game_filter text DEFAULT NULL, category_filter text DEFAULT NULL,
        difficulty_filter integer DEFAULT NULL, active_filter boolean DEFAULT NULL,
        admin_view boolean DEFAULT false, result_offset integer DEFAULT 0, result_limit integer DEFAULT 20
      ) RETURNS TABLE(
        id uuid, external_id character varying, game character varying,
        category character varying, subcategory character varying, topic character varying,
        difficulty smallint, level_tag character varying, content jsonb,
        is_active boolean, is_boss boolean, source character varying,
        exam_ref character varying, times_answered integer, times_correct integer,
        created_at timestamp with time zone, total_count bigint
      ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $fn$
      BEGIN
        RETURN QUERY SELECT q.id,q.external_id,q.game,q.category,q.subcategory,q.topic,q.difficulty,
          q.level_tag,
          CASE WHEN admin_view = TRUE THEN q.content
            ELSE q.content - 'answer' - 'correct' - 'solution' - 'explanation' - 'hint' END,
          q.is_active,q.is_boss,q.source,q.exam_ref,q.times_answered,q.times_correct,
          q.created_at,COUNT(*) OVER()
        FROM public.questions q WHERE (admin_view = TRUE OR q.is_active = TRUE);
      END $fn$;
      REVOKE ALL ON FUNCTION public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)
        FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)
        TO authenticated, service_role;

      CREATE FUNCTION public.search_profiles_admin(
        q text DEFAULT NULL, result_offset integer DEFAULT 0, result_limit integer DEFAULT 20
      ) RETURNS TABLE(
        id uuid, username character varying, display_name character varying, avatar_url text,
        total_xp integer, level smallint, current_streak smallint, correct_answers integer,
        total_questions integer, created_at timestamp with time zone,
        deleted_at timestamp with time zone, role text, total_count bigint
      ) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
      BEGIN
        IF auth.uid() IS NULL OR NOT EXISTS (
          SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
          WHERE ur.user_id = auth.uid() AND rp.permission = 'admin.users.view'
        ) THEN
          RAISE EXCEPTION 'admin privileges required' USING ERRCODE = '42501';
        END IF;
        RETURN QUERY SELECT p.id,p.username,p.display_name,p.avatar_url,p.total_xp,p.level,
          p.current_streak,p.correct_answers,p.total_questions,p.created_at,p.deleted_at,p.role,
          COUNT(*) OVER() FROM profiles p ORDER BY p.created_at DESC;
      END $fn$;
      REVOKE ALL ON FUNCTION public.search_profiles_admin(text,integer,integer) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.search_profiles_admin(text,integer,integer)
        TO authenticated, service_role;
    `)

    ;[admin, student, other, deletedUser] = Array.from({ length: 4 }, randomUUID)
    await client.query('INSERT INTO auth.users(id) SELECT unnest($1::uuid[])', [[admin, student, other, deletedUser]])
    await client.query(
      `INSERT INTO public.profiles(id, username, deleted_at) VALUES
       ($1,'admin',NULL),($2,'student',NULL),($3,'other',NULL),($4,'deleted-user',now())`,
      [admin, student, other, deletedUser],
    )
    const adminRole = (await rows("INSERT INTO public.roles(slug) VALUES('admin') RETURNING id"))[0].id
    const studentRole = (await rows("INSERT INTO public.roles(slug) VALUES('student') RETURNING id"))[0].id
    await client.query(
      `INSERT INTO public.role_permissions(role_id, permission)
       SELECT $1, unnest(ARRAY['admin.logs.view','admin.reports.view','admin.settings.view',
                               'admin.roles.view','admin.users.view','admin.dashboard.view'])`,
      [adminRole],
    )
    await client.query('INSERT INTO public.user_roles(user_id, role_id) VALUES($1,$2),($3,$4),($5,$4)',
      [admin, adminRole, student, studentRole, other])
    await client.query("INSERT INTO public.admin_logs(admin_id, action, details) VALUES($1,'support.view','{\"email\":\"veli@example.com\"}')", [admin])
    await client.query("INSERT INTO public.error_reports(user_id, description) VALUES($1,'kendi raporum'),($2,'baskasinin raporu')", [student, other])
    await client.query("INSERT INTO public.site_settings(key, value) VALUES('maintenance','{\"enabled\":false}')")
    coachQuestion = (await rows(
      `INSERT INTO public.questions(game, content) VALUES('matematik', $1) RETURNING id`,
      [{
        question: '2 + 2 kaçtır?', options: ['3', '4', '5', '6'], answer: 1, solution: 'Toplama.',
        explanation: 'Dört.', hint: 'Say.', type: 'multiple_choice',
        coach: { hint1: 'Parmakla say.', hint2: 'İki kere iki.', miniExample: '1 + 1 = 2',
          misconceptions: ['3: bir eksik', null, '5: bir fazla', '6: çarpma'] },
        misconceptions: ['a', null, 'c', 'd'],
      }],
    ))[0].id
    await client.query("INSERT INTO public.comments(user_id, question_id, content) VALUES($1,$2,'ilk yorum')", [other, coachQuestion])

    await client.query(SUPABASE_DEFAULT_PRIVILEGES_SQL)
  })

  afterAll(async () => {
    await client?.end()
  })

  it('reproduces the live holes before the migration', async () => {
    // AAL1 admin JWT reads every admin surface.
    await asUser(admin, 'aal1', async () => {
      expect(await rows('SELECT action FROM public.admin_logs')).toHaveLength(1)
      expect(await rows('SELECT description FROM public.error_reports')).toHaveLength(2)
      expect(await rows('SELECT key FROM public.site_settings')).toHaveLength(1)
      expect(await rows('SELECT user_id FROM public.user_roles')).toHaveLength(3)
      expect(await rows('SELECT username FROM public.search_profiles_admin()')).toContainEqual({ username: 'deleted-user' })
    })
    // A plain student reads coach content and writes comments with forged columns.
    await asUser(student, 'aal1', async () => {
      const [row] = await rows('SELECT content FROM public.search_questions()')
      expect(row.content).toHaveProperty('coach')
      expect(row.content).toHaveProperty('misconceptions')
      await client.query(
        "INSERT INTO public.comments(user_id, question_id, content, likes_count, created_at) VALUES($1,$2,'spam',9999,'2099-01-01')",
        [student, coachQuestion],
      )
    })
    expect(await asAnon(() => rows('SELECT content FROM public.comments WHERE content = $1', ['spam'])))
      .toEqual([{ content: 'spam' }])
    await client.query("DELETE FROM public.comments WHERE content = 'spam'")
  })

  it('applies idempotently', async () => {
    await client.query(migration)
    await client.query(migration)
  })

  it('keeps admin reads behind AAL2 and own rows at AAL1', async () => {
    await asUser(admin, 'aal1', async () => {
      expect(await rows('SELECT action FROM public.admin_logs')).toEqual([])
      expect(await rows('SELECT key FROM public.site_settings')).toEqual([])
      expect(await rows('SELECT description FROM public.error_reports')).toEqual([])
      expect(await rows('SELECT user_id FROM public.user_roles')).toEqual([{ user_id: admin }])
    })
    await asUser(admin, 'aal2', async () => {
      expect(await rows('SELECT action FROM public.admin_logs')).toEqual([{ action: 'support.view' }])
      expect(await rows('SELECT key FROM public.site_settings')).toEqual([{ key: 'maintenance' }])
      expect(await rows('SELECT description FROM public.error_reports ORDER BY description'))
        .toEqual([{ description: 'baskasinin raporu' }, { description: 'kendi raporum' }])
      expect(await rows('SELECT user_id FROM public.user_roles')).toHaveLength(3)
    })
    // AAL2 without the permission is still nothing beyond the caller's own rows.
    await asUser(student, 'aal2', async () => {
      expect(await rows('SELECT action FROM public.admin_logs')).toEqual([])
      expect(await rows('SELECT description FROM public.error_reports')).toEqual([{ description: 'kendi raporum' }])
      expect(await rows('SELECT user_id FROM public.user_roles')).toEqual([{ user_id: student }])
    })
    for (const table of ['admin_logs', 'error_reports', 'site_settings', 'user_roles']) {
      expect(await asAnon(() => pgError(() => client.query(`SELECT 1 FROM public.${table}`)))).toBe('42501')
    }
  })

  it('requires AAL2 for the admin profile search, deleted accounts included', async () => {
    expect(await asUser(admin, 'aal1', () => pgError(() => client.query('SELECT * FROM public.search_profiles_admin()'))))
      .toBe('42501')
    expect(await asUser(student, 'aal2', () => pgError(() => client.query('SELECT * FROM public.search_profiles_admin()'))))
      .toBe('42501')
    const found = await asUser(admin, 'aal2', () => rows('SELECT username FROM public.search_profiles_admin()'))
    expect(found).toContainEqual({ username: 'deleted-user' })
    expect(await asAnon(() => pgError(() => client.query('SELECT * FROM public.search_profiles_admin()'))))
      .toBe('42501')
  })

  it('returns only whitelisted question fields outside the AAL2 admin projection', async () => {
    const studentView = await asUser(student, 'aal1', () => rows('SELECT content FROM public.search_questions()'))
    expect(Object.keys(studentView[0].content).sort()).toEqual(['options', 'question', 'type'])
    const serviceView = await as('service_role', { role: 'service_role' },
      () => rows('SELECT content FROM public.search_questions()'))
    expect(Object.keys(serviceView[0].content).every((key) => WHITELIST.includes(key))).toBe(true)
    expect(serviceView[0].content).toEqual({ question: '2 + 2 kaçtır?', options: ['3', '4', '5', '6'], type: 'multiple_choice' })

    // Asking for the admin projection without AAL2 fails closed; with AAL2 it is the raw row.
    expect(await asUser(admin, 'aal1', () => pgError(() => client.query('SELECT * FROM public.search_questions(admin_view => true)'))))
      .toBe('42501')
    const adminView = await asUser(admin, 'aal2', () => rows('SELECT content FROM public.search_questions(admin_view => true)'))
    expect(adminView[0].content).toHaveProperty('coach')
    expect(adminView[0].content.answer).toBe(1)
    expect(await asAnon(() => pgError(() => client.query('SELECT * FROM public.search_questions()')))).toBe('42501')
  })

  it('lets only the service-role comment routes read or write comments', async () => {
    for (const statement of [
      ["INSERT INTO public.comments(user_id, question_id, content) VALUES($1,$2,'dogrudan')", [student, coachQuestion]],
      ['UPDATE public.comments SET likes_count = 9999 WHERE user_id = $1', [student]],
      ['DELETE FROM public.comments WHERE user_id = $1', [student]],
      ['SELECT content FROM public.comments', []],
    ]) {
      expect(await asUser(student, 'aal2', () => pgError(() => client.query(...statement)))).toBe('42501')
    }
    expect(await asAnon(() => pgError(() => client.query('SELECT content FROM public.comments')))).toBe('42501')
    expect(await asAnon(() => pgError(() => client.query('TRUNCATE public.comments')))).toBe('42501')
    expect(await asUser(student, 'aal1', () => pgError(() => client.query('TRUNCATE public.comments')))).toBe('42501')

    // service_role Supabase'de RLS'i atlar; fikstur rolu atlamadigi icin burada
    // yalniz route'larin ihtiyac duydugu tablo yetkileri dogrulanir.
    const privileges = await rows(
      `SELECT grantee, privilege FROM unnest(ARRAY['anon','authenticated','service_role']) AS grantee,
         unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS privilege
       WHERE has_table_privilege(grantee, 'public.comments', privilege)
       ORDER BY grantee, privilege`,
    )
    expect(privileges.filter((row) => row.grantee !== 'service_role')).toEqual([])
    expect(privileges.filter((row) => row.grantee === 'service_role').map((row) => row.privilege))
      .toEqual(expect.arrayContaining(['DELETE', 'INSERT', 'SELECT', 'UPDATE']))
  })
})
