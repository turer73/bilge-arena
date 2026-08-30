import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ tracking: vi.fn(), program: vi.fn(), cookie: vi.fn(), service: vi.fn(), rpc: vi.fn(), rate: vi.fn() }))
vi.mock('@/lib/institution-tracking/server-security', () => ({
  isInstitutionTrackingEnabled: mocks.tracking,
  isInstitutionStudyProgramEnabled: mocks.program,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.cookie }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: mocks.service }))
vi.mock('@/lib/teacher-classroom/rate-limits', () => ({
  teacherClassroomWriteLimiter: {}, checkTeacherClassroomRateLimit: mocks.rate,
}))

import { POST } from '../route'

const USER = '11111111-1111-4111-8111-111111111111'
const PROGRAM_REF = 'a'.repeat(32)
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const context = { params: Promise.resolve({ programRef: PROGRAM_REF, position: '2' }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tracking.mockReturnValue(true)
  mocks.program.mockReturnValue(true)
  mocks.cookie.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER } } }) } })
  mocks.service.mockReturnValue({ rpc: mocks.rpc })
  mocks.rate.mockResolvedValue({ success: true })
  mocks.rpc.mockResolvedValue({
    data: { status: 'started', replayed: false, startTarget: { kind: 'diagnostic', requiredMode: 'diagnostic', href: '/arena/tani?game=matematik&exam_ref=TYT' } },
    error: null,
  })
})

describe('institution program item start route', () => {
  it('passes only the authenticated actor and a replay key to the server writer', async () => {
    const response = await POST(new Request('http://localhost/api/study/institution-programs/x/2/start', {
      method: 'POST', body: JSON.stringify({ requestId: REQUEST_ID }),
    }), context)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'started', startTarget: { requiredMode: 'diagnostic' } })
    expect(mocks.rpc).toHaveBeenCalledWith('start_my_institution_study_program_item', {
      p_user_id: USER, p_program_ref: PROGRAM_REF, p_position: 2, p_request_id: REQUEST_ID,
    })
  })

  it('rejects malformed task input before creating a service client', async () => {
    const response = await POST(new Request('http://localhost/api/study/institution-programs/x/2/start', {
      method: 'POST', body: JSON.stringify({ requestId: 'not-a-uuid' }),
    }), context)
    expect(response.status).toBe(400)
    expect(mocks.service).not.toHaveBeenCalled()
  })

  it('rate limits authenticated mutation attempts before the service writer', async () => {
    mocks.rate.mockResolvedValueOnce({ success: false, retryAfter: 12 })
    const response = await POST(new Request('http://localhost/api/study/institution-programs/x/2/start', {
      method: 'POST', body: JSON.stringify({ requestId: REQUEST_ID }),
    }), context)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('12')
    expect(mocks.service).not.toHaveBeenCalled()
  })

  it('does not expose a server-returned target outside the arena contract', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { status: 'started', replayed: false, startTarget: { kind: 'practice', requiredMode: 'practice', href: 'https://attacker.example' } }, error: null })
    const response = await POST(new Request('http://localhost/api/study/institution-programs/x/2/start', {
      method: 'POST', body: JSON.stringify({ requestId: REQUEST_ID }),
    }), context)
    expect(response.status).toBe(500)
  })
})
