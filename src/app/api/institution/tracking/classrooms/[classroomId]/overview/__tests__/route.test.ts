import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), context: vi.fn(), rpc: vi.fn(), buildStudent: vi.fn(), buildOverview: vi.fn() }))
vi.mock('@/lib/institution-tracking/server-security', () => ({ isInstitutionTrackingEnabled: mocks.enabled }))
vi.mock('@/lib/institution-pilot/route-context', () => ({ requireInstitutionPilotRouteContext: mocks.context }))
vi.mock('@/lib/institution-tracking/student-analysis', () => ({
  buildInstitutionStudentLearningAnalysis: mocks.buildStudent,
  completeLegacyInstitutionAnalysisScope: vi.fn((value) => value),
}))
vi.mock('@/lib/institution-tracking/classroom-overview', () => ({ buildInstitutionClassroomOverview: mocks.buildOverview }))

import { GET } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CLASSROOM_ID = '22222222-2222-4222-8222-222222222222'
const refs = ['a'.repeat(32), 'b'.repeat(32), 'c'.repeat(32), 'd'.repeat(32), 'e'.repeat(32)]
const capability = {
  game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
  taxonomyVersion: 'ba-tyt-math-v1', scopePolicyVersion: 'institution-scope-v1',
  diagnosticEnabled: true,
}
const scopeIdentity = {
  game: 'matematik', examRef: 'TYT', questionExamRef: 'TYT',
  taxonomyVersion: 'ba-tyt-math-v1', scopePolicyVersion: 'institution-scope-v1',
}
const directory = {
  institution: { name: 'Bilge Pilot Kursu', status: 'pilot' }, membership: { role: 'manager' },
  classrooms: [{ id: CLASSROOM_ID, name: 'TYT A Sınıfı', teacherAlias: 'Öğretmen Bir', activeStudentCount: 5,
    students: refs.map((memberRef, index) => ({ memberRef, alias: `Öğrenci ${index + 1}`, joinedAt: '2026-08-01T09:00:00.000Z' })) }],
}
const overview = {
  classroom: { id: CLASSROOM_ID, name: 'TYT A Sınıfı', teacherAlias: 'Öğretmen Bir', activeStudentCount: 5 },
  scope: {
    game: 'matematik', examRef: 'TYT', questionExamRef: 'TYT',
    taxonomyVersion: 'ba-tyt-math-v1', scopePolicyVersion: 'institution-scope-v1',
  },
  summary: { activeStudentCount: 5 },
  teacherIndicators: { modelVersion: 'institution-teacher-indicators-v2', managerOnly: true },
}

function request() { return new Request(`http://localhost/api/institution/tracking/classrooms/${CLASSROOM_ID}/overview`) }
function routeContext(classroomId = CLASSROOM_ID) { return { params: Promise.resolve({ classroomId }) } }

beforeEach(() => {
  vi.clearAllMocks(); mocks.enabled.mockReturnValue(true)
  mocks.context.mockResolvedValue({ ok: true, userId: USER_ID, admin: { rpc: mocks.rpc } })
  mocks.buildStudent.mockImplementation((raw) => ({
    classroom: { id: CLASSROOM_ID }, student: { memberRef: raw.memberRef },
    scope: {
      game: 'matematik', examRef: 'TYT', questionExamRef: 'TYT',
      taxonomyVersion: 'ba-tyt-math-v1', scopePolicyVersion: 'institution-scope-v1',
      windowStart: raw.memberRef === refs[0] ? '2026-07-01T00:00:00.000Z' : '2026-08-01T00:00:00.000Z',
    },
  }))
  mocks.buildOverview.mockReturnValue(overview)
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'get_institution_tracking_directory') return { data: directory, error: null }
    if (name === 'resolve_released_institution_scope') return { data: capability, error: null }
    if (name === 'get_institution_student_learning_analysis_v2') return { data: { memberRef: args.p_member_ref }, error: null }
    if (name === 'get_institution_classroom_published_program_members_v2') return { data: { scope: scopeIdentity, memberRefs: refs.slice(0, 3) }, error: null }
    if (name === 'get_institution_classroom_followup_metrics_v2') return { data: { scope: scopeIdentity, followedMemberRefs: refs.slice(0, 2), interventionEligibleCount: 2, timelyInterventionCount: 1, interventionStudentCount: 2 }, error: null }
    if (name === 'get_institution_classroom_growth_metrics_v2') return { data: { supported: true, modelVersion: 'institution-growth-v2', scope: scopeIdentity, baselineWindowStart: '2026-06-19T00:00:00.000Z', baselineWindowEnd: '2026-07-17T00:00:00.000Z', currentWindowStart: '2026-07-17T00:00:00.000Z', currentWindowEnd: args.p_window_end, eligibleStudentCount: 3, positiveGrowthStudentCount: 2, excludedInsufficientCount: 2 }, error: null }
    return { data: null, error: { code: 'P0002' } }
  })
})

describe('institution classroom overview route', () => {
  it('fails closed before auth when tracking is disabled', async () => {
    mocks.enabled.mockReturnValue(false)
    expect((await GET(request(), routeContext())).status).toBe(503)
    expect(mocks.context).not.toHaveBeenCalled()
  })

  it('loads every roster analysis before program coverage and emits one aggregate', async () => {
    const response = await GET(request(), routeContext())
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const calls = mocks.rpc.mock.calls
    expect(calls.filter(([name]) => name === 'get_institution_student_learning_analysis_v2')).toHaveLength(5)
    expect(calls.find(([name]) => name === 'get_institution_classroom_published_program_members_v2')?.[1]).toMatchObject({
      p_user_id: USER_ID, p_classroom_id: CLASSROOM_ID, p_game: 'matematik',
      p_display_exam_ref: 'TYT', p_window_start: '2026-07-01T00:00:00.000Z',
    })
    expect(calls.find(([name]) => name === 'get_institution_classroom_growth_metrics_v2')?.[1]).toMatchObject({
      p_user_id: USER_ID,
      p_classroom_id: CLASSROOM_ID,
      p_game: 'matematik',
      p_display_exam_ref: 'TYT',
    })
    expect(mocks.buildOverview).toHaveBeenCalledWith(expect.objectContaining({
      analyses: expect.arrayContaining([expect.objectContaining({ student: { memberRef: refs[0] } })]),
      taxonomyVersion: 'ba-tyt-math-v1',
      publishedProgramMemberRefs: refs.slice(0, 3),
      followupMetrics: { followedMemberRefs: refs.slice(0, 2), interventionEligibleCount: 2, timelyInterventionCount: 1, interventionStudentCount: 2 },
      growthMetrics: expect.objectContaining({ modelVersion: 'institution-growth-v2', eligibleStudentCount: 3, positiveGrowthStudentCount: 2 }),
    }))
    expect(await response.json()).toEqual(overview)
  })

  it('rejects unknown classes and never returns a partial aggregate', async () => {
    expect((await GET(request(), routeContext('33333333-3333-4333-8333-333333333333'))).status).toBe(404)
    mocks.buildStudent.mockReturnValueOnce(null)
    const partial = await GET(request(), routeContext())
    expect(partial.status).toBe(500)
    expect(mocks.rpc.mock.calls.filter(([name]) => name.includes('get_institution_classroom_published_program_members'))).toHaveLength(0)
  })

  it.each([0, 1, 2])(
    'refuses a %i-student aggregate before scope and student evidence RPCs',
    async (studentCount) => {
      const smallDirectory = {
        ...directory,
        classrooms: [{
          ...directory.classrooms[0],
          activeStudentCount: studentCount,
          students: directory.classrooms[0].students.slice(0, studentCount),
        }],
      }
      mocks.rpc.mockResolvedValueOnce({ data: smallDirectory, error: null })

      const response = await GET(request(), routeContext())

      expect(response.status).toBe(422)
      expect(await response.json()).toEqual({
        error: 'Toplu analiz için yeterli grup yok',
        supported: false,
        reason: 'insufficient_group',
        minimumGroupSize: 3,
      })
      expect(mocks.rpc).toHaveBeenCalledTimes(1)
      expect(mocks.buildStudent).not.toHaveBeenCalled()
      expect(mocks.buildOverview).not.toHaveBeenCalled()
    },
  )

  it('accepts the three-student privacy boundary and builds one aggregate', async () => {
    const threeStudentDirectory = {
      ...directory,
      classrooms: [{
        ...directory.classrooms[0],
        activeStudentCount: 3,
        students: directory.classrooms[0].students.slice(0, 3),
      }],
    }
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === 'get_institution_tracking_directory') return { data: threeStudentDirectory, error: null }
      if (name === 'resolve_released_institution_scope') return { data: capability, error: null }
      if (name === 'get_institution_student_learning_analysis_v2') return { data: { memberRef: args.p_member_ref }, error: null }
      if (name === 'get_institution_classroom_published_program_members_v2') return { data: { scope: scopeIdentity, memberRefs: refs.slice(0, 3) }, error: null }
      if (name === 'get_institution_classroom_followup_metrics_v2') return { data: { scope: scopeIdentity, followedMemberRefs: refs.slice(0, 2), interventionEligibleCount: 2, timelyInterventionCount: 1, interventionStudentCount: 2 }, error: null }
      if (name === 'get_institution_classroom_growth_metrics_v2') return { data: { supported: true, modelVersion: 'institution-growth-v2', scope: scopeIdentity, baselineWindowStart: '2026-06-19T00:00:00.000Z', baselineWindowEnd: '2026-07-17T00:00:00.000Z', currentWindowStart: '2026-07-17T00:00:00.000Z', currentWindowEnd: args.p_window_end, eligibleStudentCount: 3, positiveGrowthStudentCount: 2, excludedInsufficientCount: 0 }, error: null }
      return { data: null, error: { code: 'P0002' } }
    })

    expect((await GET(request(), routeContext())).status).toBe(200)
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'get_institution_student_learning_analysis_v2')).toHaveLength(3)
    expect(mocks.buildOverview).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['program coverage', 'get_institution_classroom_published_program_members_v2', {
      scope: { ...scopeIdentity, game: 'fen', taxonomyVersion: 'ba-tyt-science-v1' },
      memberRefs: refs.slice(0, 3),
    }],
    ['follow-up metrics', 'get_institution_classroom_followup_metrics_v2', {
      scope: { ...scopeIdentity, game: 'fen', taxonomyVersion: 'ba-tyt-science-v1' },
      followedMemberRefs: refs.slice(0, 2), interventionEligibleCount: 2,
      timelyInterventionCount: 1, interventionStudentCount: 2,
    }],
    ['growth metrics', 'get_institution_classroom_growth_metrics_v2', {
      supported: true, modelVersion: 'institution-growth-v2',
      scope: { ...scopeIdentity, game: 'fen', taxonomyVersion: 'ba-tyt-science-v1' },
      baselineWindowStart: '2026-06-19T00:00:00.000Z',
      baselineWindowEnd: '2026-07-17T00:00:00.000Z',
      currentWindowStart: '2026-07-17T00:00:00.000Z',
      currentWindowEnd: '2026-08-14T00:00:00.000Z',
      eligibleStudentCount: 3, positiveGrowthStudentCount: 2, excludedInsufficientCount: 2,
    }],
  ])('rejects a cross-scope %s payload', async (_label, rpcName, badData) => {
    const normalRpc = mocks.rpc.getMockImplementation()
    expect(normalRpc).toBeTypeOf('function')
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => (
      name === rpcName
        ? { data: badData, error: null }
        : normalRpc!(name, args)
    ))

    const response = await GET(request(), routeContext())

    expect(response.status).toBe(500)
    expect(mocks.buildOverview).not.toHaveBeenCalled()
  })

  it('fails closed before student analysis when Mathematics has no released scope', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'get_institution_tracking_directory') return { data: directory, error: null }
      if (name === 'resolve_released_institution_scope') return { data: null, error: null }
      return { data: null, error: { code: 'P0002' } }
    })
    const response = await GET(request(), routeContext())
    expect(response.status).toBe(503)
    expect(mocks.rpc.mock.calls.filter(([name]) => name.includes('get_institution_student_learning_analysis'))).toHaveLength(0)
  })

  it('removes manager-only teacher indicators from a teacher response', async () => {
    mocks.rpc.mockImplementationOnce(async () => ({
      data: { ...directory, membership: { role: 'teacher' } },
      error: null,
    }))
    const response = await GET(request(), routeContext())
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.teacherIndicators).toBeUndefined()
    expect(body.classroom).toEqual(overview.classroom)
  })

  it('maps tenant denial without exposing database details', async () => {
    mocks.rpc.mockImplementationOnce(async () => ({ data: null, error: { code: '42501', message: 'private row' } }))
    const response = await GET(request(), routeContext())
    expect(response.status).toBe(403)
    expect(JSON.stringify(await response.json())).not.toContain('private row')
  })
})
