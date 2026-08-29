import { z } from 'zod'
import {
  institutionStudentLearningAnalysisSchema,
  institutionTaxonomyVersionSchema,
} from './student-analysis'
import { buildTeacherIndicatorSet } from './teacher-indicators'
import { teacherIndicatorSetSchema } from './contracts'
import { institutionFollowupMetricsSchema } from './followup'
import { institutionGrowthMetricsSchema } from './growth'

const memberRefSchema = z.string().regex(/^[0-9a-f]{32}$/)
const timestampSchema = z.string().datetime({ offset: true })

const inputSchema = z.object({
  classroom: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(2).max(60),
    teacherAlias: z.string().trim().min(1).max(80),
    activeStudentCount: z.number().int().min(0).max(40),
  }).strict(),
  windowStart: timestampSchema,
  windowEnd: timestampSchema,
  taxonomyVersion: institutionTaxonomyVersionSchema,
  analyses: z.array(institutionStudentLearningAnalysisSchema).max(40),
  publishedProgramMemberRefs: z.array(memberRefSchema).max(40),
  followupMetrics: institutionFollowupMetricsSchema,
  growthMetrics: institutionGrowthMetricsSchema,
}).strict().superRefine((value, context) => {
  if (Date.parse(value.windowStart) >= Date.parse(value.windowEnd)) {
    context.addIssue({ code: 'custom', message: 'classroom overview window must be increasing' })
  }
  const refs = value.analyses.map((analysis) => analysis.student.memberRef)
  if (new Set(refs).size !== refs.length || value.classroom.activeStudentCount !== value.analyses.length) {
    context.addIssue({ code: 'custom', message: 'classroom analysis roster mismatch' })
  }
  if (value.analyses.some((analysis) => analysis.classroom.id !== value.classroom.id)) {
    context.addIssue({ code: 'custom', message: 'cross-classroom analysis rejected' })
  }
  if (value.analyses.some((analysis) => analysis.scope.taxonomyVersion !== value.taxonomyVersion)) {
    context.addIssue({ code: 'custom', message: 'mixed curriculum taxonomy rejected' })
  }
  const firstScope = value.analyses[0]?.scope
  if (!firstScope || value.analyses.some((analysis) => (
    analysis.scope.game !== firstScope.game
    || analysis.scope.examRef !== firstScope.examRef
    || analysis.scope.questionExamRef !== firstScope.questionExamRef
    || analysis.scope.scopePolicyVersion !== firstScope.scopePolicyVersion
  ))) {
    context.addIssue({ code: 'custom', message: 'mixed institution learning scope rejected' })
  }
  if (new Set(value.publishedProgramMemberRefs).size !== value.publishedProgramMemberRefs.length
    || value.publishedProgramMemberRefs.some((ref) => !refs.includes(ref))) {
    context.addIssue({ code: 'custom', message: 'program roster mismatch' })
  }
  if (value.followupMetrics.followedMemberRefs.some((ref) => !refs.includes(ref))) {
    context.addIssue({ code: 'custom', message: 'follow-up roster mismatch' })
  }
  if (value.growthMetrics.currentWindowEnd !== value.windowEnd
    || value.growthMetrics.eligibleStudentCount + value.growthMetrics.excludedInsufficientCount !== refs.length) {
    context.addIssue({ code: 'custom', message: 'growth roster mismatch' })
  }
})

const countSchema = z.number().int().nonnegative()
export const institutionClassroomOverviewSchema = z.object({
  classroom: inputSchema.shape.classroom,
  scope: z.object({
    game: z.enum(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal']),
    examRef: z.string().regex(/^[A-Z0-9-]{2,10}$/),
    questionExamRef: z.string().regex(/^[A-Z0-9-]{2,10}$/).nullable().default(null),
    taxonomyVersion: institutionTaxonomyVersionSchema,
    scopePolicyVersion: z.string().regex(/^institution-scope-v[0-9]+$/).default('institution-scope-v1'),
    modelVersion: z.enum(['institution-classroom-overview-v1', 'institution-classroom-overview-v2']),
    windowStart: timestampSchema,
    windowEnd: timestampSchema,
    minimumGroupSize: z.literal(3),
  }).strict(),
  summary: z.object({
    activeStudentCount: countSchema,
    studentsWithDecisionSafeEvidence: countSchema,
    studentsNeedingSupport: countSchema,
    studentsWithoutDecisionSafeEvidence: countSchema,
    eligibleStudentOutcomeCount: countSchema,
    developingStudentOutcomeCount: countSchema,
    masteredStudentOutcomeCount: countSchema,
  }).strict(),
  priorityOutcomes: z.array(z.object({
    code: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(200),
    studentCount: z.number().int().min(3).max(40),
    evidenceCount: countSchema,
    averageScore: z.number().min(0).max(100),
  }).strict()).max(10),
  teacherIndicators: teacherIndicatorSetSchema.optional(),
}).strict().superRefine((value, context) => {
  const summary = value.summary
  if (summary.studentsWithDecisionSafeEvidence + summary.studentsWithoutDecisionSafeEvidence !== summary.activeStudentCount
    || summary.studentsNeedingSupport > summary.studentsWithDecisionSafeEvidence
    || summary.developingStudentOutcomeCount + summary.masteredStudentOutcomeCount !== summary.eligibleStudentOutcomeCount) {
    context.addIssue({ code: 'custom', message: 'classroom overview summary mismatch' })
  }
})

export function buildInstitutionClassroomOverview(value: unknown) {
  const parsed = inputSchema.safeParse(value)
  if (!parsed.success) return null
  const analyses = parsed.data.analyses
  const firstScope = analyses[0]?.scope
  if (!firstScope) return null
  const studentsWithEvidence = analyses.filter((analysis) => analysis.summary.assessedOutcomeCount > 0)
  const studentsNeedingSupport = analyses.filter((analysis) => analysis.summary.developingOutcomeCount > 0)
  const eligibleStudentOutcomeCount = analyses.reduce((sum, analysis) => sum + analysis.summary.assessedOutcomeCount, 0)
  const developingStudentOutcomeCount = analyses.reduce((sum, analysis) => sum + analysis.summary.developingOutcomeCount, 0)
  const masteredStudentOutcomeCount = analyses.reduce((sum, analysis) => sum + analysis.summary.masteredOutcomeCount, 0)

  const priorities = new Map<string, { title: string; scores: number[]; evidenceCount: number }>()
  for (const analysis of analyses) {
    for (const outcome of analysis.outcomes) {
      if (outcome.assessment.status !== 'developing' || outcome.assessment.score === null) continue
      const current = priorities.get(outcome.code) ?? { title: outcome.title, scores: [], evidenceCount: 0 }
      current.scores.push(outcome.assessment.score)
      current.evidenceCount += outcome.assessment.evidence.evidenceCount
      priorities.set(outcome.code, current)
    }
  }
  const priorityOutcomes = [...priorities.entries()]
    .filter(([, item]) => item.scores.length >= 3)
    .map(([code, item]) => ({
      code,
      title: item.title,
      studentCount: item.scores.length,
      evidenceCount: item.evidenceCount,
      averageScore: Math.round(10 * item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length) / 10,
    }))
    .sort((left, right) => left.averageScore - right.averageScore
      || right.studentCount - left.studentCount
      || left.code.localeCompare(right.code, 'tr'))
    .slice(0, 10)

  const needsRefs = new Set(studentsNeedingSupport.map((analysis) => analysis.student.memberRef))
  const publishedForNeed = parsed.data.publishedProgramMemberRefs.filter((ref) => needsRefs.has(ref)).length
  const followedForNeed = parsed.data.followupMetrics.followedMemberRefs.filter((ref) => needsRefs.has(ref)).length
  const teacherIndicators = buildTeacherIndicatorSet({
    modelVersion: 'institution-teacher-indicators-v2',
    windowStart: parsed.data.windowStart,
    windowEnd: parsed.data.windowEnd,
    dimensions: {
      studentGrowth: { supported: true, code: 'baseline_adjusted_growth', numerator: parsed.data.growthMetrics.positiveGrowthStudentCount, denominator: parsed.data.growthMetrics.eligibleStudentCount, eligibleStudentCount: parsed.data.growthMetrics.eligibleStudentCount, excludedInsufficientCount: parsed.data.growthMetrics.excludedInsufficientCount },
      followUpDiscipline: { supported: true, code: 'reviewed_followups', numerator: followedForNeed, denominator: studentsNeedingSupport.length, eligibleStudentCount: studentsNeedingSupport.length, excludedInsufficientCount: analyses.length - studentsWithEvidence.length },
      programManagement: { supported: true, code: 'published_program_need_coverage', numerator: publishedForNeed, denominator: studentsNeedingSupport.length, eligibleStudentCount: studentsNeedingSupport.length, excludedInsufficientCount: analyses.length - studentsWithEvidence.length },
      interventionResponsiveness: { supported: true, code: 'timely_interventions', numerator: parsed.data.followupMetrics.timelyInterventionCount, denominator: parsed.data.followupMetrics.interventionEligibleCount, eligibleStudentCount: parsed.data.followupMetrics.interventionStudentCount, excludedInsufficientCount: parsed.data.followupMetrics.followedMemberRefs.length - parsed.data.followupMetrics.interventionStudentCount },
      dataReliability: { supported: true, code: 'decision_safe_student_coverage', numerator: studentsWithEvidence.length, denominator: analyses.length, eligibleStudentCount: analyses.length, excludedInsufficientCount: analyses.length - studentsWithEvidence.length },
    },
  })
  if (!teacherIndicators) return null
  const result = {
    classroom: parsed.data.classroom,
    scope: {
      game: firstScope.game,
      examRef: firstScope.examRef,
      questionExamRef: firstScope.questionExamRef,
      taxonomyVersion: parsed.data.taxonomyVersion,
      scopePolicyVersion: firstScope.scopePolicyVersion,
      modelVersion: 'institution-classroom-overview-v2' as const,
      windowStart: parsed.data.windowStart,
      windowEnd: parsed.data.windowEnd,
      minimumGroupSize: 3 as const,
    },
    summary: {
      activeStudentCount: analyses.length,
      studentsWithDecisionSafeEvidence: studentsWithEvidence.length,
      studentsNeedingSupport: studentsNeedingSupport.length,
      studentsWithoutDecisionSafeEvidence: analyses.length - studentsWithEvidence.length,
      eligibleStudentOutcomeCount,
      developingStudentOutcomeCount,
      masteredStudentOutcomeCount,
    },
    priorityOutcomes,
    teacherIndicators,
  }
  const validated = institutionClassroomOverviewSchema.safeParse(result)
  return validated.success ? validated.data : null
}

export type InstitutionClassroomOverview = z.infer<typeof institutionClassroomOverviewSchema>
