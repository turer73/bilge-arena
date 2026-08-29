import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ rpc: mocks.rpc }),
}))

import { GET } from '../route'

const oldSecret = process.env.CRON_SECRET
const oldRetention = process.env.INSTITUTION_REQUEST_LEDGER_RETENTION_DAYS
const now = new Date('2026-08-24T12:00:00.000Z')

function request(secret = 'retention-secret') {
  return new Request('http://local/api/cron/institution-request-ledger-retention', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

describe('institution request ledger retention cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    process.env.CRON_SECRET = 'retention-secret'
    delete process.env.INSTITUTION_REQUEST_LEDGER_RETENTION_DAYS
  })

  afterAll(() => {
    vi.useRealTimers()
    if (oldSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = oldSecret
    if (oldRetention === undefined) delete process.env.INSTITUTION_REQUEST_LEDGER_RETENTION_DAYS
    else process.env.INSTITUTION_REQUEST_LEDGER_RETENTION_DAYS = oldRetention
  })

  it('fails closed for missing or incorrect cron authentication', async () => {
    delete process.env.CRON_SECRET
    expect((await GET(request())).status).toBe(500)
    process.env.CRON_SECRET = 'retention-secret'
    expect((await GET(request('wrong'))).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects a retention duration outside the SQL safety bounds', async () => {
    process.env.INSTITUTION_REQUEST_LEDGER_RETENTION_DAYS = '7'
    expect((await GET(request())).status).toBe(500)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('keeps one day of headroom below the SQL two-year boundary', async () => {
    process.env.INSTITUTION_REQUEST_LEDGER_RETENTION_DAYS = '730'
    expect((await GET(request())).status).toBe(500)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('prunes only the idempotency ledgers with a 90-day default cutoff', async () => {
    const cutoff = '2026-05-26T12:00:00.000Z'
    mocks.rpc.mockResolvedValue({
      data: {
        cutoff,
        pilotInstitutionRequestsDeleted: 4,
        teacherClassroomRequestsDeleted: 9,
      },
      error: null,
    })
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('prune_institution_request_ledgers', {
      p_cutoff: cutoff,
    })
    expect(await response.json()).toMatchObject({
      pilotInstitutionRequestsDeleted: 4,
      teacherClassroomRequestsDeleted: 9,
    })
  })
})
