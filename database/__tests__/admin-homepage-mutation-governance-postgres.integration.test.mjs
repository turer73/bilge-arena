import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const dedicated = Boolean(process.env.HOMEPAGE_GOVERNANCE_TEST_DATABASE_URL)
const url = process.env.HOMEPAGE_GOVERNANCE_TEST_DATABASE_URL
  ?? process.env.CONTENT_GOVERNANCE_TEST_DATABASE_URL
const disposable = dedicated
  ? process.env.HOMEPAGE_GOVERNANCE_TEST_DATABASE_DISPOSABLE
  : process.env.CONTENT_GOVERNANCE_TEST_DATABASE_DISPOSABLE
if (url && disposable !== '1') throw new Error('Explicit disposable database flag required')
const allowed = dedicated ? /^bilge_r169_test_[a-z0-9_]+$/i : /^bilge_r43_test_[a-z0-9_]+$/i
if (url && !allowed.test(new URL(url).pathname.slice(1))) {
  throw new Error('Refusing non-disposable homepage governance database')
}
const suite = url && disposable === '1' ? describe : describe.skip
const migration = readFileSync(
  new URL('../migrations/169_admin_homepage_mutation_governance.sql', import.meta.url),
  'utf8',
)

suite('169 admin homepage mutation governance disposable PostgreSQL acceptance', () => {
  let client
  let actor

  const rpcOn = async (connection, operation, payload, requestId = randomUUID()) => {
    await connection.query(
      "SELECT set_config('request.jwt.claims',$1,false)",
      [JSON.stringify({ role: 'service_role' })],
    )
    await connection.query('SET ROLE service_role')
    try {
      const result = await connection.query(
        'SELECT public.mutate_admin_homepage($1,$2,$3,$4) AS result',
        [actor, requestId, operation, payload],
      )
      return result.rows[0].result
    } finally {
      await connection.query('RESET ROLE')
    }
  }

  const rpc = (operation, payload, requestId) => rpcOn(client, operation, payload, requestId)

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url })
    await client.connect()
    await client.query(`
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      DROP SCHEMA IF EXISTS extensions CASCADE;
      CREATE SCHEMA auth;
      CREATE SCHEMA public;
      CREATE SCHEMA extensions;
      CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      GRANT USAGE ON SCHEMA public,auth,extensions TO anon,authenticated,service_role;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb
      $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
      CREATE TABLE public.role_permissions(
        role_id uuid NOT NULL REFERENCES public.roles(id), permission text NOT NULL
      );
      CREATE TABLE public.user_roles(
        user_id uuid NOT NULL REFERENCES auth.users(id), role_id uuid NOT NULL REFERENCES public.roles(id)
      );
      CREATE FUNCTION public.has_permission(p_user_id uuid,p_permission text)
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
        SELECT EXISTS(
          SELECT 1 FROM public.user_roles assignment
          JOIN public.role_permissions permission ON permission.role_id=assignment.role_id
          WHERE assignment.user_id=p_user_id AND permission.permission=p_permission
        )
      $$;
      CREATE TABLE public.homepage_sections(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), section_key text UNIQUE NOT NULL,
        config jsonb NOT NULL DEFAULT '{}', is_published boolean NOT NULL DEFAULT false,
        updated_by uuid REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.homepage_elements(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), section_key text NOT NULL,
        element_type text NOT NULL, content text, image_url text, alt_text text NOT NULL DEFAULT '',
        placement text NOT NULL DEFAULT 'below', alignment text NOT NULL DEFAULT 'center',
        size text NOT NULL DEFAULT 'md', styles jsonb NOT NULL DEFAULT '{}',
        sort_order integer NOT NULL DEFAULT 0, is_published boolean NOT NULL DEFAULT false,
        created_by uuid REFERENCES auth.users(id), updated_by uuid REFERENCES auth.users(id),
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.admin_logs(
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid NOT NULL REFERENCES auth.users(id),
        action text NOT NULL, target_type text NOT NULL, target_id text, details jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.homepage_elements ENABLE ROW LEVEL SECURITY;
      CREATE POLICY homepage_sections_admin_manage ON public.homepage_sections FOR ALL USING(true);
      CREATE POLICY homepage_elements_admin_manage ON public.homepage_elements FOR ALL USING(true);
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.homepage_sections,public.homepage_elements
        TO anon,authenticated,service_role;
    `)
    actor = randomUUID()
    const role = randomUUID()
    await client.query('INSERT INTO auth.users(id) VALUES($1)', [actor])
    await client.query('INSERT INTO public.roles(id) VALUES($1)', [role])
    await client.query(
      "INSERT INTO public.role_permissions(role_id,permission) VALUES($1,'admin.homepage.edit')",
      [role],
    )
    await client.query('INSERT INTO public.user_roles(user_id,role_id) VALUES($1,$2)', [actor, role])
    await client.query(
      `INSERT INTO public.homepage_sections(section_key)
       SELECT unnest(ARRAY['hero','stats','games','how_it_works','cta','leaderboard','footer'])`,
    )
    await client.query(migration)
  })

  afterAll(async () => { await client?.end() })

  it('denies direct browser/server DML and exposes only the service RPC', async () => {
    expect((await client.query(`SELECT
      has_table_privilege('authenticated','public.homepage_sections','UPDATE') AS auth_write,
      has_table_privilege('service_role','public.homepage_elements','INSERT') AS service_write,
      has_function_privilege('authenticated','public.mutate_admin_homepage(uuid,uuid,text,jsonb)','EXECUTE') AS auth_rpc,
      has_function_privilege('service_role','public.mutate_admin_homepage(uuid,uuid,text,jsonb)','EXECUTE') AS service_rpc
    `)).rows[0]).toEqual({
      auth_write: false,
      service_write: false,
      auth_rpc: false,
      service_rpc: true,
    })
  })

  it('updates, audits and replays one request without a second mutation', async () => {
    const requestId = randomUUID()
    const payload = { sectionKey: 'hero', config: { title: 'Bilge Arena' } }
    expect(await rpc('section_update', payload, requestId)).toMatchObject({ replayed: false })
    expect(await rpc('section_update', payload, requestId)).toMatchObject({ replayed: true })
    await expect(rpc('section_update', {
      sectionKey: 'hero', config: { title: 'Changed' },
    }, requestId)).rejects.toMatchObject({ code: '22023' })
    expect((await client.query(
      "SELECT config FROM public.homepage_sections WHERE section_key='hero'",
    )).rows[0].config).toEqual({ title: 'Bilge Arena' })
    expect(Number((await client.query(
      "SELECT count(*) FROM public.admin_logs WHERE action='update_homepage_section'",
    )).rows[0].count)).toBe(1)
  })

  it('creates elements, rejects partial reorder, then reorders all rows atomically', async () => {
    const elementPayload = (content) => ({
      alignment: 'center', altText: '', content, elementType: 'slogan',
      imageUrl: null, placement: 'below', sectionKey: 'hero', size: 'md', styles: {},
    })
    const first = (await rpc('element_create', elementPayload('Bir'))).element
    const second = (await rpc('element_create', elementPayload('İki'))).element

    await expect(rpc('elements_reorder', {
      sectionKey: 'hero', orderedIds: [first.id],
    })).rejects.toMatchObject({ code: '22023' })
    expect(await rpc('elements_reorder', {
      sectionKey: 'hero', orderedIds: [second.id, first.id],
    })).toMatchObject({ reorderedElements: 2, replayed: false })
    expect((await client.query(
      "SELECT id FROM public.homepage_elements WHERE section_key='hero' ORDER BY sort_order",
    )).rows.map((row) => row.id)).toEqual([second.id, first.id])
  })

  it('serializes concurrent identical request IDs into one audit/result', async () => {
    const first = new pg.Client({ connectionString: url })
    const second = new pg.Client({ connectionString: url })
    await Promise.all([first.connect(), second.connect()])
    const requestId = randomUUID()
    let results
    try {
      results = await Promise.all([first, second].map((connection) => rpcOn(
        connection,
        'publish',
        { action: 'publish', scope: 'all', sectionKeys: [], elementIds: [] },
        requestId,
      )))
    } finally {
      await Promise.all([first.end(), second.end()])
    }
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true])
    expect(Number((await client.query(
      "SELECT count(*) FROM public.admin_logs WHERE details->>'requestId'=$1", [requestId],
    )).rows[0].count)).toBe(1)
    expect((await client.query(
      'SELECT bool_and(is_published) AS published FROM public.homepage_sections',
    )).rows[0].published).toBe(true)
  })

  it('reapplies without reopening direct grants', async () => {
    await client.query(migration)
    expect((await client.query(`SELECT
      has_table_privilege('service_role','public.homepage_sections','UPDATE') AS direct_write,
      has_function_privilege('service_role','public.mutate_admin_homepage(uuid,uuid,text,jsonb)','EXECUTE') AS governed_write
    `)).rows[0]).toEqual({ direct_write: false, governed_write: true })
  })
})
