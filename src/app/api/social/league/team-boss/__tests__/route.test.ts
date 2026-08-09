import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../route'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  rateLimitCheck: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ rpc: mocks.rpc })),
}))
vi.mock('@/lib/social-league/rate-limits', () => ({
  socialLeagueReadLimiter: { check: mocks.rateLimitCheck },
}))

const USER_ID = '11111111-2222-4333-8444-555555555555'
const oldLeagueFlag = process.env.SOCIAL_LEAGUE_ENABLED
const oldBossFlag = process.env.SOCIAL_TEAM_BOSS_ENABLED
const waiting = {
  status: 'waiting',
  weekStart: null,
  boss: null,
  team: null,
  privacy: {
    cohortOnly: true,
    individualsHidden: true,
    verifiedOnly: true,
    rewardFree: true,
  },
}

describe('team boss route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SOCIAL_LEAGUE_ENABLED = 'true'
    process.env.SOCIAL_TEAM_BOSS_ENABLED = 'true'
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mocks.rateLimitCheck.mockResolvedValue({ success: true })
  })

  afterAll(() => {
    if (oldLeagueFlag === undefined) delete process.env.SOCIAL_LEAGUE_ENABLED
    else process.env.SOCIAL_LEAGUE_ENABLED = oldLeagueFlag
    if (oldBossFlag === undefined) delete process.env.SOCIAL_TEAM_BOSS_ENABLED
    else process.env.SOCIAL_TEAM_BOSS_ENABLED = oldBossFlag
  })

  it('fails closed before auth unless both server switches are on', async () => {
    delete process.env.SOCIAL_TEAM_BOSS_ENABLED
    expect((await GET()).status).toBe(503)
    expect(mocks.getUser).not.toHaveBeenCalled()

    process.env.SOCIAL_TEAM_BOSS_ENABLED = 'true'
    delete process.env.SOCIAL_LEAGUE_ENABLED
    expect((await GET()).status).toBe(503)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('requires auth and enforces the shared owner read limiter', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET()).status).toBe(401)

    mocks.rateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 17 })
    const limited = await GET()
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('17')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns only the strict owner-scoped aggregate without caching', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: waiting, error: null })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_weekly_team_boss', {
      p_user_id: USER_ID,
    })
    expect(JSON.stringify(await response.json())).not.toContain(USER_ID)
  })

  it('rejects leaked fields and maps database authorization errors', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ...waiting, cohortId: USER_ID },
      error: null,
    })
    expect((await GET()).status).toBe(500)

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } })
    expect((await GET()).status).toBe(403)
  })
})
