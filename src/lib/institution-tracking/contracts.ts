import { z } from 'zod'

const timestampSchema = z.string().datetime({ offset: true })
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}, 'invalid calendar date')
const nonNegativeIntegerSchema = z.number().int().nonnegative()
const percentageSchema = z.number().min(0).max(100)

export const statisticEvidenceSchema = z.object({
  evidenceCount: nonNegativeIntegerSchema,
  independentEvidenceCount: nonNegativeIntegerSchema,
  firstEvidenceAt: timestampSchema.nullable(),
  lastEvidenceAt: timestampSchema.nullable(),
  windowStart: timestampSchema,
  windowEnd: timestampSchema,
  modelVersion: z.string().trim().min(1).max(80),
  taxonomyVersion: z.string().trim().min(1).max(80).nullable(),
  coverageSupported: z.boolean(),
}).strict().superRefine((value, context) => {
  const start = Date.parse(value.windowStart)
  const end = Date.parse(value.windowEnd)
  if (start >= end) {
    context.addIssue({ code: 'custom', message: 'statistic window must be increasing' })
  }
  if (value.independentEvidenceCount > value.evidenceCount) {
    context.addIssue({ code: 'custom', message: 'independent evidence exceeds evidence count' })
  }
  if ((value.firstEvidenceAt === null) !== (value.lastEvidenceAt === null)) {
    context.addIssue({ code: 'custom', message: 'evidence timestamps must both be present or absent' })
  }
  if (value.evidenceCount === 0 && value.firstEvidenceAt !== null) {
    context.addIssue({ code: 'custom', message: 'empty evidence cannot have timestamps' })
  }
  if (value.evidenceCount > 0 && value.firstEvidenceAt === null) {
    context.addIssue({ code: 'custom', message: 'non-empty evidence requires timestamps' })
  }
  if (value.firstEvidenceAt !== null && value.lastEvidenceAt !== null) {
    const first = Date.parse(value.firstEvidenceAt)
    const last = Date.parse(value.lastEvidenceAt)
    if (first > last || first < start || last >= end) {
      context.addIssue({ code: 'custom', message: 'evidence timestamps must stay inside the half-open window' })
    }
  }
})

export const studentOutcomeAssessmentSchema = z.object({
  outcomeCode: z.string().trim().min(1).max(120),
  status: z.enum(['insufficient', 'developing', 'mastered']),
  score: percentageSchema.nullable(),
  confidence: z.enum(['insufficient', 'low', 'medium', 'high']),
  evidence: statisticEvidenceSchema,
}).strict().superRefine((value, context) => {
  const insufficient = value.status === 'insufficient'
  if (insufficient !== (value.score === null)) {
    context.addIssue({ code: 'custom', message: 'insufficient assessment must not expose a numeric score' })
  }
  if (insufficient !== (value.confidence === 'insufficient')) {
    context.addIssue({ code: 'custom', message: 'insufficient status and confidence must agree' })
  }
  if (!value.evidence.coverageSupported && !insufficient) {
    context.addIssue({ code: 'custom', message: 'unsupported coverage cannot produce a decision' })
  }
})

export const aggregateEvidenceSchema = z.object({
  eligibleStudentCount: nonNegativeIntegerSchema,
  excludedInsufficientCount: nonNegativeIntegerSchema,
  outcomeCount: nonNegativeIntegerSchema,
  baselineAvailableCount: nonNegativeIntegerSchema,
  activeStudyCount: nonNegativeIntegerSchema,
  modelVersion: z.string().trim().min(1).max(80),
  taxonomyVersion: z.string().trim().min(1).max(80).nullable(),
  windowStart: timestampSchema,
  windowEnd: timestampSchema,
}).strict().superRefine((value, context) => {
  if (Date.parse(value.windowStart) >= Date.parse(value.windowEnd)) {
    context.addIssue({ code: 'custom', message: 'aggregate window must be increasing' })
  }
  if (value.baselineAvailableCount > value.eligibleStudentCount) {
    context.addIssue({ code: 'custom', message: 'baseline count exceeds eligible students' })
  }
  if (value.activeStudyCount > value.eligibleStudentCount) {
    context.addIssue({ code: 'custom', message: 'active study count exceeds eligible students' })
  }
})

const programItemSchema = z.object({
  position: z.number().int().min(1).max(21),
  scheduledDate: dateSchema,
  taskType: z.enum(['verified_questions', 'fsrs_review', 'diagnostic', 'paper_pack']),
  title: z.string().trim().min(2).max(120),
  reasonCode: z.enum(['weak_outcome', 'due_review', 'diagnostic_gap', 'current_target', 'challenge']),
  outcomeCode: z.string().trim().min(1).max(120).nullable(),
  durationMinutes: z.number().int().min(5).max(60),
  targetQuestionCount: z.number().int().min(1).max(50).nullable(),
}).strict().superRefine((value, context) => {
  if (value.taskType === 'verified_questions' && value.targetQuestionCount === null) {
    context.addIssue({ code: 'custom', message: 'question task requires a target count' })
  }
  if (value.reasonCode === 'weak_outcome' && value.outcomeCode === null) {
    context.addIssue({ code: 'custom', message: 'weak outcome task requires an outcome code' })
  }
})

export const weeklyStudyProgramDraftSchema = z.object({
  status: z.literal('draft'),
  weekStart: dateSchema,
  modelVersion: z.string().trim().min(1).max(80),
  generatedAt: timestampSchema,
  dailyMinuteLimit: z.number().int().min(10).max(180),
  items: z.array(programItemSchema).min(1).max(21),
}).strict().superRefine((value, context) => {
  const positions = [...value.items].map((item) => item.position).sort((left, right) => left - right)
  if (positions.some((position, index) => position !== index + 1)) {
    context.addIssue({ code: 'custom', message: 'program positions must be unique and contiguous' })
  }
  const weekStartDay = Math.trunc(Date.parse(`${value.weekStart}T00:00:00.000Z`) / 86_400_000)
  const daily = new Map<string, { count: number; minutes: number }>()
  for (const item of value.items) {
    const itemDay = Math.trunc(Date.parse(`${item.scheduledDate}T00:00:00.000Z`) / 86_400_000)
    if (itemDay < weekStartDay || itemDay >= weekStartDay + 7) {
      context.addIssue({ code: 'custom', message: 'program item must stay inside its week' })
    }
    const current = daily.get(item.scheduledDate) ?? { count: 0, minutes: 0 }
    current.count += 1
    current.minutes += item.durationMinutes
    daily.set(item.scheduledDate, current)
  }
  for (const summary of daily.values()) {
    if (summary.count > 3) {
      context.addIssue({ code: 'custom', message: 'a day cannot contain more than three tasks' })
    }
    if (summary.minutes > value.dailyMinuteLimit) {
      context.addIssue({ code: 'custom', message: 'daily duration exceeds the learner limit' })
    }
  }
})

const teacherIndicatorSchema = z.object({
  status: z.enum(['insufficient', 'available']),
  value: percentageSchema.nullable(),
  eligibleStudentCount: nonNegativeIntegerSchema,
  excludedInsufficientCount: nonNegativeIntegerSchema,
  evidence: z.array(z.object({
    code: z.string().trim().min(1).max(80),
    numerator: nonNegativeIntegerSchema,
    denominator: nonNegativeIntegerSchema,
  }).strict()).max(12),
}).strict().superRefine((value, context) => {
  if ((value.status === 'insufficient') !== (value.value === null)) {
    context.addIssue({ code: 'custom', message: 'insufficient indicator must not expose a value' })
  }
  if (value.evidence.some((item) => item.numerator > item.denominator)) {
    context.addIssue({ code: 'custom', message: 'indicator numerator exceeds denominator' })
  }
})

export const teacherIndicatorSetSchema = z.object({
  modelVersion: z.string().trim().min(1).max(80),
  windowStart: timestampSchema,
  windowEnd: timestampSchema,
  dimensions: z.object({
    studentGrowth: teacherIndicatorSchema,
    followUpDiscipline: teacherIndicatorSchema,
    programManagement: teacherIndicatorSchema,
    interventionResponsiveness: teacherIndicatorSchema,
    dataReliability: teacherIndicatorSchema,
  }).strict(),
}).strict().superRefine((value, context) => {
  if (Date.parse(value.windowStart) >= Date.parse(value.windowEnd)) {
    context.addIssue({ code: 'custom', message: 'teacher indicator window must be increasing' })
  }
})

export type StatisticEvidence = z.infer<typeof statisticEvidenceSchema>
export type StudentOutcomeAssessment = z.infer<typeof studentOutcomeAssessmentSchema>
export type AggregateEvidence = z.infer<typeof aggregateEvidenceSchema>
export type WeeklyStudyProgramDraft = z.infer<typeof weeklyStudyProgramDraftSchema>
export type TeacherIndicatorSet = z.infer<typeof teacherIndicatorSetSchema>
