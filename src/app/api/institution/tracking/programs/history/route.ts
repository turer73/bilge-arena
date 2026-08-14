import {z} from 'zod'
import {requireInstitutionPilotRouteContext} from '@/lib/institution-pilot/route-context'
import {institutionPilotNoStoreJson,institutionPilotRpcStatus} from '@/lib/institution-pilot/server-contract'
import {institutionStudentProgramHistorySchema} from '@/lib/institution-tracking/program-review'
import {isInstitutionStudyProgramEnabled,isInstitutionTrackingEnabled} from '@/lib/institution-tracking/server-security'

const querySchema=z.object({classroomId:z.string().uuid(),memberRef:z.string().regex(/^[0-9a-f]{32}$/)}).strict()

export async function GET(request:Request){
  if(!isInstitutionTrackingEnabled()||!isInstitutionStudyProgramEnabled()){
    return institutionPilotNoStoreJson({error:'Kurum çalışma programı yapılandırılmadı'},{status:503})
  }
  const context=await requireInstitutionPilotRouteContext(request)
  if(!context.ok)return context.response
  const url=new URL(request.url)
  const query=querySchema.safeParse({classroomId:url.searchParams.get('classroomId'),memberRef:url.searchParams.get('memberRef')})
  if(!query.success)return institutionPilotNoStoreJson({error:'Geçersiz program geçmişi kapsamı'},{status:400})
  const {data,error}=await context.admin.rpc('get_institution_student_program_history',{
    p_user_id:context.userId,p_classroom_id:query.data.classroomId,p_member_ref:query.data.memberRef,
  })
  if(error)return institutionPilotNoStoreJson({error:'Program geçmişi alınamadı'},{status:institutionPilotRpcStatus(error.code)})
  const result=institutionStudentProgramHistorySchema.safeParse(data)
  return result.success?institutionPilotNoStoreJson(result.data):institutionPilotNoStoreJson({error:'Program geçmişi alınamadı'},{status:500})
}
