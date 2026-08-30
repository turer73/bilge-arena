import { z } from 'zod'
import {
  weeklyStudyProgramDraftSchema,
  type WeeklyStudyProgramDraft,
} from './contracts'
import {
  institutionStudentLearningAnalysisSchema,
  type InstitutionStudentLearningAnalysis,
} from './student-analysis'
import { supportsAdaptiveDiagnosticScope } from '@/lib/diagnostic/scope'
import { GAME_SLUGS } from '@/lib/constants/games'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const timestampSchema = z.string().datetime({ offset: true })

export const institutionStudyProgramGenerationInputSchema = z.object({
  weekStart: dateSchema,
  dailyMinuteLimit: z.number().int().min(20).max(120),
  generatedAt: timestampSchema,
}).strict().superRefine((value, context) => {
  const date = new Date(`${value.weekStart}T00:00:00.000Z`)
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value.weekStart) {
    context.addIssue({ code: 'custom', message: 'invalid program week start' })
  }
  if (date.getUTCDay() !== 1) {
    context.addIssue({ code: 'custom', message: 'program week must start on Monday' })
  }
})

export const institutionStudyProgramDraftInputSchema = z.object({
  classroomId: z.string().uuid(),
  memberRef: z.string().regex(/^[0-9a-f]{32}$/),
  game: z.enum(GAME_SLUGS),
  examRef: z.string().regex(/^[A-Z0-9-]{2,10}$/),
  weekStart: dateSchema,
  dailyMinuteLimit: z.number().int().min(20).max(120),
  requestId: z.string().uuid(),
}).strict()

export const institutionStudyProgramMutationResultSchema = z.object({
  programRef: z.string().regex(/^[0-9a-f]{32}$/),
  status: z.enum(['draft', 'published']),
  weekStart: dateSchema,
  dailyMinuteLimit: z.number().int().min(20).max(120),
  modelVersion: z.literal('institution-program-v1'),
  itemCount: z.number().int().min(1).max(21),
  createdAt: timestampSchema,
  reviewedAt: timestampSchema.nullable(),
  publishedAt: timestampSchema.nullable(),
  replayed: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.status === 'draft' && (value.reviewedAt !== null || value.publishedAt !== null)) {
    context.addIssue({ code: 'custom', message: 'draft program cannot be reviewed or published' })
  }
  if (value.status === 'published' && (value.reviewedAt === null || value.publishedAt === null)) {
    context.addIssue({ code: 'custom', message: 'published program requires teacher review' })
  }
})

export const institutionStudyProgramPublishInputSchema = z.object({
  requestId: z.string().uuid(),
}).strict()

export const institutionStudyProgramUpdateInputSchema = z.object({
  weekStart: dateSchema,
  dailyMinuteLimit: z.number().int().min(20).max(120),
  items: weeklyStudyProgramDraftSchema.shape.items,
  requestId: z.string().uuid(),
}).strict().superRefine((value, context) => {
  const draft = weeklyStudyProgramDraftSchema.safeParse({
    status: 'draft', weekStart: value.weekStart, modelVersion: 'institution-program-v1',
    generatedAt: '2026-01-01T00:00:00.000Z', dailyMinuteLimit: value.dailyMinuteLimit,
    items: value.items,
  })
  if (!draft.success) context.addIssue({ code: 'custom', message: 'invalid updated study program draft' })
})

export const institutionStudyProgramDraftResponseSchema = z.object({
  program: institutionStudyProgramMutationResultSchema,
  draft: weeklyStudyProgramDraftSchema,
}).strict()

export type InstitutionStudyProgramDraftResponse = z.infer<typeof institutionStudyProgramDraftResponseSchema>

type Candidate = {
  outcomeCode: string
  title: string
  score: number | null
  evidenceCount: number
  kind: 'weak' | 'diagnostic' | 'baseline' | 'review'
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function candidates(analysis: InstitutionStudentLearningAnalysis): Candidate[] {
  const diagnosticSupported = analysis.scope.diagnosticEnabled && supportsAdaptiveDiagnosticScope({
    game: analysis.scope.game,
    examRef: analysis.scope.examRef,
    questionExamRef: analysis.scope.questionExamRef,
    taxonomyVersion: analysis.scope.taxonomyVersion,
  })
  const weak = analysis.outcomes
    .filter((outcome) => outcome.assessment.status === 'developing')
    .map((outcome) => ({
      outcomeCode: outcome.code,
      title: outcome.title,
      score: outcome.assessment.score,
      evidenceCount: outcome.assessment.evidence.evidenceCount,
      kind: 'weak' as const,
    }))
    .sort((left, right) => (left.score ?? 101) - (right.score ?? 101)
      || right.evidenceCount - left.evidenceCount
      || left.outcomeCode.localeCompare(right.outcomeCode, 'tr'))

  const diagnosticOutcomes = analysis.outcomes
    .filter((outcome) => outcome.assessment.status === 'insufficient')
    .sort((left, right) => right.assessment.evidence.evidenceCount
      - left.assessment.evidence.evidenceCount
      || left.code.localeCompare(right.code, 'tr'))
  let diagnosticAssigned = false
  const diagnostic = diagnosticOutcomes.map((outcome) => {
    const shouldAssignDiagnostic = diagnosticSupported
      && outcome.details.diagnosticSources.length === 0
      && !diagnosticAssigned
    if (shouldAssignDiagnostic) diagnosticAssigned = true
    return {
      outcomeCode: outcome.code,
      title: outcome.title,
      score: null,
      evidenceCount: outcome.assessment.evidence.evidenceCount,
      // A completed short diagnostic is a separate baseline signal, never a
      // mastery score. It samples the full released scope, so one weekly
      // diagnostic is enough; remaining gaps become verified practice work.
      kind: shouldAssignDiagnostic
        ? 'diagnostic' as const
        : 'baseline' as const,
    }
  })

  const review = analysis.outcomes
    .filter((outcome) => outcome.assessment.status === 'mastered')
    .map((outcome) => ({
      outcomeCode: outcome.code,
      title: outcome.title,
      score: outcome.assessment.score,
      evidenceCount: outcome.assessment.evidence.evidenceCount,
      kind: 'review' as const,
    }))
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0)
      || left.outcomeCode.localeCompare(right.outcomeCode, 'tr'))

  const selected = [...weak.slice(0, 4), ...diagnostic.slice(0, 3), ...review.slice(0, 2)]
  return selected.length > 0 ? selected : diagnostic.slice(0, 5)
}

function itemFor(candidate: Candidate, position: number, scheduledDate: string) {
  if (candidate.kind === 'weak') {
    return {
      position,
      scheduledDate,
      taskType: 'verified_questions' as const,
      title: `${candidate.title}: hedefli soru çalışması`,
      reasonCode: 'weak_outcome' as const,
      outcomeCode: candidate.outcomeCode,
      durationMinutes: 25,
      targetQuestionCount: 10,
    }
  }
  if (candidate.kind === 'diagnostic') {
    return {
      position,
      scheduledDate,
      taskType: 'diagnostic' as const,
      title: `${candidate.title}: kısa durum tespiti`,
      reasonCode: 'diagnostic_gap' as const,
      outcomeCode: candidate.outcomeCode,
      durationMinutes: 20,
      targetQuestionCount: 10,
    }
  }
  if (candidate.kind === 'baseline') {
    return {
      position,
      scheduledDate,
      taskType: 'verified_questions' as const,
      title: `${candidate.title}: başlangıç soru çalışması`,
      reasonCode: 'current_target' as const,
      outcomeCode: candidate.outcomeCode,
      durationMinutes: 20,
      targetQuestionCount: 10,
    }
  }
  return {
    position,
    scheduledDate,
    // A mastered outcome still benefits from reinforcement, but the product
    // has no immutable due/FSRS snapshot bound to an institution assignment.
    // Keep the task honest and completable through verified practice evidence.
    taskType: 'verified_questions' as const,
    title: `${candidate.title}: doğrulanmış pekiştirme çalışması`,
    reasonCode: 'current_target' as const,
    outcomeCode: candidate.outcomeCode,
    durationMinutes: 15,
    targetQuestionCount: 10,
  }
}

export function generateInstitutionStudyProgramDraft(
  analysisValue: unknown,
  inputValue: unknown,
): WeeklyStudyProgramDraft | null {
  const analysis = institutionStudentLearningAnalysisSchema.safeParse(analysisValue)
  const input = institutionStudyProgramGenerationInputSchema.safeParse(inputValue)
  if (!analysis.success || !input.success) return null

  const selected = candidates(analysis.data)
  if (selected.length === 0) return null

  const dailyMinutes = new Map<number, number>()
  const items = selected.flatMap((candidate) => {
    const duration = candidate.kind === 'weak' ? 25 : candidate.kind === 'review' ? 15 : 20
    for (let day = 0; day < 7; day += 1) {
      const used = dailyMinutes.get(day) ?? 0
      if (used + duration <= input.data.dailyMinuteLimit) {
        dailyMinutes.set(day, used + duration)
        return [itemFor(candidate, 0, addDays(input.data.weekStart, day))]
      }
    }
    return []
  }).map((item, index) => ({ ...item, position: index + 1 }))

  if (items.length === 0) return null
  const draft = {
    status: 'draft' as const,
    weekStart: input.data.weekStart,
    modelVersion: 'institution-program-v1',
    generatedAt: input.data.generatedAt,
    dailyMinuteLimit: input.data.dailyMinuteLimit,
    items,
  }
  const validated = weeklyStudyProgramDraftSchema.safeParse(draft)
  return validated.success ? validated.data : null
}
