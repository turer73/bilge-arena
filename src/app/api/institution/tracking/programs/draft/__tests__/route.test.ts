import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  trackingEnabled: vi.fn(), programEnabled: vi.fn(), context: vi.fn(), rpc: vi.fn(),
  build: vi.fn(), mergeDiagnostic: vi.fn(), generate: vi.fn(),
}))
vi.mock('@/lib/institution-tracking/server-security', () => ({
  isInstitutionTrackingEnabled: mocks.trackingEnabled,
  isInstitutionStudyProgramEnabled: mocks.programEnabled,
}))
vi.mock('@/lib/institution-pilot/route-context', () => ({ requireInstitutionPilotRouteContext: mocks.context }))
vi.mock('@/lib/institution-tracking/student-analysis', () => ({
  buildInstitutionStudentLearningAnalysis: mocks.build,
  completeLegacyInstitutionAnalysisScope: vi.fn((value) => value),
  withInstitutionDiagnosticSources: mocks.mergeDiagnostic,
}))
vi.mock('@/lib/institution-tracking/study-program', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/institution-tracking/study-program')>()
  return { ...original, generateInstitutionStudyProgramDraft: mocks.generate }
})

import { POST } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CLASSROOM_ID = '22222222-2222-4222-8222-222222222222'
const MEMBER_REF = 'a'.repeat(32)
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const capability = {
  game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
  taxonomyVersion: 'ba-tyt-science-v1', scopePolicyVersion: 'institution-scope-v1',
  diagnosticEnabled: false,
}
const validBody = {
  classroomId: CLASSROOM_ID, memberRef: MEMBER_REF, game: 'fen', examRef: 'TYT',
  weekStart: '2026-08-17', dailyMinuteLimit: 45, requestId: REQUEST_ID,
}
const draft = {
  status: 'draft', weekStart: '2026-08-17', modelVersion: 'institution-program-v1',
  generatedAt: '2026-08-14T00:00:00.000Z', dailyMinuteLimit: 45,
  items: [{ position: 1, scheduledDate: '2026-08-17', taskType: 'verified_questions', title: 'Fizik başlangıç çalışması', reasonCode: 'current_target', outcomeCode: 'FEN-01', durationMinutes: 20, targetQuestionCount: 10 }],
}
const result = {
  programRef: 'b'.repeat(32), status: 'draft', weekStart: '2026-08-17', dailyMinuteLimit: 45,
  modelVersion: 'institution-program-v1', itemCount: 1, createdAt: '2026-08-14T00:00:00.000Z',
  reviewedAt: null, publishedAt: null, replayed: false,
}

function request(body: unknown) {
  return new Request('http://localhost/api/institution/tracking/programs/draft', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.trackingEnabled.mockReturnValue(true)
  mocks.programEnabled.mockReturnValue(true)
  mocks.context.mockResolvedValue({ ok: true, userId: USER_ID, admin: { rpc: mocks.rpc } })
  mocks.build.mockReturnValue({ outcomes: [] })
  mocks.mergeDiagnostic.mockImplementation((analysis) => analysis)
  mocks.generate.mockReturnValue(draft)
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'resolve_released_institution_scope') return { data: capability, error: null }
    if (name === 'get_institution_student_learning_analysis_v2') return { data: { raw: true }, error: null }
    if (name === 'get_institution_student_diagnostic_sources') return { data: { sources: [] }, error: null }
    if (name === 'create_institution_study_program_draft_v2') return { data: result, error: null }
    return { data: null, error: { code: 'P0002' } }
  })
})

describe('institution study program draft route', () => {
  it('fails closed unless both flags are enabled', async () => {
    mocks.programEnabled.mockReturnValue(false)
    expect((await POST(request({}))).status).toBe(503)
    expect(mocks.context).not.toHaveBeenCalled()
  })

  it('derives the draft from server analysis and persists only bounded items', async () => {
    const response = await POST(request(validBody))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'get_institution_student_learning_analysis_v2', {
      p_user_id: USER_ID, p_classroom_id: CLASSROOM_ID, p_member_ref: MEMBER_REF,
      p_game: 'fen', p_display_exam_ref: 'TYT', p_window_end: expect.any(String),
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(4, 'create_institution_study_program_draft_v2', {
      p_user_id: USER_ID, p_classroom_id: CLASSROOM_ID, p_member_ref: MEMBER_REF,
      p_game: 'fen', p_display_exam_ref: 'TYT',
      p_week_start: '2026-08-17', p_daily_minute_limit: 45,
      p_model_version: 'institution-program-v1', p_items: draft.items, p_request_id: REQUEST_ID,
    })
    expect(await response.json()).toEqual({ program: result, draft })
  })

  it('does not persist when trustworthy analysis cannot produce a plan', async () => {
    mocks.generate.mockReturnValue(null)
    expect((await POST(request(validBody))).status).toBe(409)
    expect(mocks.rpc).toHaveBeenCalledTimes(3)
  })

  it.each(['PGRST202', '42883'])('continues app-first when diagnostic RPC is unavailable (%s)', async (code) => {
    const normalRpc = mocks.rpc.getMockImplementation()!
    mocks.rpc.mockImplementation(async (name: string) => name === 'get_institution_student_diagnostic_sources'
      ? { data: null, error: { code } }
      : normalRpc(name))
    const response = await POST(request(validBody))
    expect(response.status).toBe(200)
    expect(mocks.mergeDiagnostic).toHaveBeenCalledWith({ raw: true }, { sources: [] })
  })

  it('fails closed for diagnostic RPC errors other than an absent app-first function', async () => {
    const normalRpc = mocks.rpc.getMockImplementation()!
    mocks.rpc.mockImplementation(async (name: string) => name === 'get_institution_student_diagnostic_sources'
      ? { data: null, error: { code: '42501' } }
      : normalRpc(name))
    const response = await POST(request(validBody))
    expect(response.status).toBe(403)
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('rejects missing or non-canonical subject scope before database work', async () => {
    expect((await POST(request({ ...validBody, examRef: 'tyt' }))).status).toBe(400)
    expect((await POST(request({ ...validBody, game: 'unknown' }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
