import {z} from 'zod'
import {requireInstitutionPilotRouteContext} from '@/lib/institution-pilot/route-context'
import {institutionPilotNoStoreJson,institutionPilotRpcStatus} from '@/lib/institution-pilot/server-contract'
import {institutionProgramReviewEvidenceSchema,institutionProgramReviewInputSchema,institutionProgramReviewMutationSchema} from '@/lib/institution-tracking/program-review'
import {isInstitutionStudyProgramEnabled,isInstitutionTrackingEnabled} from '@/lib/institution-tracking/server-security'
import {teacherClassroomWriteLimiter} from '@/lib/teacher-classroom/rate-limits'
import {createServiceRoleClient} from '@/lib/supabase/service-role'

const paramsSchema=z.object({programRef:z.string().regex(/^[0-9a-f]{32}$/)}).strict()

export async function GET(request:Request,routeContext:{params:Promise<{programRef:string}>}){
  if(!isInstitutionTrackingEnabled()||!isInstitutionStudyProgramEnabled()){
    return institutionPilotNoStoreJson({error:'Kurum çalışma programı yapılandırılmadı'},{status:503})
  }
  const context=await requireInstitutionPilotRouteContext(request)
  if(!context.ok)return context.response
  const params=paramsSchema.safeParse(await routeContext.params)
  if(!params.success)return institutionPilotNoStoreJson({error:'Geçersiz program değerlendirme kapsamı'},{status:400})
  let admin:ReturnType<typeof createServiceRoleClient>
  try{admin=createServiceRoleClient()}
  catch{return institutionPilotNoStoreJson({error:'Kurum programı yapılandırılmadı'},{status:503})}
  const {data,error}=await admin.rpc('preview_institution_study_program_review',{
    p_user_id:context.userId,p_program_ref:params.data.programRef,
  })
  if(error)return institutionPilotNoStoreJson({error:'Program değerlendirme kanıtı alınamadı'},{status:institutionPilotRpcStatus(error.code)})
  const result=institutionProgramReviewEvidenceSchema.safeParse(data)
  return result.success?institutionPilotNoStoreJson(result.data):institutionPilotNoStoreJson({error:'Program değerlendirme kanıtı alınamadı'},{status:500})
}

export async function POST(request:Request,routeContext:{params:Promise<{programRef:string}>}){
  if(!isInstitutionTrackingEnabled()||!isInstitutionStudyProgramEnabled()){
    return institutionPilotNoStoreJson({error:'Kurum çalışma programı yapılandırılmadı'},{status:503})
  }
  const context=await requireInstitutionPilotRouteContext(request,teacherClassroomWriteLimiter)
  if(!context.ok)return context.response
  const params=paramsSchema.safeParse(await routeContext.params)
  const body=institutionProgramReviewInputSchema.safeParse(await request.json().catch(()=>null))
  if(!params.success||!body.success)return institutionPilotNoStoreJson({error:'Geçersiz program değerlendirmesi'},{status:400})
  let admin:ReturnType<typeof createServiceRoleClient>
  try{admin=createServiceRoleClient()}
  catch{return institutionPilotNoStoreJson({error:'Kurum programı yapılandırılmadı'},{status:503})}
  const {data,error}=await admin.rpc('review_institution_study_program',{
    p_user_id:context.userId,p_program_ref:params.data.programRef,p_teacher_result:body.data.teacherResult,
    p_note:body.data.note||null,p_request_id:body.data.requestId,
  })
  if(error)return institutionPilotNoStoreJson({error:'Program değerlendirmesi kaydedilemedi'},{status:institutionPilotRpcStatus(error.code)})
  const result=institutionProgramReviewMutationSchema.safeParse(data)
  return result.success?institutionPilotNoStoreJson(result.data):institutionPilotNoStoreJson({error:'Program değerlendirmesi kaydedilemedi'},{status:500})
}
