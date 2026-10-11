import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: m.auth } }) }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => ({ rpc: m.rpc }) }))
vi.mock('@/lib/utils/rate-limit', () => ({ createRateLimiter: () => ({ check: m.limit }) }))
import { GET, POST } from '../route'
import { measurementFeedbackGuard } from '@/lib/measurement/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const body = { action: 'start', formId: id(2), requestId: id(3), noticeAccepted: true }
const req = (value: unknown = body, origin?: string) => new NextRequest('http://localhost/api/study/measurement', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(value),
})
describe('measurement API isolation', () => {
  beforeEach(() => {
    vi.stubEnv('MEASUREMENT_SCHEMA_READY', 'true'); vi.stubEnv('MEASUREMENT_ENABLED', 'true')
    m.auth.mockReset().mockResolvedValue({ data: { user: { id: id(1) } } })
    m.limit.mockReset().mockResolvedValue({ success: true })
    m.rpc.mockReset().mockResolvedValue({ data: { forms: [], session: null }, error: null })
  })
  afterEach(() => vi.unstubAllEnvs())
  it('requires login and no-store on failure', async () => {
    m.auth.mockResolvedValue({ data: { user: null } }); const r = await POST(req())
    expect(r.status).toBe(401); expect(r.headers.get('cache-control')).toContain('no-store'); expect(m.rpc).not.toHaveBeenCalled()
  })
  it('is default-off without schema deployment and invokes no RPC', async () => {
    vi.stubEnv('MEASUREMENT_SCHEMA_READY', 'false')
    expect((await POST(req())).status).toBe(503)
    expect(await (await GET(new NextRequest('http://localhost/api/study/measurement'))).json()).toEqual({ forms: [], session: null })
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('stops new starts but keeps server protection while draining', async () => {
    vi.stubEnv('MEASUREMENT_ENABLED', 'false'); expect((await POST(req())).status).toBe(503)
    m.rpc.mockResolvedValue({ data: true, error: null })
    expect((await measurementFeedbackGuard(createServiceRoleClient(), id(1), id(9)))?.status).toBe(409)
  })
  it('fails closed on guard network/malformed data errors', async () => {
    m.rpc.mockRejectedValueOnce(new Error('secret network details'))
    expect((await measurementFeedbackGuard(createServiceRoleClient(), id(1), id(9)))?.status).toBe(503)
    m.rpc.mockResolvedValue({ data: null, error: null })
    expect((await measurementFeedbackGuard(createServiceRoleClient(), id(1), id(9)))?.status).toBe(503)
  })
  it('rejects foreign origins and actor injection', async () => {
    expect((await POST(req(body, 'https://evil.test'))).status).toBe(403)
    expect((await POST(req({ ...body, userId: id(10) }))).status).toBe(400)
    expect(m.rpc).not.toHaveBeenCalled()
  })
  it('binds request to authenticated actor and rejects private response fields', async () => {
    m.rpc.mockResolvedValue({ data: { privateKey: 'secret' }, error: null })
    const r = await POST(req()); expect(r.status).toBe(503)
    expect(m.rpc).toHaveBeenCalledWith('start_measurement', { p_user_id: id(1), p_form_id: id(2), p_request_id: id(3) })
    expect(await r.text()).not.toContain('secret')
  })
  it('maps unauthorized session to uniform not found', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: '42501' } })
    expect((await POST(req({ action: 'abandon', sessionId: id(30) }))).status).toBe(404)
  })
  it('rate limit failure runs no data operation', async () => {
    m.limit.mockResolvedValue({ success: false, reason: 'backend_unavailable' })
    expect((await POST(req())).status).toBe(503); expect(m.rpc).not.toHaveBeenCalled()
  })
})
