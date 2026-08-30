import {z} from 'zod'
import {requireInstitutionPilotRouteContext} from '@/lib/institution-pilot/route-context'
import {institutionPilotNoStoreJson,institutionPilotRpcStatus} from '@/lib/institution-pilot/server-contract'
import {institutionStudentProgramHistorySchema} from '@/lib/institution-tracking/program-review'
import {isInstitutionStudyProgramEnabled,isInstitutionTrackingEnabled} from '@/lib/institution-tracking/server-security'
import {GAME_SLUGS} from '@/lib/constants/games'

const querySchema=z.object({
  classroomId:z.string().uuid(),
  memberRef:z.string().regex(/^[0-9a-f]{32}$/),
  game:z.enum(GAME_SLUGS),
  examRef:z.string().regex(/^[A-Z0-9-]{2,10}$/),
}).strict()
const legacyMathScope={
  game:'matematik' as const,examRef:'TYT',questionExamRef:'TYT',
  taxonomyVersion:'ba-tyt-math-v1',scopePolicyVersion:'institution-scope-v1',
}
function isAppFirstHistoryRpcUnavailable(error:{code?:string}|null){
  return error?.code==='PGRST202'||error?.code==='42883'
}

export async function GET(request:Request){
  if(!isInstitutionTrackingEnabled()||!isInstitutionStudyProgramEnabled()){
    return institutionPilotNoStoreJson({error:'Kurum çalışma programı yapılandırılmadı'},{status:503})
  }
  const context=await requireInstitutionPilotRouteContext(request)
  if(!context.ok)return context.response
  const url=new URL(request.url)
  const query=querySchema.safeParse({
    classroomId:url.searchParams.get('classroomId'),memberRef:url.searchParams.get('memberRef'),
    game:url.searchParams.get('game'),examRef:url.searchParams.get('exam_ref'),
  })
  if(!query.success)return institutionPilotNoStoreJson({error:'Geçersiz program geçmişi kapsamı'},{status:400})
  const current=await context.admin.rpc('get_institution_student_program_history_v2',{
    p_user_id:context.userId,p_classroom_id:query.data.classroomId,p_member_ref:query.data.memberRef,
    p_game:query.data.game,p_display_exam_ref:query.data.examRef,
  })
  let data:unknown=current.data
  if(current.error&&isAppFirstHistoryRpcUnavailable(current.error)
    &&query.data.game==='matematik'&&query.data.examRef==='TYT'){
    const legacy=await context.admin.rpc('get_institution_student_program_history',{
      p_user_id:context.userId,p_classroom_id:query.data.classroomId,p_member_ref:query.data.memberRef,
    })
    if(legacy.error)return institutionPilotNoStoreJson({error:'Program geçmişi alınamadı'},{status:institutionPilotRpcStatus(legacy.error.code)})
    if(legacy.data&&typeof legacy.data==='object'&&!Array.isArray(legacy.data)
      &&Array.isArray((legacy.data as {programs?:unknown}).programs)){
      data={scope:legacyMathScope,programs:(legacy.data as {programs:Record<string,unknown>[]}).programs.map((program)=>({...program,scope:legacyMathScope}))}
    }else data=null
  }else if(current.error){
    return institutionPilotNoStoreJson({error:'Program geçmişi alınamadı'},{status:institutionPilotRpcStatus(current.error.code)})
  }
  const result=institutionStudentProgramHistorySchema.safeParse(data)
  if(result.success&&(result.data.scope.game!==query.data.game||result.data.scope.examRef!==query.data.examRef)){
    return institutionPilotNoStoreJson({error:'Program geçmişi kapsamı doğrulanamadı'},{status:500})
  }
  return result.success?institutionPilotNoStoreJson(result.data):institutionPilotNoStoreJson({error:'Program geçmişi alınamadı'},{status:500})
}
