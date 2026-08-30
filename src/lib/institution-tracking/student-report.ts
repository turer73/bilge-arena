import {z} from 'zod'
import {GAMES} from '@/lib/constants/games'
import {institutionScopeIdentitySchema} from './scope'
import {institutionStudentLearningAnalysisSchema,institutionTaxonomyVersionSchema} from './student-analysis'

const timestampSchema=z.string().datetime({offset:true})
const reportRefSchema=z.string().regex(/^[0-9a-f]{32}$/)
const countSchema=z.number().int().nonnegative()

const legacyMathReportScopeSchema=z.object({
  game:z.literal('matematik'),examRef:z.literal('TYT'),taxonomyVersion:institutionTaxonomyVersionSchema,
}).strict().transform((scope)=>({
  ...scope,questionExamRef:'TYT' as const,scopePolicyVersion:'institution-scope-v1' as const,
}))

export const institutionStudentReportScopeSchema=z.union([
  institutionScopeIdentitySchema,
  legacyMathReportScopeSchema,
])

export const institutionStudentReportSnapshotSchema=z.object({
  modelVersion:z.literal('institution-student-report-v1'),
  generatedAt:timestampSchema,periodStart:timestampSchema,periodEnd:timestampSchema,
  institutionName:z.string().trim().min(2).max(120),
  classroomName:z.string().trim().min(2).max(60),
  teacherAlias:z.string().trim().min(1).max(80),
  studentAlias:z.string().trim().min(1).max(80),
  scope:institutionStudentReportScopeSchema,
  summary:z.object({outcomeCount:countSchema,assessedOutcomeCount:countSchema,insufficientOutcomeCount:countSchema,developingOutcomeCount:countSchema,masteredOutcomeCount:countSchema}).strict(),
  outcomes:z.array(z.object({
    title:z.string().trim().min(1).max(200),path:z.array(z.string().trim().min(1).max(160)).min(1).max(4),
    status:z.enum(['insufficient','developing','mastered']),score:z.number().min(0).max(100).nullable(),
    confidence:z.enum(['insufficient','low','medium','high']),evidenceCount:countSchema,
    independentEvidenceCount:countSchema,lastEvidenceAt:timestampSchema.nullable(),
  }).strict()).max(200),
}).strict().superRefine((value,context)=>{
  if(Date.parse(value.periodStart)>=Date.parse(value.periodEnd)
    || value.generatedAt!==value.periodEnd
    || value.summary.outcomeCount!==value.outcomes.length
    || value.summary.assessedOutcomeCount+value.summary.insufficientOutcomeCount!==value.summary.outcomeCount
    || value.summary.developingOutcomeCount+value.summary.masteredOutcomeCount!==value.summary.assessedOutcomeCount){
    context.addIssue({code:'custom',message:'invalid institution student report snapshot'})
  }
})

const reportWireBase={
  reportRef:reportRefSchema,
  scope:institutionStudentReportScopeSchema.optional(),
  snapshot:institutionStudentReportSnapshotSchema,
  createdAt:timestampSchema,
}

function sameScope(
  left:z.infer<typeof institutionStudentReportScopeSchema>,
  right:z.infer<typeof institutionStudentReportScopeSchema>,
){
  return left.game===right.game
    && left.examRef===right.examRef
    && left.questionExamRef===right.questionExamRef
    && left.taxonomyVersion===right.taxonomyVersion
    && left.scopePolicyVersion===right.scopePolicyVersion
}

const institutionStudentReportMutationWireSchema=z.object({
  ...reportWireBase,replayed:z.boolean(),
}).strict().superRefine((value,context)=>{
  if(value.scope&&!sameScope(value.scope,value.snapshot.scope)){
    context.addIssue({code:'custom',message:'institution report response scope mismatch'})
  }
})

export const institutionStudentReportMutationSchema=institutionStudentReportMutationWireSchema
  .transform(({scope,...report})=>scope?{...report,scope}:report)

const institutionStudentReportListItemWireSchema=z.object(reportWireBase).strict()
  .superRefine((value,context)=>{
    if(value.scope&&!sameScope(value.scope,value.snapshot.scope)){
      context.addIssue({code:'custom',message:'institution report response scope mismatch'})
    }
  })

export const institutionStudentReportListSchema=z.object({
  scope:institutionStudentReportScopeSchema.optional(),
  reports:z.array(institutionStudentReportListItemWireSchema).max(10),
}).strict().superRefine((value,context)=>{
  if(value.scope&&value.reports.some((report)=>!sameScope(value.scope!,report.snapshot.scope))){
    context.addIssue({code:'custom',message:'institution report list scope mismatch'})
  }
}).transform(({scope,reports})=>({
  ...(scope?{scope}:{}),
  reports:reports.map(({scope:reportScope,...report})=>reportScope?{...report,scope:reportScope}:report),
}))

export const institutionStudentReportInputSchema=z.object({
  classroomId:z.string().uuid(),memberRef:z.string().regex(/^[0-9a-f]{32}$/),
  game:z.enum(['wordquest','matematik','turkce','fen','sosyal']),
  examRef:z.string().regex(/^[A-Z0-9-]{2,10}$/),requestId:z.string().uuid(),
}).strict()

export function buildInstitutionStudentReportSnapshot(
  analysisValue:unknown,
  metadataValue:unknown,
){
  const analysis=institutionStudentLearningAnalysisSchema.safeParse(analysisValue)
  const metadata=z.object({institutionName:z.string().trim().min(2).max(120),teacherAlias:z.string().trim().min(1).max(80)}).strict().safeParse(metadataValue)
  if(!analysis.success||!metadata.success)return null
  const value={
    modelVersion:'institution-student-report-v1' as const,
    generatedAt:analysis.data.scope.windowEnd,periodStart:analysis.data.scope.windowStart,periodEnd:analysis.data.scope.windowEnd,
    institutionName:metadata.data.institutionName,classroomName:analysis.data.classroom.name,
    teacherAlias:metadata.data.teacherAlias,studentAlias:analysis.data.student.alias,
    scope:{
      game:analysis.data.scope.game,examRef:analysis.data.scope.examRef,
      questionExamRef:analysis.data.scope.questionExamRef,
      taxonomyVersion:analysis.data.scope.taxonomyVersion,
      scopePolicyVersion:analysis.data.scope.scopePolicyVersion,
    },
    summary:analysis.data.summary,
    outcomes:analysis.data.outcomes.map((outcome)=>({
      title:outcome.title,path:outcome.path,status:outcome.assessment.status,score:outcome.assessment.score,
      confidence:outcome.assessment.confidence,evidenceCount:outcome.assessment.evidence.evidenceCount,
      independentEvidenceCount:outcome.assessment.evidence.independentEvidenceCount,
      lastEvidenceAt:outcome.assessment.evidence.lastEvidenceAt,
    })),
  }
  const parsed=institutionStudentReportSnapshotSchema.safeParse(value)
  return parsed.success?parsed.data:null
}

export type InstitutionStudentReportSnapshot=z.infer<typeof institutionStudentReportSnapshotSchema>
export type InstitutionStudentReportMutation=z.infer<typeof institutionStudentReportMutationSchema>
export type InstitutionStudentReportList=z.infer<typeof institutionStudentReportListSchema>

export function institutionStudentReportScopeLabel(
  scope:Pick<z.infer<typeof institutionStudentReportScopeSchema>,'game'|'examRef'>,
){
  return `${scope.examRef} ${GAMES[scope.game].name}`
}
