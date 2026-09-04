import { contentGovernanceReadLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { requireTytSocialExamRoleContext, tytSocialExamRoleRpc } from './context'
import { examRoleOperationsSchema, examRoleQueueQuerySchema } from './contracts'

const queuePermissions = [
  'content.prepare', 'content.review.stage1', 'content.review.stage2', 'content.publish',
] as const

export async function GET(request: Request) {
  const context = await requireTytSocialExamRoleContext(
    request,
    queuePermissions,
    contentGovernanceReadLimiter,
  )
  if (!context.ok) return context.response

  const query = examRoleQueueQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  )
  if (!query.success) {
    return contentNoStoreJson({ error: 'Geçersiz TYT Sosyal yönetişim sorgusu' }, { status: 400 })
  }

  let data: unknown
  let error: { code?: string } | null
  try {
    ({ data, error } = await tytSocialExamRoleRpc(
      context.client,
      'get_tyt_social_release_operations',
      {
        p_actor_user_id: context.userId,
        p_state: query.data.state ?? null,
        p_limit: query.data.limit,
        p_cursor: query.data.cursor ?? null,
      },
    ))
  } catch {
    return contentNoStoreJson({ error: 'TYT Sosyal yönetişim kuyruğu alınamadı' }, { status: 500 })
  }
  if (error) {
    return contentNoStoreJson(
      { error: 'TYT Sosyal yönetişim kuyruğu alınamadı' },
      { status: contentGovernanceRpcStatus(error.code) },
    )
  }
  const result = examRoleOperationsSchema.safeParse(data)
  return result.success
    ? contentNoStoreJson(result.data)
    : contentNoStoreJson({ error: 'TYT Sosyal yönetişim kuyruğu alınamadı' }, { status: 500 })
}
