import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceReadLimiter, contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { retirementReviewInputSchema, retirementReviewStatusSchema, retirementReviewResultSchema, RETIREMENT_REVIEW_MAX_BYTES } from '@/lib/content-governance/retirement-review-contract'

type Context={params:Promise<{revisionId:string}>}
export async function GET(request:Request,{params}:Context){
  const context=await requireContentGovernanceContext(request,contentGovernanceReadLimiter,
    ['content.prepare','content.review.stage1','content.review.stage2','content.publish'])
  if(!context.ok)return context.response
  const id=z.string().uuid().safeParse((await params).revisionId)
  if(!id.success)return contentNoStoreJson({error:'Geçersiz revizyon'},{status:400})
  const {data,error}=await contentRpc(context.admin,'get_question_revision_retirement_review',{p_user_id:context.userId,p_revision_id:id.data})
  if(error)return contentNoStoreJson({error:'Pasife alma kabulü alınamadı'},{status:contentGovernanceRpcStatus(error.code)})
  const result=retirementReviewStatusSchema.safeParse(data)
  if(!result.success||result.data.revisionId!==id.data)return contentNoStoreJson({error:'Pasife alma kabulü doğrulanamadı'},{status:500})
  return contentNoStoreJson(result.data)
}
export async function POST(request:Request,{params}:Context){
  const context=await requireContentGovernanceContext(request,contentGovernanceWriteLimiter,'content.review.stage1')
  if(!context.ok)return context.response
  const id=z.string().uuid().safeParse((await params).revisionId)
  if(!id.success)return contentNoStoreJson({error:'Geçersiz revizyon'},{status:400})
  const reader=request.body?.getReader()
  if(!reader)return contentNoStoreJson({error:'Kabul kanıtı gerekli'},{status:400})
  let raw:unknown
  try{
    const chunks:Uint8Array[]=[];let size=0
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength
      if(size>RETIREMENT_REVIEW_MAX_BYTES){await reader.cancel();return contentNoStoreJson({error:'Kabul kanıtı fazla büyük'},{status:413})}chunks.push(value)}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
    raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
  }catch{return contentNoStoreJson({error:'Geçersiz kabul kanıtı'},{status:400})}finally{reader.releaseLock()}
  const body=retirementReviewInputSchema.safeParse(raw)
  if(!body.success||body.data.evidence.revisionId!==id.data)return contentNoStoreJson({error:'Geçersiz pasife alma kabulü'},{status:400})
  const {data,error}=await contentRpc(context.admin,'accept_question_revision_retirement_review',{
    p_user_id:context.userId,p_revision_id:id.data,p_evidence:body.data.evidence,p_preparation:body.data.preparation,
    p_rationale:body.data.rationale,p_request_id:body.data.requestId,
  })
  if(error)return contentNoStoreJson({error:'Pasife alma kabulü kaydedilemedi'},{status:contentGovernanceRpcStatus(error.code)})
  const result=retirementReviewResultSchema.safeParse(data)
  if(!result.success||result.data.revisionId!==id.data||result.data.questionId!==body.data.evidence.questionId)
    return contentNoStoreJson({error:'Kabul sonucu doğrulanamadı'},{status:500})
  return contentNoStoreJson(result.data)
}
