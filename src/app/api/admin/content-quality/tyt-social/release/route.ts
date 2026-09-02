import { contentGovernanceRpcStatus, contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { requireTytSocialExamRoleContext, tytSocialExamRoleRpc } from '../exam-role/context'
import { releaseTytSocialInputSchema, releaseTytSocialResultSchema } from '../exam-role/contracts'

export async function POST(request: Request) {
  const context = await requireTytSocialExamRoleContext(request, 'content.publish')
  if (!context.ok) return context.response
  const body = releaseTytSocialInputSchema.safeParse(await request.json().catch(() => null))
  if (!body.success || request.headers.get('X-Idempotency-Key') !== body.data.requestId) {
    return contentNoStoreJson({ error: 'Geçersiz TYT Sosyal yayın isteği' }, { status: 400 })
  }

  let data: unknown
  let error: { code?: string } | null
  try {
    ({ data, error } = await tytSocialExamRoleRpc(
      context.client,
      'release_tyt_social_mastery_scope',
      {
        p_actor_user_id: context.userId,
        p_expected_source_evidence_sha256: body.data.expectedSourceEvidenceSha256,
        p_expected_active_question_count: body.data.expectedActiveQuestionCount,
        p_request_id: body.data.requestId,
      },
    ))
  } catch {
    return contentNoStoreJson({ error: 'TYT Sosyal kapsamı yayınlanamadı' }, { status: 500 })
  }
  if (error) {
    return contentNoStoreJson(
      { error: 'TYT Sosyal kapsamı yayınlanamadı' },
      { status: contentGovernanceRpcStatus(error.code) },
    )
  }
  const result = releaseTytSocialResultSchema.safeParse(data)
  return result.success
    ? contentNoStoreJson(result.data)
    : contentNoStoreJson({ error: 'TYT Sosyal kapsamı yayınlanamadı' }, { status: 500 })
}
