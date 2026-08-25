import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceReadLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson, queueSchema, revisionSchema } from '@/lib/content-governance/server-contract'
import { loadValidatedOutcomeScopes, type OutcomeScopeRow } from '@/lib/content-governance/curriculum-scope'

const querySchema = z.object({
  status: z.enum(['draft', 'stage1_approved', 'stage2_approved', 'published', 'rejected', 'superseded']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().max(500).default(''),
  revisionId: z.string().uuid().optional(), questionId: z.string().uuid().optional(),
}).strict().refine((value) => !(value.revisionId && value.questionId))
export async function GET(request: Request) {
  const context = await requireContentGovernanceContext(request, contentGovernanceReadLimiter, [
    'content.prepare', 'content.review.stage1', 'content.review.stage2', 'content.publish',
    'content.appeals.manage', 'content.corrections.apply', 'content.psychometrics.refresh',
  ])
  if (!context.ok) return context.response
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return contentNoStoreJson({ error: 'Geçersiz kalite sorgusu' }, { status: 400 })
  const { revisionId, questionId, ...input } = parsed.data
  const rpc = revisionId ? 'get_question_content_revision' : questionId ? 'get_published_question_content_revision' : 'get_question_content_governance_queue'
  const args = revisionId
    ? { p_user_id: context.userId, p_revision_id: revisionId }
    : questionId
      ? { p_user_id: context.userId, p_question_id: questionId }
      : { p_user_id: context.userId, p_status: input.status ?? null, p_limit: input.limit, p_cursor: input.cursor }
  const { data, error } = await contentRpc(context.admin, rpc, args)
  if (error) return contentNoStoreJson({ error: 'Kalite verisi alınamadı' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = (revisionId || questionId ? revisionSchema : queueSchema).safeParse(data)
  if (!result.success) return contentNoStoreJson({ error: 'Kalite verisi alınamadı' }, { status: 500 })
  if (!revisionId && !questionId) return contentNoStoreJson(result.data)

  const revisionResult = result.data as z.infer<typeof revisionSchema>
  const mappings = revisionResult.revision.outcomes
  if (mappings.length === 0) return contentNoStoreJson(revisionResult)
  const { data: outcomeRows, error: outcomeError } = await context.admin
    .from('curriculum_outcomes')
    .select('id,code,title,game,category,exam_ref,node_id,taxonomy_version,is_active')
    .in('id', mappings.map((mapping) => mapping.outcomeId))
  if (outcomeError) return contentNoStoreJson({ error: 'Kalite verisi alınamadı' }, { status: 500 })

  const rows = (outcomeRows ?? []) as OutcomeScopeRow[]
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  const validated = await loadValidatedOutcomeScopes(context.admin, rows)
  if (validated.error || !validated.data) {
    return contentNoStoreJson({ error: 'Kalite verisi alınamadı' }, { status: 500 })
  }
  const enriched = revisionSchema.safeParse({
    revision: {
      ...revisionResult.revision,
      outcomes: mappings.map((mapping) => {
        const row = rowsById.get(mapping.outcomeId)
        const scope = validated.data?.get(mapping.outcomeId)
        const revisionScopeValid = Boolean(
          scope
          && row
          && row.game === revisionResult.revision.metadata.game
          && row.category === revisionResult.revision.metadata.category
          && row.exam_ref === (revisionResult.revision.metadata.examRef ?? null),
        )
        return {
          ...mapping,
          ...(row?.code ? { code: row.code } : {}),
          ...(row?.title ? { title: row.title } : {}),
          examRef: row?.exam_ref ?? null,
          ...(row?.taxonomy_version ? { taxonomyVersion: row.taxonomy_version } : {}),
          scopeValid: revisionScopeValid,
          path: scope?.path.slice().reverse().map((node) => ({
            code: node.code, title: node.title,
            nodeType: node.node_type as 'course' | 'unit' | 'topic' | 'outcome',
          })) ?? [],
        }
      }),
    },
  })
  return enriched.success
    ? contentNoStoreJson(enriched.data)
    : contentNoStoreJson({ error: 'Kalite verisi alınamadı' }, { status: 500 })
}
