import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock setup ──────────────────────────────────

const { mockGetUser, mockMaybeSingle, mockInsert, mockRlCheck, mockContentRpc, mockCreateServiceRoleClient } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockInsert: vi.fn(),
  mockRlCheck: vi.fn(),
  mockContentRpc: vi.fn(),
  mockCreateServiceRoleClient: vi.fn(),
}))

// User-scoped client: auth + error_reports dedup-select + insert (ayni `from`).
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      chain.maybeSingle = vi.fn(async () => mockMaybeSingle())
      chain.insert = vi.fn(async (row: unknown) => mockInsert(row))
      return chain
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mockRlCheck })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mockCreateServiceRoleClient,
}))

vi.mock('@/lib/content-governance/route-context', () => ({
  contentRpc: mockContentRpc,
}))

import { POST } from '../route'

// ─── Helpers ─────────────────────────────────────

const USER = { id: 'user-7' }
const QID = '11111111-1111-4111-8111-111111111111'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/questions/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/questions/report', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    delete process.env.CONTENT_GOVERNANCE_ENABLED
    mockGetUser.mockResolvedValue({ data: { user: USER } })
    mockRlCheck.mockResolvedValue({ success: true })
    mockMaybeSingle.mockReturnValue({ data: null })
    mockInsert.mockReturnValue({ error: null })
    mockCreateServiceRoleClient.mockReturnValue({})
    mockContentRpc.mockResolvedValue({
      data: { appealId: '22222222-2222-4222-8222-222222222222', status: 'submitted', replayed: false },
      error: null,
    })
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ questionId: QID, report_type: 'wrong_answer' }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate-limited', async () => {
    mockRlCheck.mockResolvedValue({ success: false, retryAfter: 30 })
    const res = await POST(makeRequest({ questionId: QID, report_type: 'wrong_answer' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
  })

  it('returns 400 when questionId is not a uuid', async () => {
    const res = await POST(makeRequest({ questionId: 'nope', report_type: 'wrong_answer' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when report_type is outside the enum', async () => {
    const res = await POST(makeRequest({ questionId: QID, report_type: 'spam' }))
    expect(res.status).toBe(400)
  })

  it('is idempotent: already-pending report returns already_reported without insert', async () => {
    mockMaybeSingle.mockReturnValue({ data: { id: 'existing' } })
    const res = await POST(makeRequest({ questionId: QID, report_type: 'typo' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'already_reported' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns 201 and inserts the report with the session user_id', async () => {
    const res = await POST(makeRequest({ questionId: QID, report_type: 'wrong_answer', description: ' kotu ' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ status: 'reported' })
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: USER.id,
      question_id: QID,
      report_type: 'wrong_answer',
      description: 'kotu', // trim + null-empty
    })
  })

  it('routes the legacy endpoint into the owner-bound appeal RPC when server governance is enabled', async () => {
    vi.stubEnv('CONTENT_GOVERNANCE_ENABLED', 'true')
    const requestId = '33333333-3333-4333-8333-333333333333'
    const res = await POST(makeRequest({ questionId: QID, report_type: 'wrong_answer', description: ' Anahtar yanlis. ', requestId }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ status: 'reported' })
    expect(mockContentRpc).toHaveBeenCalledWith(expect.anything(), 'submit_question_appeal', {
      p_user_id: USER.id,
      p_question_id: QID,
      p_session_answer_id: null,
      p_reason: 'wrong_key',
      p_description: 'Anahtar yanlis.',
      p_request_id: requestId,
    })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('treats an already-open governed appeal as an idempotent legacy report', async () => {
    vi.stubEnv('CONTENT_GOVERNANCE_ENABLED', 'true')
    mockContentRpc.mockResolvedValue({ data: null, error: { code: '23505' } })
    const res = await POST(makeRequest({ questionId: QID, report_type: 'unclear' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'already_reported' })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('maps FK violation (23503) to 400', async () => {
    mockInsert.mockReturnValue({ error: { code: '23503', message: 'fk' } })
    const res = await POST(makeRequest({ questionId: QID, report_type: 'other' }))
    expect(res.status).toBe(400)
  })

  it('returns GENERIC 500 (no PG leak) on other insert errors', async () => {
    mockInsert.mockReturnValue({ error: { code: '42501', message: 'permission denied for table' } })
    const res = await POST(makeRequest({ questionId: QID, report_type: 'other' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Rapor gonderilemedi')
    expect(JSON.stringify(json)).not.toContain('permission denied')
  })
})
