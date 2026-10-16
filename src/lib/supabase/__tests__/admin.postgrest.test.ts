// @vitest-environment node
//
// checkPermission (`role_id!inner(id)`, FK sütunu üzerinden gömme) ve
// getUserRoles (`roles:role_id(...)`) gerçek PostgREST'te. Çerez istemcisi
// gerçek supabase-js'tir; yalnız oturum ve AAL okuması sabitlenir.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import {
  assertFixtureMirrorsGeneratedSchema,
  describePostgrest,
  startPostgrestContract,
  type PostgrestContract,
  type SessionUser,
} from '@/test/postgrest-contract/harness'

const ids = {
  editor: randomUUID(),
  viewer: randomUUID(),
  outsider: randomUUID(),
  editorRole: randomUUID(),
  viewerRole: randomUUID(),
}

describePostgrest('admin permission helpers on real PostgreSQL + PostgREST', () => {
  let contract: PostgrestContract
  let admin: typeof import('../admin')
  let currentUser: SessionUser | null = null

  beforeAll(async () => {
    contract = await startPostgrestContract()
    const { db } = contract
    await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3)', [ids.editor, ids.viewer, ids.outsider])
    await db.query(
      `INSERT INTO public.roles(id, slug, name, description, is_system) VALUES
        ($1, 'content_editor', 'İçerik editörü', 'Soru yayını', true), ($2, 'viewer', 'İzleyici', NULL, false)`,
      [ids.editorRole, ids.viewerRole],
    )
    await db.query(
      `INSERT INTO public.role_permissions(role_id, permission) VALUES
        ($1, 'content.publish'), ($1, 'admin.full'), ($2, 'admin.dashboard.view')`,
      [ids.editorRole, ids.viewerRole],
    )
    await db.query(
      'INSERT INTO public.user_roles(user_id, role_id) VALUES ($1, $3), ($2, $4), ($1, $4)',
      [ids.editor, ids.viewer, ids.editorRole, ids.viewerRole],
    )
    admin = await import('../admin')
  }, 60_000)

  afterAll(async () => {
    await contract?.close()
  })

  it('mirrors the live role relationships', async () => {
    await assertFixtureMirrorsGeneratedSchema(contract.db, [['role_permissions', 'roles'], ['user_roles', 'roles']])
  })

  it('embeds the role through the role_id column as a single object', async () => {
    const { data, error } = await contract.serviceClient()
      .from('role_permissions')
      .select('permission, role_id!inner(id)')
      .eq('permission', 'content.publish')
      .in('role_id', [ids.editorRole])
    expect(error).toBeNull()
    expect(data).toEqual([{ permission: 'content.publish', role_id: { id: ids.editorRole } }])
  })

  it('grants a permission only through the signed-in user roles', async () => {
    const client = contract.cookieClient(() => currentUser)

    currentUser = { id: ids.editor }
    expect(await admin.checkPermission(client as never, 'content.publish')).toMatchObject({ id: ids.editor })
    // admin.* AAL2 ister; çerez istemcisi AAL2 oturumu bildirir.
    expect(await admin.checkPermission(client as never, 'admin.full')).toMatchObject({ id: ids.editor })

    currentUser = { id: ids.viewer }
    expect(await admin.checkPermission(client as never, 'content.publish')).toBeNull()
    expect(await admin.checkPermission(client as never, 'admin.dashboard.view')).toMatchObject({ id: ids.viewer })

    currentUser = { id: ids.outsider }
    expect(await admin.checkPermission(client as never, 'admin.dashboard.view')).toBeNull()

    currentUser = null
    expect(await admin.checkPermission(client as never, 'content.publish')).toBeNull()
  })

  it('returns the assigned roles from the roles:role_id embed', async () => {
    const client = contract.cookieClient(() => currentUser)
    const roles = await admin.getUserRoles(client as never, ids.editor)
    expect(roles.map((role) => role.slug).sort()).toEqual(['content_editor', 'viewer'])
    expect(roles.find((role) => role.slug === 'content_editor')).toEqual({
      id: ids.editorRole,
      slug: 'content_editor',
      name: 'İçerik editörü',
      description: 'Soru yayını',
      is_system: true,
      created_at: expect.any(String),
    })
    expect(await admin.getUserRoles(client as never, ids.outsider)).toEqual([])
  })
})
