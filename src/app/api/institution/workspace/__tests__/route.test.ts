import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/institution-pilot/route-context', () => ({
  requireInstitutionPilotRouteContext: mocks.context,
}))

import { GET } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const workspace = {
  institution: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Bilge Pilot Kursu',
    status: 'pilot',
    studentLimit: 200,
    staffLimit: 6,
    staffCount: 1,
    createdAt: '2026-08-13T10:00:00.000Z',
  },
  membership: {
    memberRef: 'a'.repeat(32),
    role: 'manager',
    joinedAt: '2026-08-13T10:00:00.000Z',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue({
    ok: true,
    userId: USER_ID,
    admin: { rpc: mocks.rpc },
  })
})

describe('institution workspace route', () => {
  it('returns only the strict owner workspace response', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: workspace, error: null })
    const response = await GET(new Request('http://localhost/api/institution/workspace'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(workspace)
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_pilot_institution', {
      p_user_id: USER_ID,
    })
  })

  it('rejects response fields outside the public contract and maps missing scope', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...workspace, email: 'leak@example.com' }, error: null })
    expect((await GET(new Request('http://localhost/api/institution/workspace'))).status).toBe(500)

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002' } })
    expect((await GET(new Request('http://localhost/api/institution/workspace'))).status).toBe(404)
  })
})
