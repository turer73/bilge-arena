import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetUser,
  mockCheckAdmin,
  mockRpc,
  mockFrom,
  mockUpdateEq,
  mockAdminMutationRl,
  mockIssueVerifiedAttempt,
  mockServiceClient,
} = vi.hoisted(() => {
  const mockUpdateEq = vi.fn()
  const mockFrom = vi.fn(() => ({
    update: vi.fn(() => ({ eq: mockUpdateEq })),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }))
  const mockServiceClient = { role: 'service' }

  return {
    mockGetUser: vi.fn(),
    mockCheckAdmin: vi.fn(),
    mockRpc: vi.fn(),
    mockFrom,
    mockUpdateEq,
    mockAdminMutationRl: vi.fn(),
    mockIssueVerifiedAttempt: vi.fn(),
    mockServiceClient,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
    from: mockFrom,
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkAdmin: mockCheckAdmin,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mockServiceClient),
}))

vi.mock('@/lib/verified-attempts', () => ({
  issueVerifiedAttempt: mockIssueVerifiedAttempt,
  toPublicVerifiedQuestions: (snapshots: unknown[]) => snapshots,
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

vi.mock('@/lib/utils/admin-rate-limit', () => ({
  checkAdminMutationRl: mockAdminMutationRl,
}))

import { GET, PATCH } from '../route'

const VALID_QID = '40000000-0000-4000-8000-000000000001'

function makeGet(url = 'http://localhost/api/questions') {
  return new NextRequest(url)
}

function makePatch(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/questions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/questions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIssueVerifiedAttempt.mockImplementation(async (_admin: unknown, input: { game: string; questionIds: string[] }) => ({
      attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresAt: '2099-01-01T00:00:00.000Z',
      questionSnapshots: input.questionIds.map(id => ({
        id,
        game: input.game,
        category: 'cebir',
        subcategory: null,
        topic: null,
        difficulty: 2,
        level_tag: null,
        base_points: 20,
        content: { question: '2+2?', options: ['3', '4'] },
      })),
    }))
  })

  it('returns question list for authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCheckAdmin.mockResolvedValue(null)
    mockRpc.mockResolvedValue({
      data: [{
        id: 'q1',
        game: 'matematik',
        category: 'cebir',
        subcategory: null,
        topic: null,
        difficulty: 2,
        level_tag: null,
        content: { question: '2+2?', options: ['3', '4'], answer: 1, solution: 'Dört.' },
        total_count: 1,
      }],
      error: null,
    })

    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.questions).toHaveLength(1)
    expect(json.questions[0].total_count).toBeUndefined() // total_count sirade disarida
    expect(json.questions[0].content).toEqual({ question: '2+2?', options: ['3', '4'] })
    expect(json.total).toBe(1)
    expect(json.attemptId).toBeNull()
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('issues a classic attempt for an authenticated active single-game list', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCheckAdmin.mockResolvedValue(null)
    mockRpc.mockResolvedValue({
      data: [{
        id: VALID_QID,
        game: 'matematik',
        category: 'cebir',
        subcategory: null,
        topic: null,
        difficulty: 2,
        level_tag: null,
        content: { question: '2+2?', options: ['3', '4'], answer: 1 },
        total_count: 1,
      }],
      error: null,
    })

    const res = await GET(makeGet(
      'http://localhost/api/questions?game=matematik&active=true&limit=3',
    ))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.attemptId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(mockIssueVerifiedAttempt).toHaveBeenCalledWith(mockServiceClient, {
      userId: 'u1',
      game: 'matematik',
      mode: 'classic',
      questionIds: [VALID_QID],
    })
  })

  it('fails closed when active-list attempt issuance fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCheckAdmin.mockResolvedValue(null)
    mockRpc.mockResolvedValue({
      data: [{
        id: VALID_QID,
        game: 'matematik',
        category: 'cebir',
        difficulty: 2,
        content: { question: '2+2?', options: ['3', '4'], answer: 1 },
        total_count: 1,
      }],
      error: null,
    })
    mockIssueVerifiedAttempt.mockRejectedValueOnce(new Error('database detail'))

    const res = await GET(makeGet(
      'http://localhost/api/questions?game=matematik&active=true',
    ))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Sorular baslatilamadi' })
  })

  it('returns 400 for invalid game slug', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCheckAdmin.mockResolvedValue(null)

    const res = await GET(makeGet('http://localhost/api/questions?game=fake-game'))
    expect(res.status).toBe(400)
  })

  it('returns 500 on db error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCheckAdmin.mockResolvedValue(null)
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const res = await GET(makeGet())
    expect(res.status).toBe(500)
  })

  it('search parametresi search_questions RPC cagrisina aktarilir (accent-insensitive)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCheckAdmin.mockResolvedValue(null)
    mockRpc.mockResolvedValue({ data: [], error: null })

    await GET(makeGet('http://localhost/api/questions?search=cozum&game=matematik'))

    expect(mockRpc).toHaveBeenCalledWith(
      'search_questions',
      expect.objectContaining({
        search_q: 'cozum',
        game_filter: 'matematik',
        admin_view: false,
      }),
    )
  })

  it('admin admin_view=1 isteyince admin_view=true gecilir (pasif sorulari da goster)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValue({ data: [], error: null })

    await GET(makeGet('http://localhost/api/questions?admin_view=1'))

    expect(mockRpc).toHaveBeenCalledWith(
      'search_questions',
      expect.objectContaining({ admin_view: true }),
    )
  })

  it('admin admin_view gondermeden oynarsa bilet alir (kesif #1530)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValue({
      data: [{
        id: VALID_QID,
        game: 'matematik',
        category: 'cebir',
        subcategory: null,
        topic: null,
        difficulty: 2,
        level_tag: null,
        content: { question: '2+2?', options: ['3', '4'], answer: 1 },
        total_count: 1,
      }],
      error: null,
    })

    const res = await GET(makeGet(
      'http://localhost/api/questions?game=matematik&active=true&limit=3',
    ))
    const body = await res.json()

    expect(mockRpc).toHaveBeenCalledWith(
      'search_questions',
      expect.objectContaining({ admin_view: false }),
    )
    expect(body.attemptId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    // Oyun yuzeyinde admin de public projeksiyon alir: cevap anahtari sizmaz.
    expect(body.questions[0].content).toEqual({ question: '2+2?', options: ['3', '4'] })
  })

  it('non-admin admin_view=1 gonderse bile public projeksiyon alir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCheckAdmin.mockResolvedValue(null)
    mockRpc.mockResolvedValue({
      data: [{
        id: VALID_QID,
        game: 'matematik',
        category: 'cebir',
        subcategory: null,
        topic: null,
        difficulty: 2,
        level_tag: null,
        content: { question: '2+2?', options: ['3', '4'], answer: 1, solution: 'Dort.' },
        total_count: 1,
      }],
      error: null,
    })

    const res = await GET(makeGet('http://localhost/api/questions?admin_view=1'))
    const body = await res.json()

    expect(mockRpc).toHaveBeenCalledWith(
      'search_questions',
      expect.objectContaining({ admin_view: false }),
    )
    expect(body.questions[0].content).toEqual({ question: '2+2?', options: ['3', '4'] })
  })

  it('admin yanitinda Cache-Control private, no-store (CDN admin datasini cachelemesin)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValue({ data: [], error: null })

    const res = await GET(makeGet('http://localhost/api/questions?active=false'))
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('anon yanitinda Cache-Control public CDN cache aktif (mevcut davranis)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockCheckAdmin.mockResolvedValue(null)
    mockRpc.mockResolvedValue({ data: [], error: null })

    const res = await GET(makeGet('http://localhost/api/questions'))
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=300, stale-while-revalidate=60')
  })
})

describe('PATCH /api/questions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    mockAdminMutationRl.mockResolvedValue(null)
    mockUpdateEq.mockResolvedValue({ error: null })
  })

  it('returns 403 if not admin', async () => {
    mockCheckAdmin.mockResolvedValue(null)
    const res = await PATCH(makePatch({ questionId: VALID_QID, updates: { is_active: false } }))
    expect(res.status).toBe(403)
  })

  it('returns 400 if questionId missing', async () => {
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({ updates: { is_active: false } }))
    expect(res.status).toBe(400)
  })

  it('returns the admin limiter 429 before parsing or mutating', async () => {
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })
    mockAdminMutationRl.mockResolvedValue(new Response(null, { status: 429 }))

    const res = await PATCH(makePatch({ questionId: VALID_QID, updates: { is_active: false } }))

    expect(res.status).toBe(429)
    expect(mockAdminMutationRl).toHaveBeenCalledWith('admin-1')
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockUpdateEq).not.toHaveBeenCalled()
  })

  it('returns 400 if questionId is not a UUID', async () => {
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({ questionId: 'not-a-uuid', updates: { is_active: false } }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if no valid fields to update (all filtered)', async () => {
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({ questionId: VALID_QID, updates: { evil_field: 'x' } }))
    expect(res.status).toBe(400)
  })

  it('closes the legacy direct mutation path and points valid writes to governance', async () => {
    vi.stubEnv('CONTENT_GOVERNANCE_ENABLED', 'true')
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })

    const res = await PATCH(makePatch({ questionId: VALID_QID, updates: { is_active: false } }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json).toEqual({
      error: 'Dogrudan soru guncellemesi kapatildi. Revizyon veya karantina akislarini kullanin.',
      code: 'CONTENT_GOVERNANCE_REQUIRED',
      questionId: VALID_QID,
    })
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockUpdateEq).not.toHaveBeenCalled()
  })

  it('stays fail-closed even when the application governance flag is disabled', async () => {
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({ questionId: VALID_QID, updates: { is_active: false } }))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'Dogrudan soru guncellemesi kapatildi. Revizyon veya karantina akislarini kullanin.',
      code: 'CONTENT_GOVERNANCE_REQUIRED',
      questionId: VALID_QID,
    })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockUpdateEq).not.toHaveBeenCalled()
  })
})
