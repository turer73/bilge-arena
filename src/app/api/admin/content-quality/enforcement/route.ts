import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceReadLimiter, contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson, enforcementInputSchema, enforcementResultSchema } from '@/lib/content-governance/server-contract'

export async function GET(request: Request) {
  const context = await requireContentGovernanceContext(request, contentGovernanceReadLimiter, 'content.enforcement.manage')
  if (!context.ok) return context.response
  const { data, error } = await contentRpc(context.admin, 'get_content_governance_enforcement', { p_user_id: context.userId })
  if (error) return contentNoStoreJson({ error: 'Yönetişim koruması okunamadı' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = enforcementResultSchema.safeParse(data)
  return result.success ? contentNoStoreJson(result.data) : contentNoStoreJson({ error: 'Yönetişim koruması okunamadı' }, { status: 500 })
}

export async function POST(request: Request) {
  const context = await requireContentGovernanceContext(request, contentGovernanceWriteLimiter, 'content.enforcement.manage')
  if (!context.ok) return context.response
  const body = enforcementInputSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return contentNoStoreJson({ error: 'Geçersiz yönetişim koruması isteği' }, { status: 400 })
  const { data, error } = await contentRpc(context.admin, 'set_content_governance_enforcement', { p_user_id: context.userId, p_enforced: body.data.enforced, p_request_id: body.data.requestId })
  if (error) return contentNoStoreJson({ error: 'Yönetişim koruması değiştirilemedi' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = enforcementResultSchema.safeParse(data)
  return result.success ? contentNoStoreJson(result.data) : contentNoStoreJson({ error: 'Yönetişim koruması değiştirilemedi' }, { status: 500 })
}
