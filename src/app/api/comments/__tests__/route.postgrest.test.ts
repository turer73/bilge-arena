// @vitest-environment node
//
// /api/comments sözleşmesini gerçek PostgreSQL + PostgREST üzerinde sınar.
// route.test.ts servis-role istemcisini mock'lar; o yüzden 17 Mayıs'ta (#149)
// gelen `profiles!inner` gömmesinin canlıda PGRST200 verdiğini göremedi.
// Burada route kodu değiştirilmeden çalışır: servis-role istemcisi gerçek
// supabase-js'tir, istekler PostgREST'e gider ve şema gerçek migration'dan gelir.
//
// Opt-in: CI'daki "Comments PostgREST contract" işi PostgreSQL ve PostgREST'i
// ayağa kaldırıp aşağıdaki değişkenleri verir. Eksikse dosya atlanır.
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer, request as httpRequest, type Server } from 'node:http'
import { createRequire } from 'node:module'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const databaseUrl = process.env.COMMENTS_POSTGREST_TEST_DATABASE_URL
const postgrestUrl = process.env.COMMENTS_POSTGREST_TEST_URL
const jwtSecret = process.env.COMMENTS_POSTGREST_TEST_JWT_SECRET
const enabled = Boolean(
  databaseUrl
  && postgrestUrl
  && jwtSecret
  && process.env.COMMENTS_POSTGREST_TEST_DATABASE_DISPOSABLE === '1',
)
if (databaseUrl && !/^bilge_comments_test_[a-z0-9_]+$/i.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error('non-disposable database refused')
}

// pg'nin tip paketi yok; testin kullandığı yüzey kadar tip tanımı yeter.
interface PgClient {
  connect(): Promise<void>
  query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: Row[] }>
  end(): Promise<void>
}
const { Client } = createRequire(import.meta.url)('pg') as {
  Client: new (config: { connectionString?: string }) => PgClient
}

const describePg = enabled ? describe : describe.skip
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const commentsMigration = readFileSync(path.join(repoRoot, 'database/migrations/002_add_comments.sql'), 'utf8')

const session = vi.hoisted(() => ({ user: null as { id: string } | null }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: session.user } }) } }),
}))

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString('base64url')
}

function signServiceRoleJwt(secret: string) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify({
    role: 'service_role',
    iss: 'bilge-arena-comments-contract',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }))
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

// supabase-js REST isteklerini `${url}/rest/v1` altına yollar; yalın PostgREST
// kökten servis eder. Bu vekil yalnız ön eki kaldırır, gövde ve başlıklara dokunmaz.
function startRestPrefixProxy(target: URL) {
  const server = createServer((req, res) => {
    const upstream = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: (req.url ?? '/').replace(/^\/rest\/v1(?=\/|$)/, '') || '/',
      method: req.method,
      headers: { ...req.headers, host: target.host },
    }, (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers)
      response.pipe(res)
    })
    upstream.on('error', () => {
      res.writeHead(502)
      res.end()
    })
    req.pipe(upstream)
  })
  return new Promise<Server>((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const ids = {
  ali: randomUUID(),
  ayse: randomUUID(),
  noProfile: randomUUID(),
  question: randomUUID(),
  otherQuestion: randomUUID(),
  aliOld: randomUUID(),
  ayseNew: randomUUID(),
  aliDeleted: randomUUID(),
  aliOtherQuestion: randomUUID(),
  orphan: randomUUID(),
}

function getRequest(questionId: string) {
  return new Request(`http://localhost/api/comments?questionId=${questionId}`, {
    headers: { 'x-forwarded-for': '10.0.0.1' },
  })
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/comments', {
    method: 'POST',
    headers: { 'x-forwarded-for': '10.0.0.1', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describePg('/api/comments on real PostgreSQL + PostgREST', () => {
  let db: PgClient
  let proxy: Server
  let restOrigin: string
  let serviceKey: string
  let route: typeof import('../route')

  beforeAll(async () => {
    db = new Client({ connectionString: databaseUrl })
    await db.connect()
    await db.query(`
      DROP SCHEMA IF EXISTS auth CASCADE;
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA auth;
      CREATE SCHEMA public;
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
          GRANT anon, authenticated, service_role TO authenticator;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $fn$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
      -- Üretimdeki ilişki: profiles.id -> auth.users (023, RESTRICT). Route'un
      -- okuduğu sütunlar database/schema.sql ile aynı tiptedir.
      CREATE TABLE public.profiles(
        id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
        username varchar(32) UNIQUE NOT NULL,
        display_name varchar(64),
        avatar_url text,
        level_name varchar(20) DEFAULT 'Acemi',
        deleted_at timestamptz
      );
      CREATE TABLE public.questions(id uuid PRIMARY KEY);
    `)
    // comments, comment_likes ve beğeni sayacı tetikleyicisi: üretim migration'ı.
    await db.query(commentsMigration)
    await db.query(`
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
    `)

    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3)', [ids.ali, ids.ayse, ids.noProfile])
    await db.query(
      `INSERT INTO public.profiles(id, username, display_name, avatar_url, level_name) VALUES
        ($1, 'ali', 'Ali Yılmaz', 'https://cdn.example/ali.png', 'Uzman'),
        ($2, 'ayse', NULL, NULL, 'Acemi')`,
      [ids.ali, ids.ayse],
    )
    await db.query('INSERT INTO public.questions(id) VALUES ($1), ($2)', [ids.question, ids.otherQuestion])
    await db.query(
      `INSERT INTO public.comments(id, user_id, question_id, content, is_deleted, created_at) VALUES
        ($1, $6, $8, 'eski yorum', false, now() - interval '2 hours'),
        ($2, $7, $8, 'yeni yorum', false, now() - interval '1 hour'),
        ($3, $6, $8, 'silinmiş', true, now() - interval '30 minutes'),
        ($4, $6, $9, 'başka soru', false, now() - interval '10 minutes'),
        ($5, $10, $8, 'profilsiz yazar', false, now() - interval '5 minutes')`,
      [ids.aliOld, ids.ayseNew, ids.aliDeleted, ids.aliOtherQuestion, ids.orphan,
        ids.ali, ids.ayse, ids.question, ids.otherQuestion, ids.noProfile],
    )
    await db.query('INSERT INTO public.comment_likes(user_id, comment_id) VALUES ($1, $2)', [ids.ali, ids.ayseNew])
    await db.query(`NOTIFY pgrst, 'reload schema'`)

    proxy = await startRestPrefixProxy(new URL(postgrestUrl!))
    restOrigin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`
    serviceKey = signServiceRoleJwt(jwtSecret!)

    // PostgREST şema önbelleği yeni tabloları görene kadar bekle.
    const deadline = Date.now() + 20_000
    for (;;) {
      const probe = await fetch(`${restOrigin}/rest/v1/comments?select=id&limit=1`, {
        headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      })
      if (probe.ok) break
      if (Date.now() > deadline) throw new Error(`PostgREST schema cache not ready: ${probe.status} ${await probe.text()}`)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

    process.env.NEXT_PUBLIC_SUPABASE_URL = restOrigin
    process.env.SUPABASE_SERVICE_KEY = serviceKey
    route = await import('../route')
  }, 60_000)

  afterAll(async () => {
    await new Promise((resolve) => proxy?.close(resolve))
    await db?.end()
  })

  it('reproduces the production PGRST200 for the old profiles!inner embed', async () => {
    const client = createClient(restOrigin, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await client
      .from('comments')
      .select('id, profiles!inner(username, display_name, avatar_url, level_name)')
      .limit(1)
    expect(error?.code).toBe('PGRST200')
  })

  it('mirrors the live comments relationships from the generated schema types', async () => {
    const generated = readFileSync(path.join(repoRoot, 'src/types/database.generated.ts'), 'utf8')
    const commentsBlock = generated.match(/\n {6}comments: \{[\s\S]*?Relationships: \[([\s\S]*?)\n {8}\]/)
    expect(commentsBlock).not.toBeNull()
    const liveRelations = [...commentsBlock![1].matchAll(/referencedRelation: "([^"]+)"/g)].map((m) => m[1]).sort()

    const { rows } = await db.query<{ referenced: string }>(`
      SELECT confrelid::regclass::text AS referenced
      FROM pg_constraint
      WHERE contype = 'f'
        AND conrelid = 'public.comments'::regclass
        AND confrelid::regclass::text NOT LIKE 'auth.%'
      ORDER BY 1`)
    expect(rows.map((r) => r.referenced.replace(/^public\./, '')).sort()).toEqual(liveRelations)
    expect(liveRelations).not.toContain('profiles')
  })

  it('lists visible comments of the question with their author profiles', async () => {
    session.user = null
    const res = await route.GET(getRequest(ids.question) as never)
    expect(res.status).toBe(200)
    const { comments } = await res.json()

    // Silinmiş ve başka soruya ait yorumlar yok; yeni olan önce. Profili olmayan
    // yazarın yorumu boş profille döner (arayüz "Anonim" gösterir).
    expect(comments.map((c: { id: string }) => c.id)).toEqual([ids.orphan, ids.ayseNew, ids.aliOld])
    expect(comments[0].profile).toEqual({ username: null, display_name: null, avatar_url: null, level_name: null })
    expect(comments[1]).toMatchObject({
      content: 'yeni yorum',
      likes_count: 1,
      user_id: ids.ayse,
      is_own: false,
      is_liked: false,
      profile: { username: 'ayse', display_name: null, avatar_url: null, level_name: 'Acemi' },
    })
    expect(comments[2].profile).toEqual({
      username: 'ali',
      display_name: 'Ali Yılmaz',
      avatar_url: 'https://cdn.example/ali.png',
      level_name: 'Uzman',
    })
  })

  it('marks own and liked comments for the signed-in author', async () => {
    session.user = { id: ids.ali }
    const res = await route.GET(getRequest(ids.question) as never)
    const { comments } = await res.json()
    const byId = new Map(comments.map((c: { id: string }) => [c.id, c]))
    expect(byId.get(ids.ayseNew)).toMatchObject({ is_own: false, is_liked: true })
    expect(byId.get(ids.aliOld)).toMatchObject({ is_own: true, is_liked: false })
  })

  it('creates a comment through PostgREST, rejects the duplicate and lists it first', async () => {
    session.user = { id: ids.ayse }
    const created = await route.POST(postRequest({ questionId: ids.question, content: 'PostgREST üzerinden yazıldı' }) as never)
    expect(created.status).toBe(201)
    const { id } = await created.json()

    const duplicate = await route.POST(postRequest({ questionId: ids.question, content: 'PostgREST üzerinden yazıldı' }) as never)
    expect(duplicate.status).toBe(409)

    session.user = null
    const { comments } = await (await route.GET(getRequest(ids.question) as never)).json()
    expect(comments[0]).toMatchObject({ id, content: 'PostgREST üzerinden yazıldı', profile: { username: 'ayse' } })
  })
})
