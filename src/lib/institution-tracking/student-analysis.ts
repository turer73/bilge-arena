import { z } from 'zod'
import { summarizeMasteryEvidenceV2 } from '@/lib/mastery/evidence-v2'
import { studentOutcomeAssessmentSchema } from './contracts'
import type { InstitutionLearningScope } from './scope'

const timestampSchema = z.string().datetime({ offset: true })
const countSchema = z.number().int().nonnegative()
const amountSchema = z.number().nonnegative()
const memberRefSchema = z.string().regex(/^[0-9a-f]{32}$/)
export const institutionTaxonomyVersionSchema = z.string().trim().min(1).max(80)
  .regex(/^ba-[a-z0-9-]+-v[0-9]+$/)

const rawOutcomeSchema = z.object({
  code: z.string().trim().min(1).max(120),
  nodeCode: z.string().trim().min(1).max(120),
  path: z.array(z.string().trim().min(1).max(200)).length(4),
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120),
  attempts: countSchema,
  correctAttempts: countSchema,
  independentAttempts: countSchema,
  weightedEarned: amountSchema,
  weightedPossible: amountSchema,
  delayedCorrect: countSchema,
  difficultyWeightedEarned: amountSchema,
  difficultyWeightedPossible: amountSchema,
  timedAttempts: countSchema,
  totalTimeSec: amountSchema,
  fastWrong: countSchema,
  hintedAttempts: countSchema,
  hintStageSum: countSchema,
  guessAnnotations: countSchema,
  carelessAnnotations: countSchema,
  firstEvidenceAt: timestampSchema.nullable(),
  lastEvidenceAt: timestampSchema.nullable(),
}).strict().superRefine((value, context) => {
  if (
    value.correctAttempts > value.attempts
    || value.independentAttempts > value.attempts
    || value.delayedCorrect > value.correctAttempts
    || value.weightedEarned > value.weightedPossible
    || value.difficultyWeightedEarned > value.difficultyWeightedPossible
    || value.timedAttempts > value.attempts
    || value.fastWrong > value.attempts
    || value.hintedAttempts > value.attempts
    || value.hintStageSum > value.hintedAttempts * 4
    || value.guessAnnotations > value.attempts
    || value.carelessAnnotations > value.attempts
  ) {
    context.addIssue({ code: 'custom', message: 'outcome evidence bounds mismatch' })
  }
  const noEvidence = value.attempts === 0
  if (noEvidence !== (value.firstEvidenceAt === null && value.lastEvidenceAt === null)) {
    context.addIssue({ code: 'custom', message: 'outcome evidence timestamps mismatch' })
  }
  if (value.firstEvidenceAt && value.lastEvidenceAt
    && Date.parse(value.firstEvidenceAt) > Date.parse(value.lastEvidenceAt)) {
    context.addIssue({ code: 'custom', message: 'outcome evidence time order mismatch' })
  }
})

const diagnosticSourceSchema = z.object({
  outcomeCode: z.string().trim().min(1).max(120),
  completedSessionId: z.string().uuid(),
  completedAt: timestampSchema,
  attempts: countSchema,
  correctAttempts: countSchema,
  score: z.number().min(0).max(100),
  taxonomyVersion: institutionTaxonomyVersionSchema,
}).strict().superRefine((value, context) => {
  if (value.correctAttempts > value.attempts || value.attempts === 0) {
    context.addIssue({ code: 'custom', message: 'diagnostic source bounds mismatch' })
  }
})

export const institutionStudentAnalysisRpcSchema = z.object({
  classroom: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(2).max(60),
  }).strict(),
  student: z.object({
    memberRef: memberRefSchema,
    alias: z.string().trim().min(1).max(80),
    joinedAt: timestampSchema,
  }).strict(),
  scope: z.object({
    game: z.enum(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal']),
    examRef: z.string().regex(/^[A-Z0-9-]{2,10}$/),
    questionExamRef: z.string().regex(/^[A-Z0-9-]{2,10}$/).nullable().default(null),
    taxonomyVersion: institutionTaxonomyVersionSchema,
    diagnosticEnabled: z.boolean().default(false),
    institutionReportingEnabled: z.literal(true).default(true),
    scopePolicyVersion: z.string().regex(/^institution-scope-v[0-9]+$/).default('institution-scope-v1'),
    modelVersion: z.enum(['institution-evidence-v1', 'institution-evidence-v2']),
    windowStart: timestampSchema,
    windowEnd: timestampSchema,
  }).strict(),
  coverage: z.object({
    supported: z.literal(true),
    totalQuestions: countSchema,
    mappedQuestions: countSchema,
    percentage: z.literal(100),
  }).strict(),
  outcomes: z.array(rawOutcomeSchema).max(1_000),
  diagnosticSources: z.array(diagnosticSourceSchema).max(1_000).default([]),
}).strict().superRefine((value, context) => {
  if (value.student.joinedAt !== value.scope.windowStart
    || Date.parse(value.scope.windowStart) >= Date.parse(value.scope.windowEnd)
    || value.coverage.totalQuestions <= 0
    || value.coverage.mappedQuestions !== value.coverage.totalQuestions
    || new Set(value.outcomes.map((outcome) => outcome.code)).size !== value.outcomes.length
    || value.outcomes.some((outcome) => (
      outcome.firstEvidenceAt !== null
      && (Date.parse(outcome.firstEvidenceAt) < Date.parse(value.scope.windowStart)
        || Date.parse(outcome.lastEvidenceAt!) >= Date.parse(value.scope.windowEnd))
    ))) {
    context.addIssue({ code: 'custom', message: 'student analysis response mismatch' })
  }
  if (value.diagnosticSources.some((source) => (
    !value.outcomes.some((outcome) => outcome.code === source.outcomeCode)
    || source.taxonomyVersion !== value.scope.taxonomyVersion
    || Date.parse(source.completedAt) < Date.parse(value.scope.windowStart)
    || Date.parse(source.completedAt) >= Date.parse(value.scope.windowEnd)
  ))) {
    context.addIssue({ code: 'custom', message: 'diagnostic source scope mismatch' })
  }
})

const evidenceDetailsSchema = z.object({
  correctEvidenceCount: countSchema,
  delayedCorrectCount: countSchema,
  rawAccuracy: z.number().min(0).max(100),
  difficultyAccuracy: z.number().min(0).max(100),
  hintRate: z.number().min(0).max(100),
  fastWrongRate: z.number().min(0).max(100),
  components: z.object({
    accuracy: z.number().min(0).max(100),
    delayedRetrieval: z.number().min(0).max(100),
    independence: z.number().min(0).max(100),
    selfRegulation: z.number().min(0).max(100),
  }).strict(),
  // Existing stored reports and synthetic consumers predate the separate
  // diagnostic signal. Treat absence as no diagnostic, never as malformed
  // mastery evidence; live RPC payloads are still validated strictly above.
  diagnosticSources: z.array(diagnosticSourceSchema).default([]),
}).strict()

export const institutionStudentLearningAnalysisSchema = z.object({
  classroom: institutionStudentAnalysisRpcSchema.shape.classroom,
  student: institutionStudentAnalysisRpcSchema.shape.student,
  scope: institutionStudentAnalysisRpcSchema.shape.scope,
  coverage: institutionStudentAnalysisRpcSchema.shape.coverage,
  summary: z.object({
    outcomeCount: countSchema,
    assessedOutcomeCount: countSchema,
    insufficientOutcomeCount: countSchema,
    developingOutcomeCount: countSchema,
    masteredOutcomeCount: countSchema,
  }).strict(),
  outcomes: z.array(z.object({
    code: rawOutcomeSchema.shape.code,
    nodeCode: rawOutcomeSchema.shape.nodeCode,
    path: rawOutcomeSchema.shape.path,
    title: rawOutcomeSchema.shape.title,
    category: rawOutcomeSchema.shape.category,
    assessment: studentOutcomeAssessmentSchema,
    details: evidenceDetailsSchema,
  }).strict()).max(1_000),
}).strict().superRefine((value, context) => {
  const counts = value.outcomes.reduce((result, outcome) => {
    result[outcome.assessment.status] += 1
    return result
  }, { insufficient: 0, developing: 0, mastered: 0 })
  if (
    value.summary.outcomeCount !== value.outcomes.length
    || value.summary.insufficientOutcomeCount !== counts.insufficient
    || value.summary.developingOutcomeCount !== counts.developing
    || value.summary.masteredOutcomeCount !== counts.mastered
    || value.summary.assessedOutcomeCount !== counts.developing + counts.mastered
    || value.outcomes.some((outcome) => (
      outcome.assessment.evidence.taxonomyVersion !== value.scope.taxonomyVersion
    ))
  ) context.addIssue({ code: 'custom', message: 'student analysis summary mismatch' })
})

function confidence(evidenceCount: number, independentCount: number, delayedCorrect: number) {
  if (evidenceCount < 3 || independentCount < 2) return 'insufficient' as const
  if (evidenceCount < 5 || independentCount < 3) return 'low' as const
  if (evidenceCount < 10 || independentCount < 5 || delayedCorrect < 1) return 'medium' as const
  return 'high' as const
}

export function buildInstitutionStudentLearningAnalysis(value: unknown) {
  const parsed = institutionStudentAnalysisRpcSchema.safeParse(value)
  if (!parsed.success) return null

  const outcomes = parsed.data.outcomes.map((outcome) => {
    const summarized = summarizeMasteryEvidenceV2({
      attempts: outcome.attempts,
      correctAttempts: outcome.correctAttempts,
      weightedEarned: outcome.weightedEarned,
      weightedPossible: outcome.weightedPossible,
      delayedCorrect: outcome.delayedCorrect,
      v2Attempts: outcome.attempts,
      difficultyWeightedEarned: outcome.difficultyWeightedEarned,
      difficultyWeightedPossible: outcome.difficultyWeightedPossible,
      timedAttempts: outcome.timedAttempts,
      totalTimeSec: outcome.totalTimeSec,
      fastWrong: outcome.fastWrong,
      hintedAttempts: outcome.hintedAttempts,
      hintStageSum: outcome.hintStageSum,
      guessAnnotations: outcome.guessAnnotations,
      carelessAnnotations: outcome.carelessAnnotations,
    })
    const confidenceLevel = confidence(
      outcome.attempts,
      outcome.independentAttempts,
      outcome.delayedCorrect,
    )
    const status = confidenceLevel === 'insufficient'
      ? 'insufficient'
      : (confidenceLevel === 'low' && summarized.status === 'mastered' ? 'developing' : summarized.status)
    return {
      code: outcome.code,
      nodeCode: outcome.nodeCode,
      path: outcome.path,
      title: outcome.title,
      category: outcome.category,
      assessment: {
        outcomeCode: outcome.code,
        status,
        score: status === 'insufficient' ? null : summarized.score,
        confidence: confidenceLevel,
        evidence: {
          evidenceCount: outcome.attempts,
          independentEvidenceCount: outcome.independentAttempts,
          firstEvidenceAt: outcome.firstEvidenceAt,
          lastEvidenceAt: outcome.lastEvidenceAt,
          windowStart: parsed.data.scope.windowStart,
          windowEnd: parsed.data.scope.windowEnd,
          modelVersion: parsed.data.scope.modelVersion,
          taxonomyVersion: parsed.data.scope.taxonomyVersion,
          coverageSupported: true,
        },
      },
      details: {
        correctEvidenceCount: outcome.correctAttempts,
        delayedCorrectCount: outcome.delayedCorrect,
        rawAccuracy: summarized.rawAccuracy,
        difficultyAccuracy: summarized.difficultyAccuracy,
        hintRate: summarized.hintRate,
        fastWrongRate: summarized.fastWrongRate,
        components: summarized.components,
        diagnosticSources: parsed.data.diagnosticSources.filter(
          (source) => source.outcomeCode === outcome.code,
        ),
      },
    }
  })
  const counts = outcomes.reduce((result, outcome) => {
    result[outcome.assessment.status] += 1
    return result
  }, { insufficient: 0, developing: 0, mastered: 0 })
  const response = {
    classroom: parsed.data.classroom,
    student: parsed.data.student,
    scope: parsed.data.scope,
    coverage: parsed.data.coverage,
    summary: {
      outcomeCount: outcomes.length,
      assessedOutcomeCount: counts.developing + counts.mastered,
      insufficientOutcomeCount: counts.insufficient,
      developingOutcomeCount: counts.developing,
      masteredOutcomeCount: counts.mastered,
    },
    outcomes,
  }
  const validated = institutionStudentLearningAnalysisSchema.safeParse(response)
  return validated.success ? validated.data : null
}

/**
 * The diagnostic source is authorized by a separate RPC. Keep it separate
 * from ordinary practice evidence, then require it to satisfy the same exact
 * classroom-window, taxonomy and outcome checks as the core payload.
 */
export function withInstitutionDiagnosticSources(
  analysis: unknown,
  diagnosticResponse: unknown,
): unknown {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return analysis
  if (!diagnosticResponse || typeof diagnosticResponse !== 'object' || Array.isArray(diagnosticResponse)) {
    return { ...(analysis as Record<string, unknown>), diagnosticSources: null }
  }
  const parsed = z.array(diagnosticSourceSchema).max(1_000).safeParse(
    (diagnosticResponse as Record<string, unknown>).sources,
  )
  if (!parsed.success) return { ...(analysis as Record<string, unknown>), diagnosticSources: null }
  return { ...(analysis as Record<string, unknown>), diagnosticSources: parsed.data }
}

/**
 * The deploy-before-migration Math RPC predates the explicit institution
 * capability fields. Fill only those new fields after first proving that the
 * legacy payload names the exact released scope; this is not a generic
 * coercion path for another subject.
 */
export function completeLegacyInstitutionAnalysisScope(
  value: unknown,
  releasedScope: InstitutionLearningScope,
): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const raw = value as Record<string, unknown>
  if (!raw.scope || typeof raw.scope !== 'object' || Array.isArray(raw.scope)) return value
  const scope = raw.scope as Record<string, unknown>
  if (
    scope.game !== releasedScope.game
    || scope.examRef !== releasedScope.displayExamRef
    || scope.taxonomyVersion !== releasedScope.taxonomyVersion
  ) return value
  return {
    ...raw,
    scope: {
      ...scope,
      questionExamRef: releasedScope.questionExamRef,
      diagnosticEnabled: releasedScope.diagnosticEnabled,
      institutionReportingEnabled: true,
      scopePolicyVersion: releasedScope.scopePolicyVersion,
      modelVersion: 'institution-evidence-v1',
    },
  }
}

export type InstitutionStudentLearningAnalysis = z.infer<typeof institutionStudentLearningAnalysisSchema>
