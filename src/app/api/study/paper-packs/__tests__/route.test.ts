import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../route'

const mocks = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.is = vi.fn(() => query)
  query.maybeSingle = vi.fn()
  return {
    getUser: vi.fn(),
    from: vi.fn(() => query),
    query,
    rpc: vi.fn(),
    rateLimitCheck: vi.fn(),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: mocks.from, rpc: mocks.rpc })),
}))
vi.mock('@/lib/paper-mode/rate-limits', () => ({
  paperPackIssueLimiter: { check: mocks.rateLimitCheck },
}))

const USER_ID = '11111111-2222-4333-8444-555555555555'
const PLAN_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const REQUEST_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
const PACK_ID = 'cccccccc-dddd-4eee-8fff-000000000000'
const oldFlag = process.env.PAPER_MODE_ENABLED

function request(body: unknown) {
  return new Request('http://local/api/study/paper-packs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('paper pack issue route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PAPER_MODE_ENABLED = 'true'
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mocks.rateLimitCheck.mockResolvedValue({ success: true })
    mocks.query.maybeSingle.mockResolvedValue({ data: { id: PLAN_ID }, error: null })
  })

  afterAll(() => {
    if (oldFlag === undefined) delete process.env.PAPER_MODE_ENABLED
    else process.env.PAPER_MODE_ENABLED = oldFlag
  })

  it('fails closed before auth and requires an authenticated owner', async () => {
    delete process.env.PAPER_MODE_ENABLED
    expect((await POST(request({}))).status).toBe(503)
    expect(mocks.getUser).not.toHaveBeenCalled()

    process.env.PAPER_MODE_ENABLED = 'true'
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await POST(request({}))).status).toBe(401)
  })

  it('enforces the owner limiter and strict body', async () => {
    mocks.rateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 23 })
    const limited = await POST(request({}))
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('23')

    expect((await POST(request({
      game: 'matematik', examRef: 'TYT', requestId: REQUEST_ID, userId: USER_ID,
    }))).status).toBe(400)
  })

  it('derives the owner plan and returns a strict private no-store receipt', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        packId: PACK_ID,
        status: 'active',
        createdAt: '2026-08-09T10:00:00.000+00:00',
        expiresAt: '2026-08-16T10:00:00.000+00:00',
        itemCount: 15,
        replayed: false,
      },
      error: null,
    })
    const response = await POST(request({
      game: 'matematik', examRef: 'TYT', requestId: REQUEST_ID,
    }))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.from).toHaveBeenCalledWith('daily_plan')
    expect(mocks.rpc).toHaveBeenCalledWith('issue_paper_study_pack', {
      p_user_id: USER_ID,
      p_plan_id: PLAN_ID,
      p_request_id: REQUEST_ID,
    })
  })

  it('does not issue without today\'s exact plan and rejects leaked DB fields', async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect((await POST(request({
      game: 'matematik', examRef: 'TYT', requestId: REQUEST_ID,
    }))).status).toBe(404)

    mocks.rpc.mockResolvedValueOnce({
      data: {
        packId: PACK_ID,
        status: 'active',
        createdAt: '2026-08-09T10:00:00.000+00:00',
        expiresAt: '2026-08-16T10:00:00.000+00:00',
        itemCount: 15,
        replayed: false,
        userId: USER_ID,
      },
      error: null,
    })
    expect((await POST(request({
      game: 'matematik', examRef: 'TYT', requestId: REQUEST_ID,
    }))).status).toBe(500)
  })
})
