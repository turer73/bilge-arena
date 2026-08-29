import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  context: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/institution-tracking/server-security', () => ({
  isInstitutionTrackingEnabled: mocks.enabled,
}))
vi.mock('@/lib/institution-pilot/route-context', () => ({
  requireInstitutionPilotRouteContext: mocks.context,
}))

import { GET } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CLASSROOM_ID = '22222222-2222-4222-8222-222222222222'
const MEMBER_REF = 'a'.repeat(32)
const rpcData = {
  classroom: { id: CLASSROOM_ID, name: 'TYT A Sınıfı' },
  student: {
    memberRef: MEMBER_REF,
    alias: 'Bilge Öğrenci',
    joinedAt: '2026-08-01T09:00:00.000Z',
  },
  scope: {
    game: 'matematik',
    examRef: 'TYT',
    questionExamRef: 'TYT',
    taxonomyVersion: 'ba-tyt-math-v1',
    diagnosticEnabled: true,
    institutionReportingEnabled: true,
    scopePolicyVersion: 'institution-scope-v1',
    modelVersion: 'institution-evidence-v2',
    windowStart: '2026-08-01T09:00:00.000Z',
    windowEnd: '2026-08-13T12:00:00.000Z',
  },
  coverage: { supported: true, totalQuestions: 120, mappedQuestions: 120, percentage: 100 },
  outcomes: [],
}

function request(query = '') {
  return new Request(`http://localhost/api/institution/tracking/classrooms/${CLASSROOM_ID}/students/${MEMBER_REF}${query}`)
}

function context(classroomId = CLASSROOM_ID, memberRef = MEMBER_REF) {
  return { params: Promise.resolve({ classroomId, memberRef }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockReturnValue(true)
  mocks.context.mockResolvedValue({ ok: true, userId: USER_ID, admin: { rpc: mocks.rpc } })
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'resolve_released_institution_scope') {
      return {
        data: {
          game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
          taxonomyVersion: 'ba-tyt-math-v1', scopePolicyVersion: 'institution-scope-v1',
          diagnosticEnabled: true,
        },
        error: null,
      }
    }
    if (name === 'get_institution_student_learning_analysis_v2') return { data: rpcData, error: null }
    return { data: null, error: { code: 'P0002' } }
  })
})

describe('institution student tracking route', () => {
  it('fails closed before authentication and database access', async () => {
    mocks.enabled.mockReturnValue(false)
    const response = await GET(request(), context())
    expect(response.status).toBe(503)
    expect(mocks.context).not.toHaveBeenCalled()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('requests only the supported scope and returns a strict identifier-minimal response', async () => {
    const response = await GET(request(), context())
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('get_institution_student_learning_analysis_v2', {
      p_user_id: USER_ID,
      p_classroom_id: CLASSROOM_ID,
      p_member_ref: MEMBER_REF,
      p_game: 'matematik',
      p_display_exam_ref: 'TYT',
      p_window_end: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
    const body = await response.json()
    expect(body.summary).toEqual({
      outcomeCount: 0,
      assessedOutcomeCount: 0,
      insufficientOutcomeCount: 0,
      developingOutcomeCount: 0,
      masteredOutcomeCount: 0,
    })
    expect(JSON.stringify(body)).not.toMatch(/userId|studentId|answerId|questionId|selectedOption/i)
  })

  it('rejects unsupported scope, invalid opaque ids and out-of-contract RPC data', async () => {
    expect((await GET(request('?game=fen&exam_ref=TYT'), context())).status).toBe(400)
    expect((await GET(request('?game=fen&exam_ref=tyt'), context())).status).toBe(400)
    expect((await GET(request(), context('not-a-uuid'))).status).toBe(400)
    mocks.rpc.mockImplementationOnce(async () => ({
      data: {
        game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-math-v1', scopePolicyVersion: 'institution-scope-v1',
        diagnosticEnabled: true,
      },
      error: null,
    })).mockImplementationOnce(async () => ({ data: { ...rpcData, studentId: USER_ID }, error: null }))
    expect((await GET(request(), context())).status).toBe(500)
  })

  it('maps tenant denial and missing membership without exposing database details', async () => {
    const capability = {
      data: {
        game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-math-v1', scopePolicyVersion: 'institution-scope-v1',
        diagnosticEnabled: true,
      },
      error: null,
    }
    mocks.rpc
      .mockResolvedValueOnce(capability)
      .mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'secret' } })
    const denied = await GET(request(), context())
    expect(denied.status).toBe(403)
    expect(JSON.stringify(await denied.json())).not.toContain('secret')

    mocks.rpc
      .mockResolvedValueOnce(capability)
      .mockResolvedValueOnce({ data: null, error: { code: 'P0002' } })
    expect((await GET(request(), context())).status).toBe(404)
  })

  it('keeps legacy Math available during deploy-before-migration rollout', async () => {
    mocks.rpc.mockReset()
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
      .mockResolvedValueOnce({
        data: {
          game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
          taxonomyVersion: 'ba-tyt-math-v1', mappingMode: 'category_proxy', diagnosticEnabled: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ...rpcData,
          scope: {
            game: 'matematik', examRef: 'TYT', taxonomyVersion: 'ba-tyt-math-v1',
            modelVersion: 'institution-evidence-v1',
            windowStart: rpcData.scope.windowStart, windowEnd: rpcData.scope.windowEnd,
          },
        },
        error: null,
      })

    expect((await GET(request(), context())).status).toBe(200)
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, 'get_institution_student_learning_analysis', expect.objectContaining({
      p_game: 'matematik', p_exam_ref: 'TYT',
    }))
  })
})
