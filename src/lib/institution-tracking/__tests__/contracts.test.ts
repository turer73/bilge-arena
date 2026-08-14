import { describe, expect, it } from 'vitest'
import {
  aggregateEvidenceSchema,
  statisticEvidenceSchema,
  studentOutcomeAssessmentSchema,
  teacherIndicatorSetSchema,
  weeklyStudyProgramDraftSchema,
} from '../contracts'

const evidence = {
  evidenceCount: 5,
  independentEvidenceCount: 4,
  firstEvidenceAt: '2026-08-01T10:00:00.000Z',
  lastEvidenceAt: '2026-08-05T10:00:00.000Z',
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: '2026-08-08T00:00:00.000Z',
  modelVersion: 'institution-evidence-v1',
  taxonomyVersion: 'tyt-math-v1',
  coverageSupported: true,
}

describe('institution tracking statistical contracts', () => {
  it('requires traceable evidence inside an increasing half-open window', () => {
    expect(statisticEvidenceSchema.safeParse(evidence).success).toBe(true)
    expect(statisticEvidenceSchema.safeParse({
      ...evidence,
      independentEvidenceCount: 6,
    }).success).toBe(false)
    expect(statisticEvidenceSchema.safeParse({
      ...evidence,
      lastEvidenceAt: evidence.windowEnd,
    }).success).toBe(false)
  })

  it('represents missing evidence as insufficient instead of numeric zero', () => {
    const insufficient = {
      outcomeCode: 'TYT.MAT.SAYILAR.01',
      status: 'insufficient',
      score: null,
      confidence: 'insufficient',
      evidence: {
        ...evidence,
        evidenceCount: 0,
        independentEvidenceCount: 0,
        firstEvidenceAt: null,
        lastEvidenceAt: null,
      },
    }
    expect(studentOutcomeAssessmentSchema.safeParse(insufficient).success).toBe(true)
    expect(studentOutcomeAssessmentSchema.safeParse({ ...insufficient, score: 0 }).success).toBe(false)
    expect(studentOutcomeAssessmentSchema.safeParse({
      ...insufficient,
      status: 'developing',
      score: 0,
      confidence: 'low',
      evidence: { ...insufficient.evidence, coverageSupported: false },
    }).success).toBe(false)
  })

  it('keeps aggregate denominators and exposure counts bounded', () => {
    const aggregate = {
      eligibleStudentCount: 12,
      excludedInsufficientCount: 3,
      outcomeCount: 20,
      baselineAvailableCount: 10,
      activeStudyCount: 8,
      modelVersion: 'institution-aggregate-v1',
      taxonomyVersion: 'tyt-math-v1',
      windowStart: evidence.windowStart,
      windowEnd: evidence.windowEnd,
    }
    expect(aggregateEvidenceSchema.safeParse(aggregate).success).toBe(true)
    expect(aggregateEvidenceSchema.safeParse({
      ...aggregate,
      activeStudyCount: 13,
    }).success).toBe(false)
  })
})

describe('institution tracking decision contracts', () => {
  it('bounds weekly drafts to three tasks and the daily minute limit', () => {
    const base = {
      status: 'draft',
      weekStart: '2026-08-10',
      modelVersion: 'weekly-program-v1',
      generatedAt: '2026-08-09T10:00:00.000Z',
      dailyMinuteLimit: 45,
      items: [
        {
          position: 1,
          scheduledDate: '2026-08-10',
          taskType: 'verified_questions',
          title: 'Temel kavram soruları',
          reasonCode: 'weak_outcome',
          outcomeCode: 'TYT.MAT.SAYILAR.01',
          durationMinutes: 20,
          targetQuestionCount: 10,
        },
        {
          position: 2,
          scheduledDate: '2026-08-10',
          taskType: 'fsrs_review',
          title: 'Gecikmiş tekrarlar',
          reasonCode: 'due_review',
          outcomeCode: null,
          durationMinutes: 20,
          targetQuestionCount: null,
        },
      ],
    }
    expect(weeklyStudyProgramDraftSchema.safeParse(base).success).toBe(true)
    expect(weeklyStudyProgramDraftSchema.safeParse({
      ...base,
      items: [...base.items, { ...base.items[0], position: 3, durationMinutes: 10 }],
    }).success).toBe(false)
    expect(weeklyStudyProgramDraftSchema.safeParse({
      ...base,
      items: [{ ...base.items[0], targetQuestionCount: null }],
    }).success).toBe(false)
    expect(weeklyStudyProgramDraftSchema.safeParse({
      ...base,
      items: [{ ...base.items[0], position: 2 }],
    }).success).toBe(false)
    expect(weeklyStudyProgramDraftSchema.safeParse({
      ...base,
      items: [{ ...base.items[0], scheduledDate: '2026-08-17' }],
    }).success).toBe(false)
  })

  it('exposes five explainable teacher dimensions and rejects a ranking score', () => {
    const indicator = {
      status: 'available',
      value: 72,
      eligibleStudentCount: 25,
      excludedInsufficientCount: 4,
      evidence: [{ code: 'students_with_growth', numerator: 18, denominator: 25 }],
    }
    const set = {
      modelVersion: 'teacher-indicators-v1',
      windowStart: evidence.windowStart,
      windowEnd: evidence.windowEnd,
      dimensions: {
        studentGrowth: indicator,
        followUpDiscipline: indicator,
        programManagement: indicator,
        interventionResponsiveness: indicator,
        dataReliability: indicator,
      },
    }
    expect(teacherIndicatorSetSchema.safeParse(set).success).toBe(true)
    expect(teacherIndicatorSetSchema.safeParse({ ...set, overallScore: 72 }).success).toBe(false)
    expect(teacherIndicatorSetSchema.safeParse({
      ...set,
      dimensions: {
        ...set.dimensions,
        studentGrowth: { ...indicator, status: 'insufficient', value: 0 },
      },
    }).success).toBe(false)
  })
})
