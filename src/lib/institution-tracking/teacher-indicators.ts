import { z } from 'zod'
import { teacherIndicatorSetSchema, type TeacherIndicatorSet } from './contracts'

const timestampSchema = z.string().datetime({ offset: true })
const countSchema = z.number().int().nonnegative()

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
  modelVersion: z.literal('institution-teacher-indicators-v1'),
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

function buildDimension(value: z.infer<typeof dimensionInputSchema>) {
  const available = value.supported && value.denominator >= 3 && value.eligibleStudentCount >= 3
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
  const result = {
    modelVersion: parsed.data.modelVersion,
    windowStart: parsed.data.windowStart,
    windowEnd: parsed.data.windowEnd,
    dimensions: {
      studentGrowth: buildDimension(parsed.data.dimensions.studentGrowth),
      followUpDiscipline: buildDimension(parsed.data.dimensions.followUpDiscipline),
      programManagement: buildDimension(parsed.data.dimensions.programManagement),
      interventionResponsiveness: buildDimension(parsed.data.dimensions.interventionResponsiveness),
      dataReliability: buildDimension(parsed.data.dimensions.dataReliability),
    },
  }
  const validated = teacherIndicatorSetSchema.safeParse(result)
  return validated.success ? validated.data : null
}
