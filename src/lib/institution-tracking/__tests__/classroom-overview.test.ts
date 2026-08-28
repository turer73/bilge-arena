import { describe, expect, it } from 'vitest'
import { buildInstitutionClassroomOverview } from '../classroom-overview'

const CLASSROOM_ID = '11111111-1111-4111-8111-111111111111'
function analysis(index: number, status: 'insufficient' | 'developing' | 'mastered', score: number | null, taxonomyVersion = 'ba-tyt-math-v1') {
  const evidenceCount = status === 'insufficient' ? 0 : 6
  return {
    classroom: { id: CLASSROOM_ID, name: 'TYT A Sınıfı' },
    student: { memberRef: index.toString(16).padStart(32, '0'), alias: `Öğrenci ${index}`, joinedAt: '2026-08-01T09:00:00.000Z' },
    scope: { game: 'matematik', examRef: 'TYT', taxonomyVersion, modelVersion: 'institution-evidence-v1', windowStart: '2026-08-01T09:00:00.000Z', windowEnd: '2026-08-14T09:00:00.000Z' },
    coverage: { supported: true, totalQuestions: 120, mappedQuestions: 120, percentage: 100 },
    summary: { outcomeCount: 1, assessedOutcomeCount: status === 'insufficient' ? 0 : 1, insufficientOutcomeCount: status === 'insufficient' ? 1 : 0, developingOutcomeCount: status === 'developing' ? 1 : 0, masteredOutcomeCount: status === 'mastered' ? 1 : 0 },
    outcomes: [{
      code: 'MAT-01', nodeCode: 'node-1', path: ['TYT Matematik', 'Sayılar', 'Temel', 'Kavram'], title: 'Temel Kavramlar', category: 'sayilar',
      assessment: { outcomeCode: 'MAT-01', status, score, confidence: status === 'insufficient' ? 'insufficient' : 'medium', evidence: { evidenceCount, independentEvidenceCount: status === 'insufficient' ? 0 : 3, firstEvidenceAt: evidenceCount ? '2026-08-02T10:00:00.000Z' : null, lastEvidenceAt: evidenceCount ? '2026-08-12T10:00:00.000Z' : null, windowStart: '2026-08-01T09:00:00.000Z', windowEnd: '2026-08-14T09:00:00.000Z', modelVersion: 'institution-evidence-v1', taxonomyVersion, coverageSupported: true } },
      details: { correctEvidenceCount: score ? 4 : 0, delayedCorrectCount: 1, rawAccuracy: score ?? 0, difficultyAccuracy: score ?? 0, hintRate: 0, fastWrongRate: 0, components: { accuracy: score ?? 0, delayedRetrieval: 50, independence: 80, selfRegulation: 80 } },
    }],
  }
}

const base = {
  classroom: { id: CLASSROOM_ID, name: 'TYT A Sınıfı', teacherAlias: 'Öğretmen Bir', activeStudentCount: 5 },
  windowStart: '2026-08-01T00:00:00.000Z', windowEnd: '2026-08-14T00:00:00.000Z',
  taxonomyVersion: 'ba-tyt-math-v1',
  analyses: [analysis(1, 'developing', 40), analysis(2, 'developing', 50), analysis(3, 'developing', 60), analysis(4, 'mastered', 88), analysis(5, 'insufficient', null)],
  publishedProgramMemberRefs: ['00000000000000000000000000000001', '00000000000000000000000000000002', '00000000000000000000000000000003'],
  followupMetrics: { followedMemberRefs: ['00000000000000000000000000000001', '00000000000000000000000000000002', '00000000000000000000000000000003'], interventionEligibleCount: 3, timelyInterventionCount: 2, interventionStudentCount: 3 },
  growthMetrics: { modelVersion: 'institution-growth-v1', baselineWindowStart: '2026-06-19T00:00:00.000Z', baselineWindowEnd: '2026-07-17T00:00:00.000Z', currentWindowStart: '2026-07-17T00:00:00.000Z', currentWindowEnd: '2026-08-14T00:00:00.000Z', eligibleStudentCount: 4, positiveGrowthStudentCount: 3, excludedInsufficientCount: 1 },
}

describe('institution classroom overview', () => {
  it('builds privacy-thresholded priorities and explained program coverage', () => {
    const result = buildInstitutionClassroomOverview(base)
    expect(result?.summary).toEqual({ activeStudentCount: 5, studentsWithDecisionSafeEvidence: 4, studentsNeedingSupport: 3, studentsWithoutDecisionSafeEvidence: 1, eligibleStudentOutcomeCount: 4, developingStudentOutcomeCount: 3, masteredStudentOutcomeCount: 1 })
    expect(result?.priorityOutcomes).toEqual([{ code: 'MAT-01', title: 'Temel Kavramlar', studentCount: 3, evidenceCount: 18, averageScore: 50 }])
    expect(result?.teacherIndicators?.modelVersion).toBe('institution-teacher-indicators-v2')
    expect(result?.teacherIndicators?.dimensions.programManagement).toMatchObject({ status: 'available', value: 100, evidence: [{ numerator: 3, denominator: 3 }] })
    expect(result?.teacherIndicators?.dimensions.followUpDiscipline).toMatchObject({ status: 'available', value: 100, evidence: [{ numerator: 3, denominator: 3 }] })
    expect(result?.teacherIndicators?.dimensions.interventionResponsiveness).toMatchObject({ status: 'available', value: 66.7, evidence: [{ numerator: 2, denominator: 3 }] })
    expect(result?.teacherIndicators?.dimensions.studentGrowth).toMatchObject({ status: 'insufficient', value: null, evidence: [{ numerator: 3, denominator: 4 }] })
  })

  it('suppresses outcome aggregates below three affected students', () => {
    const input = { ...base, classroom: { ...base.classroom, activeStudentCount: 2 }, analyses: base.analyses.slice(0, 2), publishedProgramMemberRefs: [], followupMetrics: { followedMemberRefs: [], interventionEligibleCount: 0, timelyInterventionCount: 0, interventionStudentCount: 0 }, growthMetrics: { ...base.growthMetrics, eligibleStudentCount: 2, positiveGrowthStudentCount: 1, excludedInsufficientCount: 0 } }
    const result = buildInstitutionClassroomOverview(input)
    expect(result?.priorityOutcomes).toEqual([])
    expect(result?.teacherIndicators?.dimensions.programManagement.value).toBeNull()
    expect(result?.teacherIndicators?.dimensions.dataReliability.value).toBeNull()
  })

  it('rejects missing roster rows, cross-classroom data and unknown program refs', () => {
    expect(buildInstitutionClassroomOverview({ ...base, classroom: { ...base.classroom, activeStudentCount: 6 } })).toBeNull()
    expect(buildInstitutionClassroomOverview({ ...base, analyses: [{ ...base.analyses[0], classroom: { id: '22222222-2222-4222-8222-222222222222', name: 'Başka' } }, ...base.analyses.slice(1)] })).toBeNull()
    expect(buildInstitutionClassroomOverview({ ...base, publishedProgramMemberRefs: ['f'.repeat(32)] })).toBeNull()
    expect(buildInstitutionClassroomOverview({ ...base, followupMetrics: { ...base.followupMetrics, followedMemberRefs: ['f'.repeat(32)] } })).toBeNull()
    expect(buildInstitutionClassroomOverview({ ...base, growthMetrics: { ...base.growthMetrics, excludedInsufficientCount: 0 } })).toBeNull()
  })

  it('propagates a released taxonomy upgrade and rejects mixed analysis versions', () => {
    const upgraded = {
      ...base,
      taxonomyVersion: 'ba-tyt-math-v2',
      analyses: [
        analysis(1, 'developing', 40, 'ba-tyt-math-v2'),
        analysis(2, 'developing', 50, 'ba-tyt-math-v2'),
        analysis(3, 'developing', 60, 'ba-tyt-math-v2'),
        analysis(4, 'mastered', 88, 'ba-tyt-math-v2'),
        analysis(5, 'insufficient', null, 'ba-tyt-math-v2'),
      ],
    }
    expect(buildInstitutionClassroomOverview(upgraded)?.scope.taxonomyVersion).toBe('ba-tyt-math-v2')
    expect(buildInstitutionClassroomOverview({
      ...upgraded,
      analyses: [base.analyses[0], ...upgraded.analyses.slice(1)],
    })).toBeNull()
  })
})
