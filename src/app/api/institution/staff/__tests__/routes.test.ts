import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  manager: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/institution-pilot/route-context', () => ({
  requireInstitutionPilotRouteContext: mocks.context,
}))
vi.mock('@/lib/institution-pilot/manager-workspace', () => ({
  getInstitutionManagerWorkspace: mocks.manager,
}))

import { POST as addTeacher } from '../route'
import { DELETE as removeTeacher } from '../[memberRef]/route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222'
const TEACHER_ID = '33333333-3333-4333-8333-333333333333'
const REQUEST_ID = '44444444-4444-4444-8444-444444444444'
const MEMBER_REF = 'a'.repeat(32)
const NOW = '2026-08-13T10:00:00.000Z'

function request(path: string, method: 'POST' | 'DELETE', body: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue({
    ok: true,
    userId: USER_ID,
    admin: { rpc: mocks.rpc },
  })
  mocks.manager.mockResolvedValue({
    ok: true,
    workspace: {
      institution: {
        id: INSTITUTION_ID,
        name: 'Bilge Pilot Kursu',
        status: 'pilot',
        studentLimit: 200,
        staffLimit: 6,
        staffCount: 1,
        createdAt: NOW,
      },
      membership: { memberRef: 'b'.repeat(32), role: 'manager', joinedAt: NOW },
    },
  })
})

describe('institution staff routes', () => {
  it('adds a teacher only to the authenticated manager workspace', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        institutionId: INSTITUTION_ID,
        memberRef: MEMBER_REF,
        role: 'teacher',
        joinedAt: NOW,
        replayed: false,
      },
      error: null,
    })
    const response = await addTeacher(request('/api/institution/staff', 'POST', {
      teacherUserId: TEACHER_ID,
      requestId: REQUEST_ID,
    }))
    expect(response.status).toBe(200)
    expect(mocks.context).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ user: expect.anything(), ip: expect.anything() }),
    )
    expect(mocks.rpc).toHaveBeenCalledWith('add_pilot_institution_teacher', {
      p_user_id: USER_ID,
      p_institution_id: INSTITUTION_ID,
      p_teacher_user_id: TEACHER_ID,
      p_request_id: REQUEST_ID,
    })
  })

  it('rejects client-selected tenant fields and non-manager callers', async () => {
    expect((await addTeacher(request('/api/institution/staff', 'POST', {
      teacherUserId: TEACHER_ID,
      requestId: REQUEST_ID,
      institutionId: INSTITUTION_ID,
    }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.manager.mockResolvedValueOnce({ ok: false, status: 403 })
    expect((await addTeacher(request('/api/institution/staff', 'POST', {
      teacherUserId: TEACHER_ID,
      requestId: REQUEST_ID,
    }))).status).toBe(403)
  })

  it('removes only an opaque teacher member ref from the manager workspace', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        institutionId: INSTITUTION_ID,
        memberRef: MEMBER_REF,
        status: 'removed',
        endedAt: NOW,
        replayed: false,
      },
      error: null,
    })
    const response = await removeTeacher(
      request(`/api/institution/staff/${MEMBER_REF}`, 'DELETE', { requestId: REQUEST_ID }),
      { params: Promise.resolve({ memberRef: MEMBER_REF }) },
    )
    expect(response.status).toBe(200)
    expect(mocks.context).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ user: expect.anything(), ip: expect.anything() }),
    )
    expect(mocks.rpc).toHaveBeenCalledWith('remove_pilot_institution_teacher', {
      p_user_id: USER_ID,
      p_institution_id: INSTITUTION_ID,
      p_member_ref: MEMBER_REF,
      p_request_id: REQUEST_ID,
    })

    mocks.rpc.mockClear()
    expect((await removeTeacher(
      request('/api/institution/staff/not-valid', 'DELETE', { requestId: REQUEST_ID }),
      { params: Promise.resolve({ memberRef: 'not-valid' }) },
    )).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
