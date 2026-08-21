import { describe, expect, it, vi } from 'vitest'
import {
  userHasAnyPlatformPermission,
  userHasAnyPlatformPermissionViaRest,
  userHasPlatformAdminAccess,
} from '../platform-access'
import { PLATFORM_ADMIN_ENTRY_PERMISSIONS } from '@/lib/admin/platform-permissions'

const ROLE_ID = '11111111-1111-4111-8111-111111111111'

function serviceClient({
  assignments = [{ role_id: ROLE_ID }],
  assignmentError = null,
  matches = [] as Array<{ role_id: string }>,
  permissionError = null,
}: {
  assignments?: Array<{ role_id: string }>
  assignmentError?: unknown
  matches?: Array<{ role_id: string }>
  permissionError?: unknown
} = {}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'user_roles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: assignments, error: assignmentError })),
          })),
        }
      }
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            in: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: matches, error: permissionError })),
            })),
          })),
        })),
      }
    }),
  } as never
}

describe('platform access boundary', () => {
  it('keeps institution classroom management outside the platform admin boundary', () => {
    expect(PLATFORM_ADMIN_ENTRY_PERMISSIONS).not.toContain('teacher.classrooms.manage')
    expect(PLATFORM_ADMIN_ENTRY_PERMISSIONS).not.toContain('institution.pilot.access')
  })

  it('does not treat an arbitrary role assignment as platform admin access', async () => {
    expect(await userHasPlatformAdminAccess(serviceClient(), 'user-1')).toBe(false)
  })

  it('accepts a role only when it carries a platform admin entry permission', async () => {
    const client = serviceClient({ matches: [{ role_id: ROLE_ID }] })
    expect(await userHasPlatformAdminAccess(client, 'user-1')).toBe(true)
  })

  it('fails closed when assignment or permission reads fail', async () => {
    expect(await userHasPlatformAdminAccess(serviceClient({ assignmentError: { code: '42501' } }), 'user-1')).toBe(false)
    expect(await userHasPlatformAdminAccess(serviceClient({ permissionError: { code: '42501' } }), 'user-1')).toBe(false)
  })

  it('supports exact non-admin permission checks without widening the admin boundary', async () => {
    const client = serviceClient({ matches: [{ role_id: ROLE_ID }] })
    expect(await userHasAnyPlatformPermission(client, 'user-1', ['institution.pilot.access'])).toBe(true)
  })

  it('REST guard requires a matching permission row after the role lookup', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role_id: ROLE_ID }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role_id: ROLE_ID }]), { status: 200 }))

    const allowed = await userHasAnyPlatformPermissionViaRest({
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      userId: 'user-1',
      permissions: ['admin.dashboard.view'],
      fetchImpl,
    })

    expect(allowed).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[1][0])).toContain('permission=in.%28admin.dashboard.view%29')
  })

  it('REST guard rejects malformed role ids and never performs the permission lookup', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ role_id: 'not-a-uuid' }]), { status: 200 }))

    expect(await userHasAnyPlatformPermissionViaRest({
      supabaseUrl: 'https://example.supabase.co',
      serviceKey: 'service-key',
      userId: 'user-1',
      permissions: ['admin.dashboard.view'],
      fetchImpl,
    })).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
