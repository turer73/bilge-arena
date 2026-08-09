import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ client: vi.fn(), permission: vi.fn(), service: vi.fn(), rate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: mocks.service }))
vi.mock('@/lib/supabase/admin', () => ({ checkPermission: mocks.permission }))
vi.mock('../rate-limits', async () => {
  const actual = await vi.importActual<typeof import('../rate-limits')>('../rate-limits')
  return { ...actual, checkContentGovernanceRateLimit: mocks.rate }
})

import { requireContentGovernanceContext } from '../route-context'
import { contentGovernanceReadLimiter } from '../rate-limits'

const USER = '11111111-1111-4111-8111-111111111111'
const permissions = ['content.prepare', 'content.review.stage1', 'content.review.stage2']
beforeEach(() => {
  process.env.CONTENT_GOVERNANCE_ENABLED = 'true'
  mocks.client.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER } } }) } })
  mocks.service.mockReturnValue({})
  mocks.rate.mockResolvedValue({ success: true })
})
afterEach(() => { delete process.env.CONTENT_GOVERNANCE_ENABLED; vi.clearAllMocks() })

describe('content governance route context', () => {
  it.each(['content.review.stage1', 'content.review.stage2'])('allows a queue reader with only %s', async (granted) => {
    mocks.permission.mockImplementation(async (_client: unknown, requested: string) => requested === granted ? { id: USER } : null)
    const result = await requireContentGovernanceContext(new Request('http://localhost/api/admin/content-quality'), contentGovernanceReadLimiter, permissions)
    expect(result.ok).toBe(true)
  })
  it('fails closed for an actor with none of the read scopes', async () => {
    mocks.permission.mockResolvedValue(null)
    const result = await requireContentGovernanceContext(new Request('http://localhost/api/admin/content-quality'), contentGovernanceReadLimiter, permissions)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })
})
