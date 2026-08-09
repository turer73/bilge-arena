import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../route'

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
const oldLeagueFlag = process.env.SOCIAL_LEAGUE_ENABLED
const oldSpotlightsFlag = process.env.SOCIAL_SPOTLIGHTS_ENABLED

const emptyBoard = { me: { eligible: false, rank: null, value: null }, entries: [] }
const waiting = {
  status: 'waiting',
  weekStart: null,
  boards: { improved: emptyBoard, consistent: emptyBoard, comeback: emptyBoard },
  privacy: {
    cohortOnly: true,
    positiveOnly: true,
    verifiedOnly: true,
    fullTableHidden: true,
  },
}

describe('learning spotlights route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SOCIAL_LEAGUE_ENABLED = 'true'
    process.env.SOCIAL_SPOTLIGHTS_ENABLED = 'true'
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  })

  afterAll(() => {
    if (oldLeagueFlag === undefined) delete process.env.SOCIAL_LEAGUE_ENABLED
    else process.env.SOCIAL_LEAGUE_ENABLED = oldLeagueFlag
    if (oldSpotlightsFlag === undefined) delete process.env.SOCIAL_SPOTLIGHTS_ENABLED
    else process.env.SOCIAL_SPOTLIGHTS_ENABLED = oldSpotlightsFlag
  })

  it('fails closed before auth unless both server switches are on', async () => {
    delete process.env.SOCIAL_SPOTLIGHTS_ENABLED
    expect((await GET()).status).toBe(503)
    expect(mocks.getUser).not.toHaveBeenCalled()

    process.env.SOCIAL_SPOTLIGHTS_ENABLED = 'true'
    delete process.env.SOCIAL_LEAGUE_ENABLED
    expect((await GET()).status).toBe(503)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('requires auth and returns only the strict owner-scoped result', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET()).status).toBe(401)

    mocks.rpc.mockResolvedValueOnce({ data: waiting, error: null })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_weekly_learning_spotlights', {
      p_user_id: USER_ID,
    })
    expect(JSON.stringify(await response.json())).not.toContain(USER_ID)
  })

  it('rejects an RPC payload that leaks identifiers', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ...waiting, membershipId: USER_ID },
      error: null,
    })
    expect((await GET()).status).toBe(500)
  })
})
