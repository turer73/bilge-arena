import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/institution-pilot/route-context', () => ({
  requireInstitutionPilotRouteContext: mocks.context,
}))

import { POST } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const CLASSROOM_ID = '33333333-3333-4333-8333-333333333333'
const TEACHER_REF = 'a'.repeat(32)
const result = {
  classroom: {
    id: CLASSROOM_ID,
    name: 'TYT Matematik A',
    status: 'active',
    createdAt: '2026-08-20T12:00:00.000Z',
  },
  teacher: { memberRef: TEACHER_REF, alias: 'Öğretmen Bir' },
  replayed: false,
}

function request(body: unknown) {
  return new Request('http://localhost/api/institution/classrooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue({ ok: true, userId: USER_ID, admin: { rpc: mocks.rpc } })
})

describe('institution classroom route', () => {
  it('creates a classroom through an opaque teacher reference and strict response', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: result, error: null })
    const response = await POST(request({
      teacherMemberRef: TEACHER_REF,
      name: 'TYT Matematik A',
      requestId: REQUEST_ID,
    }))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual(result)
    expect(mocks.rpc).toHaveBeenCalledWith('create_my_institution_classroom', {
      p_user_id: USER_ID,
      p_teacher_member_ref: TEACHER_REF,
      p_name: 'TYT Matematik A',
      p_request_id: REQUEST_ID,
    })
  })

  it('rejects client-controlled tenant fields before the RPC', async () => {
    const response = await POST(request({
      teacherMemberRef: TEACHER_REF,
      name: 'TYT Matematik A',
      requestId: REQUEST_ID,
      institutionId: crypto.randomUUID(),
    }))
    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('fails closed on authorization, duplicates and malformed database output', async () => {
    mocks.context.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: 'Yetkisiz' }, { status: 401 }),
    })
    expect((await POST(request({}))).status).toBe(401)

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } })
    expect((await POST(request({ teacherMemberRef: TEACHER_REF, name: '12-A', requestId: REQUEST_ID }))).status).toBe(403)

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '23505' } })
    const duplicate = await POST(request({ teacherMemberRef: TEACHER_REF, name: '12-A', requestId: REQUEST_ID }))
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toEqual({ error: 'Bu adla aktif bir sınıf zaten var' })

    mocks.rpc.mockResolvedValueOnce({ data: { ...result, institutionId: crypto.randomUUID() }, error: null })
    expect((await POST(request({ teacherMemberRef: TEACHER_REF, name: '12-A', requestId: REQUEST_ID }))).status).toBe(500)
  })
})
