import {z} from 'zod'
import {requireInstitutionPilotRouteContext} from '@/lib/institution-pilot/route-context'
import {institutionPilotNoStoreJson,institutionPilotRpcStatus} from '@/lib/institution-pilot/server-contract'
import {institutionTrackingDirectorySchema} from '@/lib/institution-tracking/directory'
import {isInstitutionTrackingEnabled} from '@/lib/institution-tracking/server-security'
import {buildInstitutionStudentLearningAnalysis,completeLegacyInstitutionAnalysisScope} from '@/lib/institution-tracking/student-analysis'
import {buildInstitutionStudentReportSnapshot,institutionStudentReportInputSchema,institutionStudentReportListSchema,institutionStudentReportMutationSchema} from '@/lib/institution-tracking/student-report'
import {teacherClassroomWriteLimiter} from '@/lib/teacher-classroom/rate-limits'
import {GAME_SLUGS,type GameSlug} from '@/lib/constants/games'
import {isExactInstitutionScopeIdentity,resolveInstitutionLearningScope,type InstitutionLearningScope} from '@/lib/institution-tracking/scope'
import {createServiceRoleClient} from '@/lib/supabase/service-role'

const querySchema=z.object({
  classroomId:z.string().uuid(),memberRef:z.string().regex(/^[0-9a-f]{32}$/),
  game:z.enum(GAME_SLUGS as [GameSlug,...GameSlug[]]),examRef:z.string().regex(/^[A-Z0-9-]{2,10}$/),
}).strict()

function resultMatchesScope(
  reports:{
    scope?:Parameters<typeof isExactInstitutionScopeIdentity>[0],
    reports:Array<{scope?:Parameters<typeof isExactInstitutionScopeIdentity>[0],snapshot:{scope:Parameters<typeof isExactInstitutionScopeIdentity>[0]}}>,
  },
  scope:InstitutionLearningScope,
  legacy:boolean,
){
  return (legacy||Boolean(reports.scope))
    && (!reports.scope||isExactInstitutionScopeIdentity(reports.scope,scope))
    && reports.reports.every((report)=>(legacy||Boolean(report.scope))
      && (!report.scope||isExactInstitutionScopeIdentity(report.scope,scope))
      && isExactInstitutionScopeIdentity(report.snapshot.scope,scope))
}

export async function GET(request:Request){
  if(!isInstitutionTrackingEnabled())return institutionPilotNoStoreJson({error:'Kurum raporu yapılandırılmadı'},{status:503})
  const context=await requireInstitutionPilotRouteContext(request)
  if(!context.ok)return context.response
  const url=new URL(request.url)
  const query=querySchema.safeParse({
    classroomId:url.searchParams.get('classroomId'),memberRef:url.searchParams.get('memberRef'),
    game:url.searchParams.get('game'),examRef:url.searchParams.get('exam_ref'),
  })
  if(!query.success)return institutionPilotNoStoreJson({error:'Geçersiz rapor kapsamı'},{status:400})
  const scopeResolution=await resolveInstitutionLearningScope(
    (name,args)=>context.admin.rpc(name,args),query.data.game,query.data.examRef,
  )
  if(scopeResolution.error||!scopeResolution.scope)return institutionPilotNoStoreJson(
    {error:'Rapor kapsamı henüz yayımlanmadı'},
    {status:scopeResolution.error&&scopeResolution.code?institutionPilotRpcStatus(scopeResolution.code):409},
  )
  let admin:ReturnType<typeof createServiceRoleClient>
  try{admin=createServiceRoleClient()}
  catch{return institutionPilotNoStoreJson({error:'Kurum raporu yapılandırılmadı'},{status:503})}
  const args={p_user_id:context.userId,p_classroom_id:query.data.classroomId,p_member_ref:query.data.memberRef}
  const {data,error}=scopeResolution.legacy
    ?await admin.rpc('get_institution_student_reports',args)
    :await admin.rpc('get_institution_student_reports_v2',{
      ...args,p_game:query.data.game,p_display_exam_ref:query.data.examRef,
    })
  if(error)return institutionPilotNoStoreJson({error:'Öğrenci raporları alınamadı'},{status:institutionPilotRpcStatus(error.code)})
  const result=institutionStudentReportListSchema.safeParse(data)
  return result.success&&resultMatchesScope(result.data,scopeResolution.scope,scopeResolution.legacy)
    ?institutionPilotNoStoreJson(result.data)
    :institutionPilotNoStoreJson({error:'Öğrenci raporları alınamadı'},{status:500})
}

export async function POST(request:Request){
  if(!isInstitutionTrackingEnabled())return institutionPilotNoStoreJson({error:'Kurum raporu yapılandırılmadı'},{status:503})
  const context=await requireInstitutionPilotRouteContext(request,teacherClassroomWriteLimiter)
  if(!context.ok)return context.response
  const body=institutionStudentReportInputSchema.safeParse(await request.json().catch(()=>null))
  if(!body.success)return institutionPilotNoStoreJson({error:'Geçersiz öğrenci raporu'},{status:400})
  const directoryRpc=await context.admin.rpc('get_institution_tracking_directory',{p_user_id:context.userId})
  const directory=institutionTrackingDirectorySchema.safeParse(directoryRpc.data)
  if(directoryRpc.error||!directory.success)return institutionPilotNoStoreJson({error:'Rapor kurum kapsamı alınamadı'},{status:directoryRpc.error?institutionPilotRpcStatus(directoryRpc.error.code):500})
  const classroom=directory.data.classrooms.find((item)=>item.id===body.data.classroomId)
  if(!classroom)return institutionPilotNoStoreJson({error:'Aktif sınıf bulunamadı'},{status:404})
  const scopeResolution=await resolveInstitutionLearningScope(
    (name,args)=>context.admin.rpc(name,args),body.data.game,body.data.examRef,
  )
  if(scopeResolution.error||!scopeResolution.scope)return institutionPilotNoStoreJson(
    {error:'Rapor kapsamı henüz yayımlanmadı'},
    {status:scopeResolution.error&&scopeResolution.code?institutionPilotRpcStatus(scopeResolution.code):409},
  )
  const windowEnd=new Date().toISOString()
  const analysisArgs={
    p_user_id:context.userId,p_classroom_id:body.data.classroomId,
    p_member_ref:body.data.memberRef,p_window_end:windowEnd,
  }
  const analysisRpc=scopeResolution.legacy
    ?await context.admin.rpc('get_institution_student_learning_analysis',{
      ...analysisArgs,p_game:body.data.game,p_exam_ref:body.data.examRef,
    })
    :await context.admin.rpc('get_institution_student_learning_analysis_v2',{
      ...analysisArgs,p_game:body.data.game,p_display_exam_ref:body.data.examRef,
    })
  if(analysisRpc.error)return institutionPilotNoStoreJson({error:'Rapor analizi alınamadı'},{status:institutionPilotRpcStatus(analysisRpc.error.code)})
  const analysis=buildInstitutionStudentLearningAnalysis(scopeResolution.legacy
    ?completeLegacyInstitutionAnalysisScope(analysisRpc.data,scopeResolution.scope)
    :analysisRpc.data)
  if(analysis&&!isExactInstitutionScopeIdentity({
    game:analysis.scope.game,examRef:analysis.scope.examRef,
    questionExamRef:analysis.scope.questionExamRef,taxonomyVersion:analysis.scope.taxonomyVersion,
    scopePolicyVersion:analysis.scope.scopePolicyVersion,
  },scopeResolution.scope))return institutionPilotNoStoreJson({error:'Rapor analizi kapsamı doğrulanamadı'},{status:500})
  const snapshot=analysis&&buildInstitutionStudentReportSnapshot(analysis,{institutionName:directory.data.institution.name,teacherAlias:classroom.teacherAlias})
  if(!snapshot)return institutionPilotNoStoreJson({error:'Güvenilir rapor snapshotı üretilemedi'},{status:409})
  const mutationArgs={
    p_user_id:context.userId,p_classroom_id:body.data.classroomId,p_member_ref:body.data.memberRef,
    p_snapshot:snapshot,p_request_id:body.data.requestId,
  }
  const {data,error}=scopeResolution.legacy
    ?await context.admin.rpc('create_institution_student_report',mutationArgs)
    :await context.admin.rpc('create_institution_student_report_v2',{
      ...mutationArgs,p_game:body.data.game,p_display_exam_ref:body.data.examRef,
    })
  if(error)return institutionPilotNoStoreJson({error:'Öğrenci raporu kaydedilemedi'},{status:institutionPilotRpcStatus(error.code)})
  const result=institutionStudentReportMutationSchema.safeParse(data)
  const resultScope=result.success&&'scope' in result.data?result.data.scope:undefined
  return result.success
    && (scopeResolution.legacy||Boolean(resultScope))
    && (!resultScope||isExactInstitutionScopeIdentity(resultScope,scopeResolution.scope))
    && isExactInstitutionScopeIdentity(result.data.snapshot.scope,scopeResolution.scope)
    ?institutionPilotNoStoreJson(result.data)
    :institutionPilotNoStoreJson({error:'Öğrenci raporu kaydedilemedi'},{status:500})
}
