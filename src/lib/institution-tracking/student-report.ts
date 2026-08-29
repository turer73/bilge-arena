import {z} from 'zod'
import {institutionStudentLearningAnalysisSchema,institutionTaxonomyVersionSchema} from './student-analysis'

const timestampSchema=z.string().datetime({offset:true})
const reportRefSchema=z.string().regex(/^[0-9a-f]{32}$/)
const countSchema=z.number().int().nonnegative()

export const institutionStudentReportSnapshotSchema=z.object({
  modelVersion:z.literal('institution-student-report-v1'),
  generatedAt:timestampSchema,periodStart:timestampSchema,periodEnd:timestampSchema,
  institutionName:z.string().trim().min(2).max(120),
  classroomName:z.string().trim().min(2).max(60),
  teacherAlias:z.string().trim().min(1).max(80),
  studentAlias:z.string().trim().min(1).max(80),
  scope:z.object({game:z.literal('matematik'),examRef:z.literal('TYT'),taxonomyVersion:institutionTaxonomyVersionSchema}).strict(),
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

export const institutionStudentReportMutationSchema=z.object({
  reportRef:reportRefSchema,snapshot:institutionStudentReportSnapshotSchema,createdAt:timestampSchema,replayed:z.boolean(),
}).strict()
export const institutionStudentReportListSchema=z.object({
  reports:z.array(institutionStudentReportMutationSchema.omit({replayed:true})).max(10),
}).strict()
export const institutionStudentReportInputSchema=z.object({classroomId:z.string().uuid(),memberRef:z.string().regex(/^[0-9a-f]{32}$/),requestId:z.string().uuid()}).strict()

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
    scope:{game:'matematik' as const,examRef:'TYT' as const,taxonomyVersion:analysis.data.scope.taxonomyVersion},
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
