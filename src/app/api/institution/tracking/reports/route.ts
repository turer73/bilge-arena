import {z} from 'zod'
import {requireInstitutionPilotRouteContext} from '@/lib/institution-pilot/route-context'
import {institutionPilotNoStoreJson,institutionPilotRpcStatus} from '@/lib/institution-pilot/server-contract'
import {institutionTrackingDirectorySchema} from '@/lib/institution-tracking/directory'
import {isInstitutionTrackingEnabled} from '@/lib/institution-tracking/server-security'
import {buildInstitutionStudentLearningAnalysis} from '@/lib/institution-tracking/student-analysis'
import {buildInstitutionStudentReportSnapshot,institutionStudentReportInputSchema,institutionStudentReportListSchema,institutionStudentReportMutationSchema} from '@/lib/institution-tracking/student-report'
import {teacherClassroomWriteLimiter} from '@/lib/teacher-classroom/rate-limits'

const querySchema=z.object({classroomId:z.string().uuid(),memberRef:z.string().regex(/^[0-9a-f]{32}$/)}).strict()

export async function GET(request:Request){
  if(!isInstitutionTrackingEnabled())return institutionPilotNoStoreJson({error:'Kurum raporu yapılandırılmadı'},{status:503})
  const context=await requireInstitutionPilotRouteContext(request)
  if(!context.ok)return context.response
  const url=new URL(request.url)
  const query=querySchema.safeParse({classroomId:url.searchParams.get('classroomId'),memberRef:url.searchParams.get('memberRef')})
  if(!query.success)return institutionPilotNoStoreJson({error:'Geçersiz rapor kapsamı'},{status:400})
  const {data,error}=await context.admin.rpc('get_institution_student_reports',{p_user_id:context.userId,p_classroom_id:query.data.classroomId,p_member_ref:query.data.memberRef})
  if(error)return institutionPilotNoStoreJson({error:'Öğrenci raporları alınamadı'},{status:institutionPilotRpcStatus(error.code)})
  const result=institutionStudentReportListSchema.safeParse(data)
  return result.success?institutionPilotNoStoreJson(result.data):institutionPilotNoStoreJson({error:'Öğrenci raporları alınamadı'},{status:500})
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
  const windowEnd=new Date().toISOString()
  const analysisRpc=await context.admin.rpc('get_institution_student_learning_analysis',{p_user_id:context.userId,p_classroom_id:body.data.classroomId,p_member_ref:body.data.memberRef,p_game:'matematik',p_exam_ref:'TYT',p_window_end:windowEnd})
  if(analysisRpc.error)return institutionPilotNoStoreJson({error:'Rapor analizi alınamadı'},{status:institutionPilotRpcStatus(analysisRpc.error.code)})
  const analysis=buildInstitutionStudentLearningAnalysis(analysisRpc.data)
  const snapshot=analysis&&buildInstitutionStudentReportSnapshot(analysis,{institutionName:directory.data.institution.name,teacherAlias:classroom.teacherAlias})
  if(!snapshot)return institutionPilotNoStoreJson({error:'Güvenilir rapor snapshotı üretilemedi'},{status:409})
  const {data,error}=await context.admin.rpc('create_institution_student_report',{p_user_id:context.userId,p_classroom_id:body.data.classroomId,p_member_ref:body.data.memberRef,p_snapshot:snapshot,p_request_id:body.data.requestId})
  if(error)return institutionPilotNoStoreJson({error:'Öğrenci raporu kaydedilemedi'},{status:institutionPilotRpcStatus(error.code)})
  const result=institutionStudentReportMutationSchema.safeParse(data)
  return result.success?institutionPilotNoStoreJson(result.data):institutionPilotNoStoreJson({error:'Öğrenci raporu kaydedilemedi'},{status:500})
}
