import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson, requestIdInputSchema, revisionPublishResultSchema } from '@/lib/content-governance/server-contract'
export async function POST(request: Request, { params }: { params: Promise<{ revisionId: string }> }) {
  const context = await requireContentGovernanceContext(request, contentGovernanceWriteLimiter, 'content.publish'); if (!context.ok) return context.response
  const id = z.string().uuid().safeParse((await params).revisionId), body = requestIdInputSchema.safeParse(await request.json().catch(() => null))
  if (!id.success || !body.success) return contentNoStoreJson({ error: 'Geçersiz yayın isteği' }, { status: 400 })
  const { data, error } = await contentRpc(context.admin, 'publish_question_content_revision', { p_user_id: context.userId, p_revision_id: id.data, p_request_id: body.data.requestId })
  if (error) return contentNoStoreJson({ error: 'Revizyon yayınlanamadı' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = revisionPublishResultSchema.safeParse(data); return result.success ? contentNoStoreJson(result.data) : contentNoStoreJson({ error: 'Revizyon yayınlanamadı' }, { status: 500 })
}
