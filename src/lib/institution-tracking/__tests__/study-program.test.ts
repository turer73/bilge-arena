import { describe, expect, it } from 'vitest'
import { generateInstitutionStudyProgramDraft } from '../study-program'

const assessment = (
  code: string,
  status: 'insufficient' | 'developing' | 'mastered',
  score: number | null,
  evidenceCount: number,
  diagnosticSources: Array<{
    outcomeCode: string
    completedSessionId: string
    completedAt: string
    attempts: number
    correctAttempts: number
    score: number
    taxonomyVersion: string
  }> = [],
) => ({
  code,
  nodeCode: `ba-tyt-math-v1:outcome:${code.toLowerCase()}`,
  path: ['TYT Matematik', 'Sayılar', 'Temel Kavramlar', code],
  title: `Kazanım ${code}`,
  category: 'sayilar',
  assessment: {
    outcomeCode: code,
    status,
    score,
    confidence: status === 'insufficient' ? 'insufficient' : 'medium',
    evidence: {
      evidenceCount,
      independentEvidenceCount: status === 'insufficient' ? Math.min(1, evidenceCount) : 3,
      firstEvidenceAt: evidenceCount ? '2026-08-02T10:00:00.000Z' : null,
      lastEvidenceAt: evidenceCount ? '2026-08-12T10:00:00.000Z' : null,
      windowStart: '2026-08-01T09:00:00.000Z',
      windowEnd: '2026-08-13T12:00:00.000Z',
      modelVersion: 'institution-evidence-v1',
      taxonomyVersion: 'ba-tyt-math-v1',
      coverageSupported: true,
    },
  },
  details: {
    correctEvidenceCount: Math.min(evidenceCount, 3),
    delayedCorrectCount: 0,
    rawAccuracy: score ?? 0,
    difficultyAccuracy: score ?? 0,
    hintRate: 0,
    fastWrongRate: 0,
    components: { accuracy: score ?? 0, delayedRetrieval: 0, independence: 100, selfRegulation: 100 },
    diagnosticSources,
  },
})

function analysis(outcomes: ReturnType<typeof assessment>[]) {
  const counts = outcomes.reduce((result, outcome) => {
    result[outcome.assessment.status] += 1
    return result
  }, { insufficient: 0, developing: 0, mastered: 0 })
  return {
    classroom: { id: '11111111-1111-4111-8111-111111111111', name: 'TYT A Sınıfı' },
    student: { memberRef: 'a'.repeat(32), alias: 'Bilge Öğrenci', joinedAt: '2026-08-01T09:00:00.000Z' },
    scope: {
      game: 'matematik', examRef: 'TYT', taxonomyVersion: 'ba-tyt-math-v1',
      questionExamRef: 'TYT',
      diagnosticEnabled: true,
      modelVersion: 'institution-evidence-v1', windowStart: '2026-08-01T09:00:00.000Z',
      windowEnd: '2026-08-13T12:00:00.000Z',
    },
    coverage: { supported: true, totalQuestions: 120, mappedQuestions: 120, percentage: 100 },
    summary: {
      outcomeCount: outcomes.length,
      assessedOutcomeCount: counts.developing + counts.mastered,
      insufficientOutcomeCount: counts.insufficient,
      developingOutcomeCount: counts.developing,
      masteredOutcomeCount: counts.mastered,
    },
    outcomes,
  }
}

describe('institution weekly study program generator', () => {
  it('prioritizes weakest assessed outcomes, then diagnostic gaps and reviews', () => {
    const result = generateInstitutionStudyProgramDraft(analysis([
      assessment('MAT-01', 'developing', 62, 8),
      assessment('MAT-02', 'developing', 41, 7),
      assessment('MAT-03', 'insufficient', null, 2),
      assessment('MAT-04', 'mastered', 88, 10),
    ]), {
      weekStart: '2026-08-17', dailyMinuteLimit: 45, generatedAt: '2026-08-14T00:00:00.000Z',
    })

    expect(result?.status).toBe('draft')
    expect(result?.items.map((item) => item.outcomeCode)).toEqual(['MAT-02', 'MAT-01', 'MAT-03', 'MAT-04'])
    expect(result?.items.map((item) => item.taskType)).toEqual([
      'verified_questions', 'verified_questions', 'diagnostic', 'verified_questions',
    ])
    expect(result?.items.find((item) => item.outcomeCode === 'MAT-04')).toEqual(expect.objectContaining({
      taskType: 'verified_questions',
      reasonCode: 'current_target',
      title: 'Kazanım MAT-04: doğrulanmış pekiştirme çalışması',
    }))
    expect(result?.items
      .filter((item) => item.taskType === 'verified_questions' || item.taskType === 'diagnostic')
      .every((item) => item.targetQuestionCount !== null && item.targetQuestionCount <= 10)).toBe(true)
    expect(result?.items.some((item) => item.taskType === 'fsrs_review')).toBe(false)
    expect(result?.items.every((item, index) => item.position === index + 1)).toBe(true)
  })

  it('never exceeds the daily minute limit and refuses non-Monday weeks', () => {
    const outcomes = Array.from({ length: 9 }, (_, index) => (
      assessment(`MAT-${index + 1}`, index < 4 ? 'developing' : 'insufficient', index < 4 ? 40 + index : null, 5)
    ))
    const result = generateInstitutionStudyProgramDraft(analysis(outcomes), {
      weekStart: '2026-08-17', dailyMinuteLimit: 25, generatedAt: '2026-08-14T00:00:00.000Z',
    })
    const daily = new Map<string, number>()
    for (const item of result!.items) {
      daily.set(item.scheduledDate, (daily.get(item.scheduledDate) ?? 0) + item.durationMinutes)
    }
    expect([...daily.values()].every((minutes) => minutes <= 25)).toBe(true)
    expect(generateInstitutionStudyProgramDraft(analysis(outcomes), {
      weekStart: '2026-08-18', dailyMinuteLimit: 25, generatedAt: '2026-08-14T00:00:00.000Z',
    })).toBeNull()
  })

  it('translates diagnostic gaps into verified baseline work outside the supported taxonomy', () => {
    const upgraded = analysis([assessment('MAT-V2-01', 'insufficient', null, 1)])
    upgraded.scope.taxonomyVersion = 'ba-tyt-math-v2'
    upgraded.outcomes = upgraded.outcomes.map((outcome) => ({
      ...outcome,
      nodeCode: outcome.nodeCode.replace('ba-tyt-math-v1', 'ba-tyt-math-v2'),
      assessment: {
        ...outcome.assessment,
        evidence: { ...outcome.assessment.evidence, taxonomyVersion: 'ba-tyt-math-v2' },
      },
    }))
    const result = generateInstitutionStudyProgramDraft(upgraded, {
      weekStart: '2026-08-17', dailyMinuteLimit: 25, generatedAt: '2026-08-14T00:00:00.000Z',
    })
    expect(result?.items).toEqual([
      expect.objectContaining({
        taskType: 'verified_questions', reasonCode: 'current_target', outcomeCode: 'MAT-V2-01',
      }),
    ])
  })

  it('does not prescribe a repeated diagnostic after a verified diagnostic source exists', () => {
    const outcome = assessment('MAT-01', 'insufficient', null, 1, [{
      outcomeCode: 'MAT-01',
      completedSessionId: '22222222-2222-4222-8222-222222222222',
      completedAt: '2026-08-12T09:00:00.000Z',
      attempts: 2,
      correctAttempts: 1,
      score: 50,
      taxonomyVersion: 'ba-tyt-math-v1',
    }])
    const result = generateInstitutionStudyProgramDraft(analysis([outcome]), {
      weekStart: '2026-08-17', dailyMinuteLimit: 25, generatedAt: '2026-08-14T00:00:00.000Z',
    })
    expect(result?.items).toEqual([
      expect.objectContaining({
        taskType: 'verified_questions', reasonCode: 'current_target', outcomeCode: 'MAT-01',
      }),
    ])
  })

  it('assigns at most one full-scope diagnostic per weekly program', () => {
    const result = generateInstitutionStudyProgramDraft(analysis([
      assessment('MAT-01', 'insufficient', null, 2),
      assessment('MAT-02', 'insufficient', null, 1),
      assessment('MAT-03', 'insufficient', null, 0),
    ]), {
      weekStart: '2026-08-17', dailyMinuteLimit: 25, generatedAt: '2026-08-14T00:00:00.000Z',
    })

    expect(result?.items.filter((item) => item.taskType === 'diagnostic')).toHaveLength(1)
    expect(result?.items.map((item) => item.taskType)).toEqual([
      'diagnostic', 'verified_questions', 'verified_questions',
    ])
  })

  it('returns no definitive plan when no curriculum outcomes are available', () => {
    expect(generateInstitutionStudyProgramDraft(analysis([]), {
      weekStart: '2026-08-17', dailyMinuteLimit: 45, generatedAt: '2026-08-14T00:00:00.000Z',
    })).toBeNull()
  })
})
