import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceReadLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson, correctionsSchema } from '@/lib/content-governance/server-contract'

export async function GET(request: Request) {
  const context = await requireContentGovernanceContext(request, contentGovernanceReadLimiter)
  if (!context.ok) return context.response
  const { data, error } = await contentRpc(context.admin, 'get_my_question_result_corrections', { p_user_id: context.userId })
  if (error) return contentNoStoreJson({ error: 'Düzeltmeler alınamadı' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = correctionsSchema.safeParse(data)
  return result.success ? contentNoStoreJson(result.data) : contentNoStoreJson({ error: 'Düzeltmeler alınamadı' }, { status: 500 })
}
