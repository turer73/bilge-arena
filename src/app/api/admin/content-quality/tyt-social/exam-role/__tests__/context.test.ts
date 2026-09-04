import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getAal2Status: vi.fn(),
  checkPermission: vi.fn(),
  rateLimit: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/auth/aal2', () => ({ getAal2Status: mocks.getAal2Status }))
vi.mock('@/lib/supabase/admin', () => ({ checkPermission: mocks.checkPermission }))
vi.mock('@/lib/content-governance/rate-limits', () => ({
  contentGovernanceWriteLimiter: {},
  checkContentGovernanceRateLimit: mocks.rateLimit,
}))

import { requireTytSocialExamRoleContext } from '../context'

const USER = '11111111-1111-4111-8111-111111111111'
const request = new Request('http://localhost/api/admin/content-quality/tyt-social/exam-role/prepare', {
  headers: { 'x-forwarded-for': '203.0.113.10' },
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CONTENT_GOVERNANCE_ENABLED = 'true'
  mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER } }, error: null }) } })
  mocks.rateLimit.mockResolvedValue({ success: true })
  mocks.getAal2Status.mockResolvedValue({ currentLevel: 'aal2', nextLevel: 'aal2', isAal2: true })
  mocks.checkPermission.mockResolvedValue({ id: USER })
})

describe('TYT Social exam-role context security gates', () => {
  it('fails closed when the cookie session is absent', async () => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) } })
    const result = await requireTytSocialExamRoleContext(request, 'content.prepare')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
    expect(mocks.checkPermission).not.toHaveBeenCalled()
  })

  it('requires AAL2 and the exact content permission before returning the cookie client', async () => {
    mocks.getAal2Status.mockResolvedValueOnce({ currentLevel: 'aal1', nextLevel: 'aal2', isAal2: false })
    const aal1 = await requireTytSocialExamRoleContext(request, 'content.prepare')
    expect(aal1.ok).toBe(false)
    if (!aal1.ok) expect(aal1.response.status).toBe(403)
    expect(mocks.checkPermission).not.toHaveBeenCalled()

    mocks.getAal2Status.mockResolvedValueOnce({ currentLevel: 'aal2', nextLevel: 'aal2', isAal2: true })
    mocks.checkPermission.mockResolvedValueOnce(null)
    const denied = await requireTytSocialExamRoleContext(request, 'content.review.stage2')
    expect(denied.ok).toBe(false)
    if (!denied.ok) expect(denied.response.status).toBe(403)
    expect(mocks.checkPermission).toHaveBeenCalledWith(expect.anything(), 'content.review.stage2')
  })

  it('returns only the authenticated cookie client after rate-limit and security gates pass', async () => {
    const client = await mocks.createClient()
    const result = await requireTytSocialExamRoleContext(request, 'content.prepare')
    expect(result).toEqual({ ok: true, userId: USER, client })
    expect(mocks.rateLimit).toHaveBeenCalledWith({}, USER, request.headers)
    expect(mocks.checkPermission).toHaveBeenCalledWith(client, 'content.prepare')
  })
})
