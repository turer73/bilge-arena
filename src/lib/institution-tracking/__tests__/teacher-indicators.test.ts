import { describe, expect, it } from 'vitest'
import { buildTeacherIndicatorSet } from '../teacher-indicators'

const dimension = (overrides: Record<string, unknown> = {}) => ({
  supported: true,
  code: 'reviewed_program_coverage',
  numerator: 7,
  denominator: 10,
  eligibleStudentCount: 10,
  excludedInsufficientCount: 2,
  ...overrides,
})

const input = {
  modelVersion: 'institution-teacher-indicators-v1',
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: '2026-08-14T00:00:00.000Z',
  dimensions: {
    studentGrowth: dimension({ code: 'improved_students' }),
    followUpDiscipline: dimension({ code: 'reviewed_followups' }),
    programManagement: dimension(),
    interventionResponsiveness: dimension({ code: 'timely_interventions' }),
    dataReliability: dimension({ code: 'decision_safe_records', numerator: 10 }),
  },
} as const

describe('teacher indicator set', () => {
  it('returns separate explained dimensions instead of a composite teacher score', () => {
    const result = buildTeacherIndicatorSet(input)
    expect(result?.dimensions.programManagement).toEqual({
      status: 'available', value: 70, eligibleStudentCount: 10, excludedInsufficientCount: 2,
      evidence: [{ code: 'reviewed_program_coverage', numerator: 7, denominator: 10 }],
    })
    expect(result?.dimensions.dataReliability.value).toBe(100)
    expect(result).not.toHaveProperty('score')
    expect(result).not.toHaveProperty('rank')
  })

  it('withholds percentages for fewer than three students or observations', () => {
    const result = buildTeacherIndicatorSet({
      ...input,
      dimensions: {
        ...input.dimensions,
        studentGrowth: dimension({ numerator: 2, denominator: 2, eligibleStudentCount: 2 }),
        programManagement: dimension({ numerator: 1, denominator: 2, eligibleStudentCount: 10 }),
      },
    })
    expect(result?.dimensions.studentGrowth).toMatchObject({ status: 'insufficient', value: null })
    expect(result?.dimensions.programManagement).toMatchObject({ status: 'insufficient', value: null })
  })

  it('keeps unsupported source dimensions visibly insufficient without fabricated evidence', () => {
    const result = buildTeacherIndicatorSet({
      ...input,
      dimensions: {
        ...input.dimensions,
        followUpDiscipline: dimension({ supported: false, numerator: 0, denominator: 0, eligibleStudentCount: 10 }),
        interventionResponsiveness: dimension({ supported: false, numerator: 0, denominator: 0, eligibleStudentCount: 10 }),
      },
    })
    expect(result?.dimensions.followUpDiscipline).toEqual({
      status: 'insufficient', value: null, eligibleStudentCount: 10,
      excludedInsufficientCount: 2, evidence: [],
    })
    expect(result?.dimensions.interventionResponsiveness.evidence).toEqual([])
  })

  it('rejects invalid windows and impossible numerators', () => {
    expect(buildTeacherIndicatorSet({ ...input, windowEnd: input.windowStart })).toBeNull()
    expect(buildTeacherIndicatorSet({
      ...input,
      dimensions: { ...input.dimensions, programManagement: dimension({ numerator: 11 }) },
    })).toBeNull()
  })
})
