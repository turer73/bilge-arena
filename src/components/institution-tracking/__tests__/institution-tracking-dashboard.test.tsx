import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  directory: vi.fn(),
  analysis: vi.fn(),
  createProgram: vi.fn(),
  publishProgram: vi.fn(),
}))
vi.mock('@/lib/institution-tracking/client', () => ({
  isInstitutionTrackingUiEnabled: mocks.enabled,
  fetchInstitutionTrackingDirectory: mocks.directory,
  fetchInstitutionStudentLearningAnalysis: mocks.analysis,
  createInstitutionStudyProgramDraft: mocks.createProgram,
  publishInstitutionStudyProgram: mocks.publishProgram,
  InstitutionTrackingClientError: class InstitutionTrackingClientError extends Error {
    constructor(readonly status: number) { super(`institution_tracking_request_${status}`) }
  },
}))

import { InstitutionTrackingDashboard } from '../institution-tracking-dashboard'

const CLASSROOM_ID = '22222222-2222-4222-8222-222222222222'
const MEMBER_ONE = 'a'.repeat(32)
const MEMBER_TWO = 'b'.repeat(32)
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

function analysis(memberRef = MEMBER_ONE, alias = 'Öğrenci Bir Çok Uzun Ad') {
  return {
    classroom: { id: CLASSROOM_ID, name: directory.classrooms[0].name },
    student: { memberRef, alias, joinedAt: '2026-08-01T09:00:00.000Z' },
    scope: {
      game: 'matematik' as const,
      examRef: 'TYT' as const,
      taxonomyVersion: 'ba-tyt-math-v1' as const,
      modelVersion: 'institution-evidence-v1' as const,
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
      },
    }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockReturnValue(true)
  mocks.directory.mockResolvedValue(directory)
  mocks.analysis.mockImplementation(async (_classroomId: string, memberRef: string) => (
    memberRef === MEMBER_TWO ? analysis(MEMBER_TWO, 'Öğrenci İki') : analysis()
  ))
  mocks.createProgram.mockResolvedValue({
    program: { programRef: 'c'.repeat(32), status: 'draft', weekStart: '2026-08-17', dailyMinuteLimit: 45, modelVersion: 'institution-program-v1', itemCount: 1, createdAt: '2026-08-14T00:00:00.000Z', reviewedAt: null, publishedAt: null, replayed: false },
    draft: { status: 'draft', weekStart: '2026-08-17', modelVersion: 'institution-program-v1', generatedAt: '2026-08-14T00:00:00.000Z', dailyMinuteLimit: 45, items: [{ position: 1, scheduledDate: '2026-08-17', taskType: 'diagnostic', title: 'Temel kavramlar durum tespiti', reasonCode: 'diagnostic_gap', outcomeCode: 'MAT-01', durationMinutes: 20, targetQuestionCount: 10 }] },
  })
  mocks.publishProgram.mockResolvedValue({ programRef: 'c'.repeat(32), status: 'published', weekStart: '2026-08-17', dailyMinuteLimit: 45, modelVersion: 'institution-program-v1', itemCount: 1, createdAt: '2026-08-14T00:00:00.000Z', reviewedAt: '2026-08-14T00:05:00.000Z', publishedAt: '2026-08-14T00:05:00.000Z', replayed: false })
})

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
    expect(await screen.findByRole('heading', { name: 'Öğrenci Bir Çok Uzun Ad' })).toBeInTheDocument()
    expect(screen.getByText('Sayı Kümeleri ve Çok Uzun Kazanım Açıklaması')).toBeInTheDocument()
    expect(screen.getAllByText('Kanıt yetersiz').length).toBeGreaterThan(0)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Bağımsız oturum')).toBeInTheDocument()
  })

  it('loads the selected opaque student without exposing internal ids', async () => {
    const user = userEvent.setup()
    const { container } = render(<InstitutionTrackingDashboard />)
    await screen.findByRole('heading', { name: 'Öğrenci Bir Çok Uzun Ad' })
    await user.click(screen.getByRole('button', { name: /Öğrenci İki/i }))
    await waitFor(() => expect(mocks.analysis).toHaveBeenLastCalledWith(
      CLASSROOM_ID,
      MEMBER_TWO,
      expect.any(AbortSignal),
    ))
    expect(await screen.findByRole('heading', { name: 'Öğrenci İki' })).toBeInTheDocument()
    expect(container.textContent).not.toContain(CLASSROOM_ID)
    expect(container.textContent).not.toContain(MEMBER_TWO)
  })

  it.each([320, 375, 390])('lets a teacher inspect and publish a generated draft at %ipx', async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    mocks.directory.mockResolvedValue({ ...directory, membership: { role: 'teacher' as const } })
    const user = userEvent.setup()
    render(<InstitutionTrackingDashboard />)
    await screen.findByRole('heading', { name: 'Öğrenci Bir Çok Uzun Ad' })
    await user.click(screen.getByRole('button', { name: 'Taslak oluştur' }))
    expect(await screen.findByText('Temel kavramlar durum tespiti')).toBeInTheDocument()
    expect(mocks.publishProgram).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /İnceledim, yayınla/i }))
    expect(await screen.findByText('Yayınlandı')).toBeInTheDocument()
  })
})
