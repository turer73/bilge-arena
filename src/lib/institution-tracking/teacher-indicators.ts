import { z } from 'zod'
import { teacherIndicatorSetSchema, type TeacherIndicatorSet } from './contracts'
import {
  TEACHER_GROWTH_MIN_ELIGIBLE_STUDENTS,
  TEACHER_GROWTH_MIN_WINDOW_DAYS,
  TEACHER_PROCESS_MIN_OBSERVATIONS,
} from './teacher-indicator-policy'

const timestampSchema = z.string().datetime({ offset: true })
const countSchema = z.number().int().nonnegative()
const DAY_MS = 86_400_000

const dimensionInputSchema = z.object({
  supported: z.boolean(),
  code: z.string().trim().min(1).max(80),
  numerator: countSchema,
  denominator: countSchema,
  eligibleStudentCount: countSchema,
  excludedInsufficientCount: countSchema,
}).strict().superRefine((value, context) => {
  if (value.numerator > value.denominator) {
    context.addIssue({ code: 'custom', message: 'teacher indicator numerator exceeds denominator' })
  }
})

export const teacherIndicatorInputSchema = z.object({
  modelVersion: z.literal('institution-teacher-indicators-v2'),
  windowStart: timestampSchema,
  windowEnd: timestampSchema,
  dimensions: z.object({
    studentGrowth: dimensionInputSchema,
    followUpDiscipline: dimensionInputSchema,
    programManagement: dimensionInputSchema,
    interventionResponsiveness: dimensionInputSchema,
    dataReliability: dimensionInputSchema,
  }).strict(),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.windowStart) >= Date.parse(value.windowEnd)) {
    context.addIssue({ code: 'custom', message: 'teacher indicator window must be increasing' })
  }
})

function buildDimension(
  value: z.infer<typeof dimensionInputSchema>,
  options: { minimumEligible: number; minimumObservations: number; windowDays?: number; minimumWindowDays?: number },
) {
  const available = value.supported
    && value.denominator >= options.minimumObservations
    && value.eligibleStudentCount >= options.minimumEligible
    && (options.minimumWindowDays === undefined || (options.windowDays ?? 0) >= options.minimumWindowDays)
  return {
    status: available ? 'available' as const : 'insufficient' as const,
    value: available ? Math.round((1000 * value.numerator) / value.denominator) / 10 : null,
    eligibleStudentCount: value.eligibleStudentCount,
    excludedInsufficientCount: value.excludedInsufficientCount,
    evidence: value.supported ? [{
      code: value.code,
      numerator: value.numerator,
      denominator: value.denominator,
    }] : [],
  }
}

export function buildTeacherIndicatorSet(value: unknown): TeacherIndicatorSet | null {
  const parsed = teacherIndicatorInputSchema.safeParse(value)
  if (!parsed.success) return null
  const windowDays = (Date.parse(parsed.data.windowEnd) - Date.parse(parsed.data.windowStart)) / DAY_MS
  const processOptions = {
    minimumEligible: TEACHER_PROCESS_MIN_OBSERVATIONS,
    minimumObservations: TEACHER_PROCESS_MIN_OBSERVATIONS,
  }
  const result = {
    modelVersion: parsed.data.modelVersion,
    windowStart: parsed.data.windowStart,
    windowEnd: parsed.data.windowEnd,
    dimensions: {
      studentGrowth: buildDimension(parsed.data.dimensions.studentGrowth, {
        minimumEligible: TEACHER_GROWTH_MIN_ELIGIBLE_STUDENTS,
        minimumObservations: TEACHER_GROWTH_MIN_ELIGIBLE_STUDENTS,
        windowDays,
        minimumWindowDays: TEACHER_GROWTH_MIN_WINDOW_DAYS,
      }),
      followUpDiscipline: buildDimension(parsed.data.dimensions.followUpDiscipline, processOptions),
      programManagement: buildDimension(parsed.data.dimensions.programManagement, processOptions),
      interventionResponsiveness: buildDimension(parsed.data.dimensions.interventionResponsiveness, processOptions),
      dataReliability: buildDimension(parsed.data.dimensions.dataReliability, processOptions),
    },
  }
  const validated = teacherIndicatorSetSchema.safeParse(result)
  return validated.success ? validated.data : null
}
