import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock setup ──────────────────────────────────

const mockGetUser = vi.fn()
const mockCheckPermission = vi.fn()
const mockInviteUserByEmail = vi.fn()
const mockDeleteUser = vi.fn()
const mockServiceRpc = vi.fn()
const { mockInviteRateLimit } = vi.hoisted(() => ({ mockInviteRateLimit: vi.fn() }))
const mockInsert = vi.fn()
const mockRpc = vi.fn()
const mockUserRolesIn = vi.fn()

function makeChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const self = () => chain
  for (const m of ['select', 'insert', 'update', 'eq', 'in', 'single', 'from', 'range', 'or', 'order']) {
    chain[m] = vi.fn(self)
  }
  return chain
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'user_roles') {
    return {
      select: vi.fn(() => ({
        in: mockUserRolesIn,
      })),
    }
  }
  const chain = makeChain()
  chain.insert = mockInsert.mockResolvedValue({ data: null, error: null })
  return chain
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({ check: mockInviteRateLimit }),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    auth: {
      admin: {
        inviteUserByEmail: mockInviteUserByEmail,
        deleteUser: mockDeleteUser,
      },
    },
    rpc: mockServiceRpc,
  }),
}))

import { POST, GET, PATCH } from '../route'

// ─── Helpers ────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest
}

const ADMIN_USER = { id: '30000000-0000-4000-8000-000000000001', email: 'admin@test.com' }
const REQUEST_ID = '40000000-0000-4000-8000-000000000001'
const ROLE_ID = '50000000-0000-4000-8000-000000000001'

// ─── Tests ──────────────────────────────────────────

describe('PATCH /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retires the legacy profiles.role mutation in favor of governed RBAC', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)
    const request = new Request('http://localhost/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'legacy-user', action: 'promote' }),
    }) as import('next/server').NextRequest

    const res = await PATCH(request)

    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('GET, POST')
    expect(mockFrom).not.toHaveBeenCalledWith('profiles')
  })
})

describe('POST /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInviteRateLimit.mockResolvedValue({ success: true })
    mockServiceRpc.mockResolvedValue({ data: { success: true }, error: null })
    mockDeleteUser.mockResolvedValue({ data: {}, error: null })
  })

  it('returns 403 if not authorized', async () => {
    mockCheckPermission.mockResolvedValue(null)

    const res = await POST(makeRequest({ email: 'test@test.com', requestId: REQUEST_ID }))
    expect(res.status).toBe(403)

    const data = await res.json()
    expect(data.error).toBe('Yetkisiz erişim')
  })

  it('rate-limits invitations before calling the external auth API', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)
    mockInviteRateLimit.mockResolvedValue({ success: false, retryAfter: 30 })

    const res = await POST(makeRequest({ email: 'rate@test.com', requestId: REQUEST_ID }))
    expect(res.status).toBe(429)
    expect(mockInviteUserByEmail).not.toHaveBeenCalled()
    expect(mockServiceRpc).not.toHaveBeenCalled()
  })

  it('returns 400 if email is missing', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)

    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)

    const data = await res.json()
    expect(data.error).toBe('Geçersiz davet bilgisi')
  })

  it('returns 400 for invalid email format', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)

    const res = await POST(makeRequest({ email: 'not-an-email', requestId: REQUEST_ID }))
    expect(res.status).toBe(400)

    const data = await res.json()
    expect(data.error).toBe('Geçersiz davet bilgisi')
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
      requestId: REQUEST_ID,
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
      roleId: ROLE_ID,
      requestId: REQUEST_ID,
    }))
    expect(res.status).toBe(200)
    expect(mockServiceRpc).toHaveBeenCalledWith('admin_assign_role', {
      p_actor_id: ADMIN_USER.id,
      p_user_id: 'new-user-789',
      p_role_id: ROLE_ID,
      p_request_id: REQUEST_ID,
    })
  })

  it('requires role-management permission before sending a role-bearing invite', async () => {
    mockCheckPermission
      .mockResolvedValueOnce(ADMIN_USER)
      .mockResolvedValueOnce(null)

    const res = await POST(makeRequest({
      email: 'yetkisiz@kullanici.com', roleId: ROLE_ID, requestId: REQUEST_ID,
    }))
    expect(res.status).toBe(403)
    expect(mockInviteUserByEmail).not.toHaveBeenCalled()
    expect(mockServiceRpc).not.toHaveBeenCalled()
  })

  it('compensates the just-created invitation when governed role assignment fails', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: 'new-user-rollback' } }, error: null,
    })
    mockServiceRpc.mockResolvedValue({ data: null, error: { code: 'P0002' } })

    const res = await POST(makeRequest({
      email: 'rollback@kullanici.com', roleId: ROLE_ID, requestId: REQUEST_ID,
    }))
    expect(res.status).toBe(404)
    expect(mockDeleteUser).toHaveBeenCalledWith('new-user-rollback')
  })

  it('returns 409 for duplicate email', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    })

    const res = await POST(makeRequest({ email: 'var@olan.com', requestId: REQUEST_ID }))
    expect(res.status).toBe(409)

    const data = await res.json()
    expect(data.error).toBe('Bu e-posta adresi zaten kayıtlı')
  })
})

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeGetRequest(search?: string) {
    const url = search
      ? `http://localhost/api/admin/users?search=${encodeURIComponent(search)}`
      : 'http://localhost/api/admin/users'
    return new Request(url) as import('next/server').NextRequest
  }

  it('returns 403 if not authorized', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(403)
  })

  it('search parametresi search_profiles_admin RPC cagrisina aktarilir (accent-insensitive)', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)
    mockRpc.mockResolvedValue({ data: [], error: null })
    mockUserRolesIn.mockResolvedValue({ data: [] })

    const res = await GET(makeGetRequest('ozkan'))
    expect(res.status).toBe(200)

    expect(mockRpc).toHaveBeenCalledWith('search_profiles_admin', {
      q: 'ozkan',
      result_offset: 0,
      result_limit: 20,
    })
  })

  it('bos arama icin q atlanir (SQL varsayilaniyla filtresiz liste)', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)
    mockRpc.mockResolvedValue({ data: [], error: null })
    mockUserRolesIn.mockResolvedValue({ data: [] })

    await GET(makeGetRequest())
    expect(mockRpc).toHaveBeenCalledWith('search_profiles_admin', {
      result_offset: 0,
      result_limit: 20,
    })
  })

  it('total_count RPC penceresinden okunur, users payload bu alanlari icermez', async () => {
    mockCheckPermission.mockResolvedValue(ADMIN_USER)
    mockRpc.mockResolvedValue({
      data: [
        { id: 'u1', username: 'a', display_name: 'A', total_count: 42 },
        { id: 'u2', username: 'b', display_name: 'B', total_count: 42 },
      ],
      error: null,
    })
    mockUserRolesIn.mockResolvedValue({ data: [] })

    const res = await GET(makeGetRequest())
    const json = await res.json()

    expect(json.total).toBe(42)
    expect(json.users).toHaveLength(2)
    expect(json.users[0].total_count).toBeUndefined()
    expect(json.users[0].id).toBe('u1')
  })
})
