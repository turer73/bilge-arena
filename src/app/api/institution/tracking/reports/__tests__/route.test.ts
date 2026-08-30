import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(), context: vi.fn(), rpc: vi.fn(), analysis: vi.fn(), snapshot: vi.fn(),
}))
vi.mock('@/lib/institution-tracking/server-security', () => ({ isInstitutionTrackingEnabled: mocks.enabled }))
vi.mock('@/lib/institution-pilot/route-context', () => ({ requireInstitutionPilotRouteContext: mocks.context }))
vi.mock('@/lib/teacher-classroom/rate-limits', () => ({ teacherClassroomWriteLimiter: { kind: 'write' } }))
vi.mock('@/lib/institution-tracking/student-analysis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/institution-tracking/student-analysis')>()
  return { ...actual, buildInstitutionStudentLearningAnalysis: mocks.analysis }
})
vi.mock('@/lib/institution-tracking/student-report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/institution-tracking/student-report')>()
  return { ...actual, buildInstitutionStudentReportSnapshot: mocks.snapshot }
})

import { GET, POST } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CLASSROOM_ID = '22222222-2222-4222-8222-222222222222'
const MEMBER_REF = 'a'.repeat(32)
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const REPORT_REF = 'b'.repeat(32)
const fenScope = {
  game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
  taxonomyVersion: 'ba-tyt-fen-v1', scopePolicyVersion: 'institution-scope-v1',
  diagnosticEnabled: false,
}
const fenIdentity = {
  game: 'fen', examRef: 'TYT', questionExamRef: 'TYT',
  taxonomyVersion: 'ba-tyt-fen-v1', scopePolicyVersion: 'institution-scope-v1',
}
const directory = {
  institution: { name: 'Bilge Pilot Kursu', status: 'pilot' }, membership: { role: 'teacher' },
  classrooms: [{
    id: CLASSROOM_ID, name: 'TYT A Sınıfı', teacherAlias: 'Öğretmen Bir', activeStudentCount: 1,
    students: [{ memberRef: MEMBER_REF, alias: 'Öğrenci Bir', joinedAt: '2026-08-01T09:00:00.000Z' }],
  }],
}
const snapshot = {
  modelVersion: 'institution-student-report-v1', generatedAt: '2026-08-14T10:00:00.000Z',
  periodStart: '2026-08-01T10:00:00.000Z', periodEnd: '2026-08-14T10:00:00.000Z',
  institutionName: 'Bilge Pilot Kursu', classroomName: 'TYT A Sınıfı',
  teacherAlias: 'Öğretmen Bir', studentAlias: 'Öğrenci Bir', scope: fenIdentity,
  summary: { outcomeCount: 0, assessedOutcomeCount: 0, insufficientOutcomeCount: 0, developingOutcomeCount: 0, masteredOutcomeCount: 0 },
  outcomes: [],
}
const analysis = {
  scope: {
    ...fenIdentity, modelVersion: 'institution-evidence-v2', windowStart: snapshot.periodStart,
    windowEnd: snapshot.periodEnd, diagnosticEnabled: false, institutionReportingEnabled: true,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockReturnValue(true)
  mocks.context.mockResolvedValue({ ok: true, userId: USER_ID, admin: { rpc: mocks.rpc } })
  mocks.analysis.mockReturnValue(analysis)
  mocks.snapshot.mockReturnValue(snapshot)
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'get_institution_tracking_directory') return { data: directory, error: null }
    if (name === 'resolve_released_institution_scope') return { data: fenScope, error: null }
    if (name === 'get_institution_student_learning_analysis_v2') return { data: {}, error: null }
    if (name === 'create_institution_student_report_v2') return {
      data: { reportRef: REPORT_REF, scope: fenIdentity, snapshot, createdAt: '2026-08-14T10:01:00.000Z', replayed: false }, error: null,
    }
    if (name === 'get_institution_student_reports_v2') return { data: { scope: fenIdentity, reports: [] }, error: null }
    return { data: null, error: { code: 'P0002' } }
  })
})

describe('institution student reports route', () => {
  it('creates a server snapshot for the exact selected subject through the v2 RPC', async () => {
    const response = await POST(new Request('http://localhost', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ classroomId: CLASSROOM_ID, memberRef: MEMBER_REF, game: 'fen', examRef: 'TYT', requestId: REQUEST_ID }),
    }))
    expect(response.status).toBe(200)
    expect(mocks.snapshot).toHaveBeenCalledWith(expect.objectContaining({ scope: analysis.scope }), {
      institutionName: 'Bilge Pilot Kursu', teacherAlias: 'Öğretmen Bir',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('create_institution_student_report_v2', expect.objectContaining({
      p_game: 'fen', p_display_exam_ref: 'TYT', p_snapshot: snapshot, p_request_id: REQUEST_ID,
    }))
    expect(mocks.rpc).not.toHaveBeenCalledWith('create_institution_student_report', expect.anything())
  })

  it('reads only the validated opaque member and exact curriculum scope', async () => {
    const response = await GET(new Request(
      `http://localhost/api/institution/tracking/reports?classroomId=${CLASSROOM_ID}&memberRef=${MEMBER_REF}&game=fen&exam_ref=TYT`,
    ))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('get_institution_student_reports_v2', {
      p_user_id: USER_ID, p_classroom_id: CLASSROOM_ID, p_member_ref: MEMBER_REF,
      p_game: 'fen', p_display_exam_ref: 'TYT',
    })
  })

  it('fails closed when a report response belongs to another taxonomy scope', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'resolve_released_institution_scope') return { data: fenScope, error: null }
      if (name === 'get_institution_student_reports_v2') return {
        data: {
          scope: fenIdentity,
          reports: [{
            reportRef: REPORT_REF,
            snapshot: { ...snapshot, scope: { ...fenIdentity, taxonomyVersion: 'ba-tyt-fen-v2' } },
            createdAt: '2026-08-14T10:01:00.000Z',
          }],
        }, error: null,
      }
      return { data: null, error: { code: 'P0002' } }
    })
    const response = await GET(new Request(
      `http://localhost/api/institution/tracking/reports?classroomId=${CLASSROOM_ID}&memberRef=${MEMBER_REF}&game=fen&exam_ref=TYT`,
    ))
    expect(response.status).toBe(500)
  })

  it('requires the immutable v2 scope envelope even when report history is empty', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'resolve_released_institution_scope') return { data: fenScope, error: null }
      if (name === 'get_institution_student_reports_v2') return { data: { reports: [] }, error: null }
      return { data: null, error: { code: 'P0002' } }
    })
    const response = await GET(new Request(
      `http://localhost/api/institution/tracking/reports?classroomId=${CLASSROOM_ID}&memberRef=${MEMBER_REF}&game=fen&exam_ref=TYT`,
    ))
    expect(response.status).toBe(500)
  })

  it('keeps the deploy-before-migration fallback narrow to legacy Math/TYT', async () => {
    const mathReleased = {
      game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
      taxonomyVersion: 'ba-tyt-math-v1', mappingMode: 'category_proxy', diagnosticEnabled: true,
    }
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'resolve_released_institution_scope') return { data: null, error: { code: 'PGRST202' } }
      if (name === 'resolve_released_curriculum_scope') return { data: mathReleased, error: null }
      if (name === 'get_institution_student_reports') return { data: { reports: [] }, error: null }
      return { data: null, error: { code: 'P0002' } }
    })
    const response = await GET(new Request(
      `http://localhost/api/institution/tracking/reports?classroomId=${CLASSROOM_ID}&memberRef=${MEMBER_REF}&game=matematik&exam_ref=TYT`,
    ))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('get_institution_student_reports', {
      p_user_id: USER_ID, p_classroom_id: CLASSROOM_ID, p_member_ref: MEMBER_REF,
    })
  })
})
