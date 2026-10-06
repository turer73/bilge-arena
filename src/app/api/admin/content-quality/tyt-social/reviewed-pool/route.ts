import { contentGovernanceRpcStatus, contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { requireTytSocialExamRoleContext, tytSocialExamRoleRpc } from '../exam-role/context'
import { reviewedPoolInputSchema, reviewedPoolResultSchema, reviewedPoolResultMatchesRequest } from './contracts'

// POST carries private pins, but the RPC is STABLE and performs no writes.
export async function POST(request: Request) {
  const context = await requireTytSocialExamRoleContext(request, [
    'content.prepare', 'content.review.stage1', 'content.review.stage2', 'content.publish',
  ])
  if (!context.ok) return context.response
  const body = reviewedPoolInputSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return contentNoStoreJson({ error: 'Geçersiz TYT Sosyal havuz isteği' }, { status: 400 })
  try {
    const { data, error } = await tytSocialExamRoleRpc(context.client, 'get_tyt_social_reviewed_pool_preflight', {
      p_actor_user_id: context.userId, p_policy_version: body.data.policyVersion, p_items: body.data.items,
    })
    if (error) return contentNoStoreJson({ error: 'TYT Sosyal havuzu kontrol edilemedi' }, {
      status: contentGovernanceRpcStatus(error.code),
    })
    const result = reviewedPoolResultSchema.safeParse(data)
    if (!result.success || !reviewedPoolResultMatchesRequest(body.data, result.data)) {
      return contentNoStoreJson({ error: 'TYT Sosyal havuzu kontrol edilemedi' }, { status: 500 })
    }
    return contentNoStoreJson(result.data)
  } catch {
    return contentNoStoreJson({ error: 'TYT Sosyal havuzu kontrol edilemedi' }, { status: 500 })
  }
}
