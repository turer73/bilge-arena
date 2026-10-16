// @vitest-environment node
//
// GET /api/admin/users gerçek PostgREST'te: 053 search_profiles_admin RPC'si
// (auth.uid() ile kendi yetki denetimi, 175 immutable_unaccent ile arama) ve
// ardından user_roles -> roles gömmesi `roles:role_id(slug, name)`.
// route.test.ts istemciyi mock'ladığı için gömmeyi ve RPC'yi göremez.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import {
  assertFixtureMirrorsGeneratedSchema,
  describePostgrest,
  readMigrationFunction,
  startPostgrestContract,
  type PostgrestContract,
} from '@/test/postgrest-contract/harness'

const session = vi.hoisted(() => ({ user: null as { id: string } | null, client: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session.client }))

const ids = {
  admin: randomUUID(),
  editor: randomUUID(),
  student: randomUUID(),
  honeypot: randomUUID(),
  adminRole: randomUUID(),
  editorRole: randomUUID(),
}

function listRequest(query = '') {
  return new Request(`http://localhost/api/admin/users${query}`)
}

describePostgrest('/api/admin/users on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let route: typeof import('../route')

  beforeAll(async () => {
    contract = await startPostgrestContract([
      // 175 sonrası üretim yerleşimi: unaccent extensions şemasında.
      'CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;',
      readMigrationFunction('database/migrations/175_extension_schema_hardening.sql', 'public.immutable_unaccent'),
      readMigrationFunction('database/migrations/053_honeypot_filter_search_rpcs.sql', 'search_profiles_admin'),
    ])
    session.client = contract.cookieClient(() => session.user)
    const { db } = contract
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3), ($4)', [ids.admin, ids.editor, ids.student, ids.honeypot])
    await db.query(
      `INSERT INTO public.profiles(id, username, display_name, total_xp, created_at) VALUES
        ($1, 'yonetici', 'Yönetici', 0, now() - interval '3 days'),
        ($2, 'ozkan', 'Özkan Editör', 1200, now() - interval '2 days'),
        ($3, 'ogrenci', NULL, 40, now() - interval '1 day'),
        ($4, '__honeypot_bot__', 'Bot', 0, now())`,
      [ids.admin, ids.editor, ids.student, ids.honeypot],
    )
    await db.query(
      `INSERT INTO public.roles(id, slug, name) VALUES ($1, 'admin', 'Yönetici'), ($2, 'editor', 'Editör')`,
      [ids.adminRole, ids.editorRole],
    )
    await db.query(
      `INSERT INTO public.role_permissions(role_id, permission) VALUES ($1, 'admin.users.view'), ($2, 'admin.questions.view')`,
      [ids.adminRole, ids.editorRole],
    )
    await db.query(
      'INSERT INTO public.user_roles(user_id, role_id) VALUES ($1, $3), ($2, $4), ($1, $4)',
      [ids.admin, ids.editor, ids.adminRole, ids.editorRole],
    )
    route = await import('../route')
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live user_roles -> roles relationships', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [['user_roles', 'roles'], ['role_permissions', 'roles']])
  })

  it('lists users from the RPC with roles from the roles:role_id embed', async () => {
    session.user = { id: ids.admin }
    const res = await route.GET(listRequest() as never)
    expect(res.status).toBe(200)
    const body = await res.json()

    // Bal küpü hesabı RPC'de elenir; en yeni önce.
    expect(body).toMatchObject({ total: 3, page: 1, limit: 20 })
    expect(body.users.map((u: { id: string }) => u.id)).toEqual([ids.student, ids.editor, ids.admin])
    expect(body.users[0]).toMatchObject({ username: 'ogrenci', total_xp: 40, assigned_roles: [] })
    expect(body.users[0]).not.toHaveProperty('total_count')
    expect(body.users[1].assigned_roles).toEqual([{ role_id: ids.editorRole, role_slug: 'editor', role_name: 'Editör' }])
    expect(body.users[2].assigned_roles).toEqual(expect.arrayContaining([
      { role_id: ids.adminRole, role_slug: 'admin', role_name: 'Yönetici' },
      { role_id: ids.editorRole, role_slug: 'editor', role_name: 'Editör' },
    ]))
    expect(body.users[2].assigned_roles).toHaveLength(2)
  })

  it('searches accent-insensitively through the RPC', async () => {
    session.user = { id: ids.admin }
    const body = await (await route.GET(listRequest('?search=OZKAN') as never)).json()
    expect(body.users.map((u: { username: string }) => u.username)).toEqual(['ozkan'])
  })

  it('refuses a user without admin.users.view', async () => {
    session.user = { id: ids.editor }
    const res = await route.GET(listRequest() as never)
    expect(res.status).toBe(403)
  })
})
