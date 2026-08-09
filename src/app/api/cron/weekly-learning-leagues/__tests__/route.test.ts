import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../route'
import { formationRequestId, getIstanbulWeekStart } from '@/lib/social-league/weekly-formation'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ rpc: mocks.rpc })),
}))

const oldFlag = process.env.SOCIAL_LEAGUE_ENABLED
const oldSecret = process.env.CRON_SECRET

function request(secret = 'cron-test-secret') {
  return new Request('http://local/api/cron/weekly-learning-leagues', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

describe('weekly learning league cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SOCIAL_LEAGUE_ENABLED = 'true'
    process.env.CRON_SECRET = 'cron-test-secret'
  })

  afterAll(() => {
    if (oldFlag === undefined) delete process.env.SOCIAL_LEAGUE_ENABLED
    else process.env.SOCIAL_LEAGUE_ENABLED = oldFlag
    if (oldSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = oldSecret
  })

  it('uses Istanbul Monday boundaries and a stable valid request UUID', () => {
    expect(getIstanbulWeekStart(new Date('2026-08-09T20:59:59.000Z'))).toBe('2026-08-03')
    expect(getIstanbulWeekStart(new Date('2026-08-09T21:00:00.000Z'))).toBe('2026-08-10')
    const first = formationRequestId('2026-08-10')
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(formationRequestId('2026-08-10')).toBe(first)
    expect(formationRequestId('2026-08-17')).not.toBe(first)
  })

  it('fails closed for the flag, missing secret and wrong bearer', async () => {
    delete process.env.SOCIAL_LEAGUE_ENABLED
    expect((await GET(request())).status).toBe(503)
    process.env.SOCIAL_LEAGUE_ENABLED = 'true'
    delete process.env.CRON_SECRET
    expect((await GET(request())).status).toBe(500)
    process.env.CRON_SECRET = 'cron-test-secret'
    expect((await GET(request('wrong'))).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('calls only the formation RPC and validates the aggregate response', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        weekStart: getIstanbulWeekStart(),
        finalizedCohortCount: 2,
        formedCohortCount: 3,
        assignedMemberCount: 72,
        waitingMemberCount: 9,
        replayed: false,
      },
      error: null,
    })
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('form_weekly_learning_leagues', {
      p_week_start: getIstanbulWeekStart(),
      p_request_id: formationRequestId(getIstanbulWeekStart()),
    })
  })
})
