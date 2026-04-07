import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock setup ──────────────────────────────────

const mockGetUser = vi.fn()
const mockCheckPermission = vi.fn()
const mockInviteUserByEmail = vi.fn()
const mockInsert = vi.fn()

function makeChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const self = () => chain
  for (const m of ['select', 'insert', 'update', 'eq', 'in', 'single', 'from', 'range', 'or', 'order']) {
    chain[m] = vi.fn(self)
  }
  return chain
}

const mockFrom = vi.fn(() => {
  const chain = makeChain()
  chain.insert = mockInsert.mockResolvedValue({ data: null, error: null })
  return chain
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail: mockInviteUserByEmail,
      },
    },
  }),
}))

import { POST } from '../route'

// ─── Helpers ────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest
}

const ADMIN_USER = { id: 'admin-123', email: 'admin@test.com' }

// ─── Tests ──────────────────────────────────────────

describe('POST /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 if not authorized', async () => {
    mockCheckPermission.mockResolvedValue(null)

    const res = await POST(makeRequest({ email: 'test@test.com' }))
    expect(res.status).toBe(403)

    const data = await res.json()
    expect(data.error).toBe('Yetkisiz erişim')
  })

  it('returns 400 if email is missing', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)

    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)

    const data = await res.json()
    expect(data.error).toBe('E-posta adresi gerekli')
  })

  it('returns 400 for invalid email format', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)

    const res = await POST(makeRequest({ email: 'not-an-email' }))
    expect(res.status).toBe(400)

    const data = await res.json()
    expect(data.error).toBe('Geçersiz e-posta formatı')
  })

  it('creates user successfully via invite', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'new-user-456' } },
      error: null,
    })

    const res = await POST(makeRequest({
      email: 'yeni@kullanici.com',
      displayName: 'Yeni Kullanıcı',
    }))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.userId).toBe('new-user-456')

    // inviteUserByEmail doğru parametrelerle çağrıldı mı?
    expect(mockInviteUserByEmail).toHaveBeenCalledWith(
      'yeni@kullanici.com',
      { data: { full_name: 'Yeni Kullanıcı' } },
    )

    // logAdminAction çağrıldı mı?
    const { logAdminAction } = await import('@/lib/supabase/admin')
    expect(logAdminAction).toHaveBeenCalled()
  })

  it('assigns role when roleId is provided', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'new-user-789' } },
      error: null,
    })

    const res = await POST(makeRequest({
      email: 'rollu@kullanici.com',
      roleId: 'role-editor-123',
    }))
    expect(res.status).toBe(200)

    // user_roles'a insert edildi mi?
    expect(mockFrom).toHaveBeenCalledWith('user_roles')
  })

  it('returns 409 for duplicate email', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    })

    const res = await POST(makeRequest({ email: 'var@olan.com' }))
    expect(res.status).toBe(409)

    const data = await res.json()
    expect(data.error).toBe('Bu e-posta adresi zaten kayıtlı')
  })
})
