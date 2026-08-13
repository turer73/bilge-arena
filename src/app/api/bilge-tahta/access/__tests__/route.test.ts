import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pilotEnabled: vi.fn(),
  pilotInstitutionId: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/bilge-tahta/server', () => ({
  isBilgeTahtaPilotEnabled: mocks.pilotEnabled,
  getBilgeTahtaPilotInstitutionId: mocks.pilotInstitutionId,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ rpc: mocks.rpc })),
}))

import { GET } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const workspace = {
  institution: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Bilge Arena Demo',
    status: 'pilot',
    studentLimit: 200,
    staffLimit: 6,
    staffCount: 4,
    createdAt: '2026-08-13T10:00:00.000Z',
  },
  membership: {
    memberRef: 'a'.repeat(32),
    role: 'teacher',
    joinedAt: '2026-08-13T10:00:00.000Z',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pilotEnabled.mockReturnValue(true)
  mocks.pilotInstitutionId.mockReturnValue(workspace.institution.id)
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
})

describe('Bilge Tahta cohort access route', () => {
  it('fails closed before auth and database work when the pilot flag is off', async () => {
    mocks.pilotEnabled.mockReturnValue(false)
    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ enabled: false })
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('fails closed when the private institution scope is missing', async () => {
    mocks.pilotInstitutionId.mockReturnValue(null)
    const response = await GET()

    expect(await response.json()).toEqual({ enabled: false })
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('enables only an authenticated active Institution Lite member', async () => {
    mocks.rpc.mockResolvedValue({ data: workspace, error: null })
    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ enabled: true })
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_pilot_institution', {
      p_user_id: USER_ID,
    })
  })

  it('does not reveal whether an unauthenticated or non-member account exists', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect(await (await GET()).json()).toEqual({ enabled: false })

    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: USER_ID } }, error: null })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002' } })
    expect(await (await GET()).json()).toEqual({ enabled: false })
  })

  it('does not enable a member from another institution', async () => {
    mocks.pilotInstitutionId.mockReturnValue('33333333-3333-4333-8333-333333333333')
    mocks.rpc.mockResolvedValueOnce({ data: workspace, error: null })

    expect(await (await GET()).json()).toEqual({ enabled: false })
  })

  it('fails closed on malformed workspace data and operational errors', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...workspace, email: 'leak@example.com' }, error: null })
    expect(await (await GET()).json()).toEqual({ enabled: false })

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'XX000' } })
    const response = await GET()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ enabled: false })
  })
})
