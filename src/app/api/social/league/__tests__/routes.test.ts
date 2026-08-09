import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../route'
import { POST } from '../preference/route'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ rpc: mocks.rpc })),
}))

const USER_ID = '11111111-2222-4333-8444-555555555555'
const REQUEST_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const oldFlag = process.env.SOCIAL_LEAGUE_ENABLED

function post(body: unknown) {
  return new Request('http://local/api/social/league/preference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('social league routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SOCIAL_LEAGUE_ENABLED = 'true'
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  })

  afterAll(() => {
    if (oldFlag === undefined) delete process.env.SOCIAL_LEAGUE_ENABLED
    else process.env.SOCIAL_LEAGUE_ENABLED = oldFlag
  })

  it('fails closed before auth when the server switch is off', async () => {
    delete process.env.SOCIAL_LEAGUE_ENABLED
    expect((await GET()).status).toBe(503)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('requires auth and returns only the strict owner-scoped league result', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET()).status).toBe(401)

    mocks.rpc.mockResolvedValueOnce({
      data: {
        status: 'waiting',
        optedIn: true,
        effectiveWeekStart: '2026-08-10',
        week: null,
        entries: [],
        privacy: { bottomHidden: true, sessionCap: 15, dailyCap: 30 },
      },
      error: null,
    })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_weekly_learning_league', {
      p_user_id: USER_ID,
    })
    expect(JSON.stringify(await response.json())).not.toContain(USER_ID)
  })

  it('accepts only a strict preference and never accepts a client user id', async () => {
    expect((await POST(post({
      optedIn: true,
      requestId: REQUEST_ID,
      userId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    }))).status).toBe(400)

    mocks.rpc.mockResolvedValueOnce({
      data: { optedIn: true, effectiveWeekStart: '2026-08-10', replayed: false },
      error: null,
    })
    const response = await POST(post({ optedIn: true, requestId: REQUEST_ID }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('set_weekly_learning_league_preference', {
      p_user_id: USER_ID,
      p_opted_in: true,
      p_request_id: REQUEST_ID,
    })
  })

  it('rejects an RPC payload that leaks identifiers', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        status: 'waiting',
        optedIn: true,
        effectiveWeekStart: '2026-08-10',
        week: null,
        entries: [],
        privacy: { bottomHidden: true, sessionCap: 15, dailyCap: 30 },
        userId: USER_ID,
      },
      error: null,
    })
    expect((await GET()).status).toBe(500)
  })
})
