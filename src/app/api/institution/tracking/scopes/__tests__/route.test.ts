import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), context: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/institution-tracking/server-security', () => ({ isInstitutionTrackingEnabled: mocks.enabled }))
vi.mock('@/lib/institution-pilot/route-context', () => ({ requireInstitutionPilotRouteContext: mocks.context }))

import { GET } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const MATH = {
  game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
  taxonomyVersion: 'ba-tyt-math-v1', scopePolicyVersion: 'institution-scope-v1',
  diagnosticEnabled: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockReturnValue(true)
  mocks.context.mockResolvedValue({ ok: true, userId: USER_ID, admin: { rpc: mocks.rpc } })
  mocks.rpc.mockResolvedValue({ data: [MATH], error: null })
})

describe('institution tracking scope route', () => {
  it('returns only strict released institution capabilities', async () => {
    const response = await GET(new Request('http://localhost/api/institution/tracking/scopes'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ scopes: [MATH] })
    expect(mocks.rpc).toHaveBeenCalledWith('list_released_institution_scopes')
  })

  it('fails closed for malformed or duplicated capabilities', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...MATH, studentCount: 2 }], error: null })
    expect((await GET(new Request('http://localhost/api/institution/tracking/scopes'))).status).toBe(500)
    mocks.rpc.mockResolvedValueOnce({ data: [MATH, MATH], error: null })
    expect((await GET(new Request('http://localhost/api/institution/tracking/scopes'))).status).toBe(500)
  })

  it('uses only the legacy Math scope while the new RPC is not deployed', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
      .mockResolvedValueOnce({
        data: {
          game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
          taxonomyVersion: 'ba-tyt-math-v1', mappingMode: 'category_proxy', diagnosticEnabled: true,
        },
        error: null,
      })
    const response = await GET(new Request('http://localhost/api/institution/tracking/scopes'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ scopes: [MATH] })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'resolve_released_curriculum_scope', {
      p_game: 'matematik', p_display_exam_ref: 'TYT',
    })
  })

  it('does not downgrade permission or database errors into fallback availability', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } })
    expect((await GET(new Request('http://localhost/api/institution/tracking/scopes'))).status).toBe(403)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
