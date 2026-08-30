import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('next/navigation', () => ({ usePathname: () => '/arena/kurum' }))

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  scopes: vi.fn(),
  directory: vi.fn(),
  analysis: vi.fn(),
  overview: vi.fn(),
  createProgram: vi.fn(),
  publishProgram: vi.fn(),
  updateProgram: vi.fn(),
  fetchFollowups: vi.fn(),
  openFollowup: vi.fn(),
  resolveFollowup: vi.fn(),
  fetchProgramHistory: vi.fn(),
  previewProgramReview: vi.fn(),
  reviewProgram: vi.fn(),
  fetchReports: vi.fn(),
  createReport: vi.fn(),
  issueInvite: vi.fn(),
  revokeInvite: vi.fn(),
}))
vi.mock('@/lib/institution-tracking/client', () => ({
  isInstitutionTrackingUiEnabled: mocks.enabled,
  fetchInstitutionLearningScopes: mocks.scopes,
  fetchInstitutionTrackingDirectory: mocks.directory,
  fetchInstitutionStudentLearningAnalysis: mocks.analysis,
  fetchInstitutionClassroomOverview: mocks.overview,
  createInstitutionStudyProgramDraft: mocks.createProgram,
  publishInstitutionStudyProgram: mocks.publishProgram,
  updateInstitutionStudyProgramDraft: mocks.updateProgram,
  fetchInstitutionStudentFollowups: mocks.fetchFollowups,
  openInstitutionStudentFollowup: mocks.openFollowup,
  resolveInstitutionStudentFollowup: mocks.resolveFollowup,
  fetchInstitutionStudentProgramHistory: mocks.fetchProgramHistory,
  previewInstitutionStudyProgramReview: mocks.previewProgramReview,
  reviewInstitutionStudyProgram: mocks.reviewProgram,
  fetchInstitutionStudentReports: mocks.fetchReports,
  createInstitutionStudentReport: mocks.createReport,
  InstitutionTrackingClientError: class InstitutionTrackingClientError extends Error {
    constructor(readonly status: number) { super(`institution_tracking_request_${status}`) }
  },
}))
vi.mock('@/lib/teacher-classroom/client', () => ({
  issueTeacherClassroomInvite: mocks.issueInvite,
  revokeTeacherClassroomInvite: mocks.revokeInvite,
}))

import { InstitutionTrackingDashboard } from '../institution-tracking-dashboard'

const CLASSROOM_ID = '22222222-2222-4222-8222-222222222222'
const MEMBER_ONE = 'a'.repeat(32)
const MEMBER_TWO = 'b'.repeat(32)
const MATH_SCOPE = {
  game: 'matematik' as const,
  displayExamRef: 'TYT' as const,
  questionExamRef: 'TYT' as const,
  taxonomyVersion: 'ba-tyt-math-v1' as const,
  scopePolicyVersion: 'institution-scope-v1' as const,
  diagnosticEnabled: true,
}
const SCIENCE_SCOPE = {
  game: 'fen' as const,
  displayExamRef: 'TYT' as const,
  questionExamRef: 'TYT' as const,
  taxonomyVersion: 'ba-tyt-fen-v1' as const,
  scopePolicyVersion: 'institution-scope-v1' as const,
  diagnosticEnabled: false,
}
const directory = {
  institution: { name: 'Bilge Pilot Kursu Çok Uzun Kurum Adı', status: 'pilot' as const },
  membership: { role: 'manager' as const },
  classrooms: [{
    id: CLASSROOM_ID,
    name: 'TYT Çok Uzun Sınıf Adı A',
    teacherAlias: 'Öğretmen Bir',
    activeStudentCount: 2,
    students: [
      { memberRef: MEMBER_ONE, alias: 'Öğrenci Bir Çok Uzun Ad', joinedAt: '2026-08-01T09:00:00.000Z' },
      { memberRef: MEMBER_TWO, alias: 'Öğrenci İki', joinedAt: '2026-08-02T09:00:00.000Z' },
    ],
  }],
}

const indicator = (value: number | null, numerator = 0, denominator = 0) => ({
  status: value === null ? 'insufficient' as const : 'available' as const,
  value, eligibleStudentCount: 5, excludedInsufficientCount: 1,
  evidence: denominator ? [{ code: 'explained_indicator', numerator, denominator }] : [],
})
const classroomOverview = {
  classroom: { id: CLASSROOM_ID, name: directory.classrooms[0].name, teacherAlias: 'Öğretmen Bir', activeStudentCount: 5 },
  scope: { game: 'matematik' as const, examRef: 'TYT' as const, questionExamRef: 'TYT' as const, taxonomyVersion: 'ba-tyt-math-v1' as const, scopePolicyVersion: 'institution-scope-v1' as const, modelVersion: 'institution-classroom-overview-v2' as const, windowStart: '2026-08-01T00:00:00.000Z', windowEnd: '2026-08-14T00:00:00.000Z', minimumGroupSize: 3 as const },
  summary: { activeStudentCount: 5, studentsWithDecisionSafeEvidence: 4, studentsNeedingSupport: 3, studentsWithoutDecisionSafeEvidence: 1, eligibleStudentOutcomeCount: 4, developingStudentOutcomeCount: 3, masteredStudentOutcomeCount: 1 },
  priorityOutcomes: [{ code: 'MAT-SAY-01', title: 'Sayı Kümeleri ve Çok Uzun Ortak Sınıf İhtiyacı', studentCount: 3, evidenceCount: 18, averageScore: 49.5 }],
  teacherIndicators: { modelVersion: 'institution-teacher-indicators-v2', windowStart: '2026-08-01T00:00:00.000Z', windowEnd: '2026-08-14T00:00:00.000Z', dimensions: { studentGrowth: indicator(null), followUpDiscipline: indicator(null), programManagement: indicator(66.7, 2, 3), interventionResponsiveness: indicator(null), dataReliability: indicator(80, 4, 5) } },
}

function analysis(memberRef = MEMBER_ONE, alias = 'Öğrenci Bir Çok Uzun Ad') {
  return {
    classroom: { id: CLASSROOM_ID, name: directory.classrooms[0].name },
    student: { memberRef, alias, joinedAt: '2026-08-01T09:00:00.000Z' },
    scope: {
      game: 'matematik' as const,
      examRef: 'TYT' as const,
      questionExamRef: 'TYT' as const,
      taxonomyVersion: 'ba-tyt-math-v1' as const,
      diagnosticEnabled: true,
      institutionReportingEnabled: true as const,
      scopePolicyVersion: 'institution-scope-v1' as const,
      modelVersion: 'institution-evidence-v2' as const,
      windowStart: '2026-08-01T09:00:00.000Z',
      windowEnd: '2026-08-13T12:00:00.000Z',
    },
    coverage: { supported: true as const, totalQuestions: 120, mappedQuestions: 120, percentage: 100 as const },
    summary: {
      outcomeCount: 1,
      assessedOutcomeCount: 0,
      insufficientOutcomeCount: 1,
      developingOutcomeCount: 0,
      masteredOutcomeCount: 0,
    },
    outcomes: [{
      code: 'MAT-SAY-01',
      nodeCode: 'node-1',
      path: ['TYT Matematik', 'Sayılar ve Cebir', 'Temel Kavramlar', 'Sayı Kümeleri'],
      title: 'Sayı Kümeleri ve Çok Uzun Kazanım Açıklaması',
      category: 'sayilar',
      assessment: {
        outcomeCode: 'MAT-SAY-01',
        status: 'insufficient' as const,
        score: null,
        confidence: 'insufficient' as const,
        evidence: {
          evidenceCount: 2,
          independentEvidenceCount: 1,
          firstEvidenceAt: '2026-08-02T10:00:00.000Z',
          lastEvidenceAt: '2026-08-02T10:00:00.000Z',
          windowStart: '2026-08-01T09:00:00.000Z',
          windowEnd: '2026-08-13T12:00:00.000Z',
          modelVersion: 'institution-evidence-v1',
          taxonomyVersion: 'ba-tyt-math-v1',
          coverageSupported: true,
        },
      },
      details: {
        correctEvidenceCount: 2,
        delayedCorrectCount: 0,
        rawAccuracy: 100,
        difficultyAccuracy: 100,
        hintRate: 0,
        fastWrongRate: 0,
        components: { accuracy: 55, delayedRetrieval: 0, independence: 15, selfRegulation: 10 },
        diagnosticSources: [{
          outcomeCode: 'MAT-SAY-01',
          completedSessionId: '22222222-2222-4222-8222-222222222222',
          completedAt: '2026-08-12T09:00:00.000Z',
          attempts: 2,
          correctAttempts: 1,
          score: 50,
          taxonomyVersion: 'ba-tyt-math-v1',
        }],
      },
    }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockReturnValue(true)
  mocks.scopes.mockResolvedValue({ scopes: [MATH_SCOPE] })
  mocks.directory.mockResolvedValue(directory)
  mocks.overview.mockResolvedValue(classroomOverview)
  mocks.analysis.mockImplementation(async (_classroomId: string, memberRef: string) => (
    memberRef === MEMBER_TWO ? analysis(MEMBER_TWO, 'Öğrenci İki') : analysis()
  ))
  mocks.createProgram.mockResolvedValue({
    program: { programRef: 'c'.repeat(32), status: 'draft', weekStart: '2026-08-17', dailyMinuteLimit: 45, modelVersion: 'institution-program-v1', itemCount: 2, createdAt: '2026-08-14T00:00:00.000Z', reviewedAt: null, publishedAt: null, replayed: false },
    draft: { status: 'draft', weekStart: '2026-08-17', modelVersion: 'institution-program-v1', generatedAt: '2026-08-14T00:00:00.000Z', dailyMinuteLimit: 45, items: [{ position: 1, scheduledDate: '2026-08-17', taskType: 'diagnostic', title: 'Temel kavramlar durum tespiti', reasonCode: 'diagnostic_gap', outcomeCode: 'MAT-01', durationMinutes: 20, targetQuestionCount: 10 }, { position: 2, scheduledDate: '2026-08-18', taskType: 'verified_questions', title: 'Sayı kümeleri hedefli soru çalışması', reasonCode: 'weak_outcome', outcomeCode: 'MAT-02', durationMinutes: 25, targetQuestionCount: 15 }] },
  })
  mocks.updateProgram.mockResolvedValue({ programRef: 'c'.repeat(32), status: 'draft', weekStart: '2026-08-17', dailyMinuteLimit: 45, modelVersion: 'institution-program-v1', itemCount: 1, createdAt: '2026-08-14T00:00:00.000Z', reviewedAt: null, publishedAt: null, replayed: false })
  mocks.publishProgram.mockResolvedValue({ programRef: 'c'.repeat(32), status: 'published', weekStart: '2026-08-17', dailyMinuteLimit: 45, modelVersion: 'institution-program-v1', itemCount: 1, createdAt: '2026-08-14T00:00:00.000Z', reviewedAt: '2026-08-14T00:05:00.000Z', publishedAt: '2026-08-14T00:05:00.000Z', replayed: false })
  mocks.fetchFollowups.mockResolvedValue({ followups: [] })
  mocks.openFollowup.mockResolvedValue({ followupRef: 'd'.repeat(32), reasonCode: 'support_needed', status: 'open', openedAt: '2026-08-14T09:00:00.000Z', resolvedAt: null, replayed: false })
  mocks.resolveFollowup.mockResolvedValue({ followupRef: 'd'.repeat(32), reasonCode: 'support_needed', status: 'resolved', openedAt: '2026-08-14T09:00:00.000Z', resolvedAt: '2026-08-14T10:00:00.000Z', replayed: false })
  mocks.fetchProgramHistory.mockResolvedValue({ programs: [] })
  mocks.fetchReports.mockResolvedValue({ reports: [] })
})

afterEach(() => vi.unstubAllGlobals())

describe('InstitutionTrackingDashboard', () => {
  it('shows a closed pilot surface without fetching when the UI flag is off', () => {
    mocks.enabled.mockReturnValue(false)
    render(<InstitutionTrackingDashboard />)
    expect(screen.getByRole('heading', { name: /kontrollü pilotta/i })).toBeInTheDocument()
    expect(mocks.directory).not.toHaveBeenCalled()
  })

  it.each([320, 375, 390])('renders long names and sparse evidence at %ipx', async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    render(<InstitutionTrackingDashboard />)
    expect(await screen.findByText(directory.institution.name)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Bugünkü akademik görünüm' })).toBeInTheDocument()
    expect(await screen.findByText('Toplu analiz için en az 3 aktif öğrenci gerekir.')).toBeInTheDocument()
    expect(screen.queryByText('Sayı Kümeleri ve Çok Uzun Ortak Sınıf İhtiyacı')).not.toBeInTheDocument()
    expect(screen.getByText('Tek puan ve sıralama yoktur')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Öğretmen takip göstergeleri' })).toBeInTheDocument()
    expect(screen.getByText('Kurum yöneticisi görünümü')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Öğrenci Bir Çok Uzun Ad' })).not.toBeInTheDocument()
    expect(mocks.overview).not.toHaveBeenCalled()
    expect(mocks.analysis).not.toHaveBeenCalled()
  })

  it('loads aggregate evidence at the three-student privacy boundary', async () => {
    mocks.directory.mockResolvedValue({
      ...directory,
      classrooms: [{
        ...directory.classrooms[0],
        activeStudentCount: 3,
        students: [
          ...directory.classrooms[0].students,
          { memberRef: 'c'.repeat(32), alias: 'Öğrenci Üç', joinedAt: '2026-08-03T09:00:00.000Z' },
        ],
      }],
    })

    render(<InstitutionTrackingDashboard />)

    expect(await screen.findByText('Sayı Kümeleri ve Çok Uzun Ortak Sınıf İhtiyacı')).toBeInTheDocument()
    expect(mocks.overview).toHaveBeenCalledWith(CLASSROOM_ID, MATH_SCOPE, expect.any(AbortSignal))
  })

  it('explains the privacy threshold while keeping the valid selected-student analysis', async () => {
    mocks.overview.mockRejectedValue(new Error('partial roster'))
    render(<InstitutionTrackingDashboard initialClassroomId={CLASSROOM_ID} />)
    expect(await screen.findByText(/Toplu sınıf grafikleri için en az 3 aktif öğrenci gerekir/i)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Öğrenci Bir Çok Uzun Ad' })).toBeInTheDocument()
  })

  it('keeps delegated directory access read-only outside the teacher classroom', async () => {
    mocks.directory.mockResolvedValue({
      ...directory,
      membership: { role: 'teacher' as const },
      classrooms: [{ ...directory.classrooms[0], canAnalyze: false }],
    })
    render(<InstitutionTrackingDashboard initialClassroomId={CLASSROOM_ID} />)
    expect(await screen.findByRole('heading', { name: 'Dizin erişimi açık, öğrenme analizi sınırlı' })).toBeInTheDocument()
    expect(mocks.overview).not.toHaveBeenCalled()
    expect(mocks.analysis).not.toHaveBeenCalled()
    expect(screen.getByText('Öğrenci Bir Çok Uzun Ad')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Roller ve Yetkiler' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sınıf oluştur' })).not.toBeInTheDocument()
  })

  it('lets a manager create the first teacher-owned classroom and refreshes the directory', async () => {
    const emptyDirectory = { ...directory, classrooms: [] }
    const createdDirectory = {
      ...directory,
      classrooms: [{
        id: '33333333-3333-4333-8333-333333333333',
        name: 'TYT Matematik A',
        teacherAlias: 'Öğretmen Bir',
        activeStudentCount: 0,
        students: [],
      }],
    }
    mocks.directory
      .mockResolvedValueOnce(emptyDirectory)
      .mockResolvedValueOnce(createdDirectory)
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path === '/api/institution/support-access') {
        return Response.json({ active: false, scope: 'read_only', expiresAt: null, reason: null })
      }
      if (path === '/api/institution/roles') {
        return Response.json({
          permissions: [],
          roles: [],
          members: [{ memberRef: 'd'.repeat(32), alias: 'Öğretmen Bir', membershipRole: 'teacher', roleRefs: [] }],
        })
      }
      if (path === '/api/institution/classrooms' && init?.method === 'POST') {
        return Response.json({
          classroom: { id: createdDirectory.classrooms[0].id, name: 'TYT Matematik A', status: 'active', createdAt: '2026-08-20T12:00:00.000Z' },
          teacher: { memberRef: 'd'.repeat(32), alias: 'Öğretmen Bir' },
          replayed: false,
        }, { status: 201 })
      }
      return Response.json({ error: 'unexpected request' }, { status: 500 })
    }))

    const user = userEvent.setup()
    render(<InstitutionTrackingDashboard />)
    expect(await screen.findByRole('heading', { name: 'Aktif sınıf bulunamadı' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Roller ve Destek' })[0]).toHaveAttribute('href', '/arena/kurum/roller')
    await user.click(screen.getByRole('button', { name: 'İlk sınıfı oluştur' }))
    await screen.findByRole('option', { name: 'Öğretmen Bir' })
    await user.type(screen.getByLabelText('Sınıf adı'), 'TYT Matematik A')
    await user.click(screen.getByRole('button', { name: 'Sınıfı oluştur' }))

    expect(await screen.findByRole('status')).toHaveTextContent('TYT Matematik A, Öğretmen Bir öğretmenine atandı.')
    await waitFor(() => expect(mocks.directory).toHaveBeenCalledTimes(2))
    expect((await screen.findAllByText('TYT Matematik A')).length).toBeGreaterThan(0)
  })

  it('returns keyboard focus to the class creator trigger when the inline panel closes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/institution/roles') {
        return Response.json({
          permissions: [],
          roles: [],
          members: [{ memberRef: 'd'.repeat(32), alias: 'Öğretmen Bir', membershipRole: 'teacher', roleRefs: [] }],
        })
      }
      return Response.json({ error: 'unexpected request' }, { status: 500 })
    }))
    const user = userEvent.setup()
    render(<InstitutionTrackingDashboard />)
    const trigger = await screen.findByRole('button', { name: 'Sınıf oluştur' })
    await user.click(trigger)
    expect(await screen.findByRole('heading', { name: 'Yeni sınıf oluştur' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sınıf oluşturmayı kapat' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Yeni sınıf oluştur' })).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('loads the selected opaque student without exposing internal ids', async () => {
    const { container } = render(<InstitutionTrackingDashboard initialClassroomId={CLASSROOM_ID} initialMemberRef={MEMBER_TWO} />)
    await waitFor(() => expect(mocks.analysis).toHaveBeenLastCalledWith(
      CLASSROOM_ID,
      MEMBER_TWO,
      MATH_SCOPE,
      expect.any(AbortSignal),
    ))
    expect(await screen.findByRole('heading', { name: 'Öğrenci İki' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Öğrenci İki/i })).toHaveAttribute(
      'href',
      `/arena/kurum/sinif/${CLASSROOM_ID}?ogrenci=${MEMBER_TWO}&game=matematik&exam_ref=TYT`,
    )
    expect(container.textContent).not.toContain(CLASSROOM_ID)
    expect(container.textContent).not.toContain(MEMBER_TWO)
  })

  it('changes classroom evidence only through a released exact scope', async () => {
    mocks.scopes.mockResolvedValue({ scopes: [MATH_SCOPE, SCIENCE_SCOPE] })
    mocks.directory.mockResolvedValue({
      ...directory,
      classrooms: [{ ...directory.classrooms[0], canManagePrograms: true }],
    })
    mocks.analysis.mockImplementation(async (
      _classroomId: string,
      memberRef: string,
      scope: typeof MATH_SCOPE | typeof SCIENCE_SCOPE,
    ) => {
      const base = memberRef === MEMBER_TWO ? analysis(MEMBER_TWO, 'Öğrenci İki') : analysis()
      return scope.game === 'fen' ? {
        ...base,
        scope: {
          ...base.scope,
          game: 'fen' as const,
          taxonomyVersion: 'ba-tyt-fen-v1' as const,
          diagnosticEnabled: false,
        },
      } : base
    })
    const user = userEvent.setup()
    render(<InstitutionTrackingDashboard initialClassroomId={CLASSROOM_ID} />)

    const selector = await screen.findByLabelText('Öğrenme analizi kapsamı')
    await screen.findByText(/TYT · Matematik · ba-tyt-math-v1/)
    expect(screen.getByRole('button', { name: 'Taslak oluştur' })).toBeInTheDocument()
    await user.selectOptions(selector, 'fen:TYT')

    await waitFor(() => expect(mocks.analysis).toHaveBeenLastCalledWith(
      CLASSROOM_ID,
      MEMBER_ONE,
      SCIENCE_SCOPE,
      expect.any(AbortSignal),
    ))
    expect(await screen.findByText(/TYT · Fen Bilimleri · ba-tyt-fen-v1/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Taslak oluştur' })).not.toBeInTheDocument()
  })

  it('links each institution classroom to its own workspace', async () => {
    render(<InstitutionTrackingDashboard />)

    expect(await screen.findByRole('link', { name: /Sınıf çalışma alanına git/i })).toHaveAttribute(
      'href',
      `/arena/kurum/sinif/${CLASSROOM_ID}?game=matematik&exam_ref=TYT`,
    )
  })

  it('honors an exact initial scope and preserves it through classroom, student, and overview links', async () => {
    mocks.scopes.mockResolvedValue({ scopes: [MATH_SCOPE, SCIENCE_SCOPE] })

    render(<InstitutionTrackingDashboard initialClassroomId={CLASSROOM_ID} initialScope={{ game: 'fen', displayExamRef: 'TYT' }} />)

    await waitFor(() => expect(mocks.analysis).toHaveBeenLastCalledWith(
      CLASSROOM_ID,
      MEMBER_ONE,
      SCIENCE_SCOPE,
      expect.any(AbortSignal),
    ))
    expect(screen.getByRole('link', { name: /Öğrenci İki/i })).toHaveAttribute(
      'href',
      `/arena/kurum/sinif/${CLASSROOM_ID}?ogrenci=${MEMBER_TWO}&game=fen&exam_ref=TYT`,
    )
    expect(screen.getByRole('link', { name: 'Genel bakış' })).toHaveAttribute(
      'href',
      '/arena/kurum?game=fen&exam_ref=TYT',
    )
  })

  it('fails safe when an allowlisted deep-link scope is absent from released scopes', async () => {
    render(<InstitutionTrackingDashboard initialClassroomId={CLASSROOM_ID} initialScope={{ game: 'fen', displayExamRef: 'TYT' }} />)

    expect(await screen.findByRole('alert', { name: '' })).toHaveTextContent('İstenen analiz kapsamı yayımlanmamış.')
    expect(screen.getByRole('heading', { name: 'İstenen analiz kapsamı yayımlanmamış' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Öğrenme analizi kapsamı')).not.toBeInTheDocument()
    expect(mocks.overview).not.toHaveBeenCalled()
    expect(mocks.analysis).not.toHaveBeenCalled()
  })

  it('renders the dedicated classroom workspace and offers invites only to its owner', async () => {
    mocks.directory.mockResolvedValue({
      ...directory,
      membership: { role: 'manager' as const, teacherEnabled: true },
      classrooms: [{ ...directory.classrooms[0], canManagePrograms: true }],
    })
    const user = userEvent.setup()
    render(<InstitutionTrackingDashboard initialClassroomId={CLASSROOM_ID} />)

    expect(await screen.findByText('Sınıf Çalışma Alanı')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: directory.classrooms[0].name })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Genel bakış' })).toHaveAttribute(
      'href',
      '/arena/kurum?game=matematik&exam_ref=TYT',
    )
    expect(screen.queryByRole('button', { name: 'Sınıf oluştur' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Öğretmen Takibi' })).not.toBeInTheDocument()
    const outcomeHeading = await screen.findByRole('heading', { name: 'Kazanım analizi' })
    expect(screen.getByText('Aktif soru bankası eşlemesi: %100')).toBeInTheDocument()
    expect(screen.getByText(/Bu yalnız başlangıç yönü sağlayan ayrı bir sinyaldir/)).toHaveTextContent('hâkimiyet skoru değildir')
    const followupHeading = screen.getByRole('heading', { name: 'Öğrenci destek takibi' })
    const programHeading = screen.getByRole('heading', { name: 'Haftalık çalışma programı' })
    const resultsHeading = screen.getByRole('heading', { name: 'Program sonuçları' })
    const reportHeading = screen.getByRole('heading', { name: 'Öğrenci durum raporu' })
    const guardianHeading = screen.getByRole('heading', { name: 'Veli bilgilendirme taslağı' })
    expect(outcomeHeading.compareDocumentPosition(followupHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(followupHeading.compareDocumentPosition(programHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(programHeading.compareDocumentPosition(resultsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(resultsHeading.compareDocumentPosition(reportHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(reportHeading.compareDocumentPosition(guardianHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await waitFor(() => expect(mocks.fetchReports).toHaveBeenCalledWith(
      CLASSROOM_ID, MEMBER_ONE, { game: 'matematik', displayExamRef: 'TYT' }, expect.any(AbortSignal),
    ))
    await user.click(screen.getByRole('button', { name: 'Öğrenci ekle' }))
    expect(screen.getByRole('dialog', { name: directory.classrooms[0].name })).toBeInTheDocument()
  })

  it('does not query or reveal an unseen classroom workspace', async () => {
    const unseenClassroomId = '33333333-3333-4333-8333-333333333333'
    render(<InstitutionTrackingDashboard initialClassroomId={unseenClassroomId} />)

    expect(await screen.findByRole('heading', { name: 'Sınıf çalışma alanı bulunamadı' })).toBeInTheDocument()
    expect(mocks.overview).not.toHaveBeenCalled()
    expect(mocks.analysis).not.toHaveBeenCalled()
    expect(screen.getByText(/aktif olmayabilir veya hesabınız/i)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(unseenClassroomId)
  })

  it('keeps the student invite action hidden from delegated classroom roles', async () => {
    mocks.directory.mockResolvedValue({
      ...directory,
      membership: { role: 'teacher' as const, teacherEnabled: true },
      classrooms: [{ ...directory.classrooms[0], canAnalyze: false, canManagePrograms: false }],
    })
    render(<InstitutionTrackingDashboard initialClassroomId={CLASSROOM_ID} />)

    expect(await screen.findByRole('heading', { name: directory.classrooms[0].name })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Öğrenci ekle' })).not.toBeInTheDocument()
    expect(mocks.overview).not.toHaveBeenCalled()
  })

  it.each([320, 375, 390])('lets a teacher inspect and publish a generated draft at %ipx', async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    mocks.directory.mockResolvedValue({
      ...directory,
      membership: { role: 'teacher' as const, teacherEnabled: true },
      classrooms: [{ ...directory.classrooms[0], canManagePrograms: true }],
    })
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<InstitutionTrackingDashboard initialClassroomId={CLASSROOM_ID} />)
    await screen.findByRole('heading', { name: 'Öğrenci Bir Çok Uzun Ad' })
    await user.click(screen.getByRole('button', { name: 'E-posta taslağını kopyala' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('otomatik gönderim değildir'))
    expect(screen.getByRole('button', { name: 'Kopyalandı' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Taslak oluştur' }))
    expect(await screen.findByText('Temel kavramlar durum tespiti')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Yazdır / PDF' }))
    expect(print).toHaveBeenCalledOnce()
    expect(mocks.publishProgram).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Sayı kümeleri hedefli soru çalışması görevini çıkar/i }))
    expect(screen.getByText('Kaydedilmemiş değişiklik')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Önce değişiklikleri kaydet/i })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }))
    await waitFor(() => expect(mocks.updateProgram).toHaveBeenCalledWith('c'.repeat(32), expect.objectContaining({ items: [expect.objectContaining({ position: 1, title: 'Temel kavramlar durum tespiti' })] })))
    await user.click(screen.getByRole('button', { name: /İnceledim, yayınla/i }))
    expect(await screen.findByText('Yayınlandı')).toBeInTheDocument()
  })

  it('shows dual-role manager copy and enables programs only for the managers own classroom', async () => {
    mocks.directory.mockResolvedValue({
      ...directory,
      membership: { role: 'manager' as const, teacherEnabled: true },
      classrooms: [{ ...directory.classrooms[0], canManagePrograms: true }],
    })
    const view = render(<InstitutionTrackingDashboard />)
    expect(await screen.findByText(/Kurum yöneticisi ve öğretmen görünümü/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Taslak oluştur' })).not.toBeInTheDocument()
    view.unmount()

    render(<InstitutionTrackingDashboard initialClassroomId={CLASSROOM_ID} />)
    expect(await screen.findByRole('button', { name: 'Taslak oluştur' })).toBeInTheDocument()
  })
})
