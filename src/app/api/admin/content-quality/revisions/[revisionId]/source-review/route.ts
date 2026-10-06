import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceReadLimiter, contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import { contentGovernanceRpcStatus, contentNoStoreJson, revisionReviewResultSchema } from '@/lib/content-governance/server-contract'
import { sourceReviewDraftSchema, sourceReviewInputSchema, sourceReviewStatusSchema, SOURCE_REVIEW_MAX_BYTES } from '@/lib/content-governance/source-review-contract'
import { evaluateSourceComparison } from '@/lib/question-audit/source-comparison'
import { toDraft } from '@/lib/question-audit/question-source'

type RouteContext = { params: Promise<{ revisionId: string }> }
export async function GET(request: Request, { params }: RouteContext) {
  const context = await requireContentGovernanceContext(request, contentGovernanceReadLimiter,
    ['content.prepare', 'content.review.stage1', 'content.review.stage2', 'content.publish'])
  if (!context.ok) return context.response
  const id = z.string().uuid().safeParse((await params).revisionId)
  if (!id.success) return contentNoStoreJson({ error: 'Geçersiz revizyon' }, { status: 400 })
  const { data, error } = await contentRpc(context.admin, 'get_question_revision_source_review', { p_user_id: context.userId, p_revision_id: id.data })
  if (error) return contentNoStoreJson({ error: 'Kaynak kabulü alınamadı' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = sourceReviewStatusSchema.safeParse(data)
  if (!result.success || result.data.revisionId !== id.data) return contentNoStoreJson({ error: 'Kaynak kabulü alınamadı' }, { status: 500 })
  return contentNoStoreJson(result.data)
}

// Bound streamed input too: Content-Length is not a trusted request size limit.
async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) return null
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > SOURCE_REVIEW_MAX_BYTES) { await reader.cancel(); throw new Error('REPORT_TOO_LARGE') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } finally { reader.releaseLock() }
}

export async function POST(request: Request, { params }: RouteContext) {
  const context = await requireContentGovernanceContext(request, contentGovernanceWriteLimiter, 'content.review.stage1')
  if (!context.ok) return context.response
  const id = z.string().uuid().safeParse((await params).revisionId)
  if (!id.success) return contentNoStoreJson({ error: 'Geçersiz revizyon' }, { status: 400 })
  let raw: unknown
  try { raw = await readBody(request) }
  catch (error) {
    return contentNoStoreJson({ error: 'Geçersiz veya fazla büyük kaynak raporu' },
      { status: error instanceof Error && error.message === 'REPORT_TOO_LARGE' ? 413 : 400 })
  }
  const body = sourceReviewInputSchema.safeParse(raw)
  if (!body.success) return contentNoStoreJson({ error: 'Geçersiz kaynak kabul isteği' }, { status: 400 })
  const snapshot = await contentRpc(context.admin, 'get_question_revision_source_review', { p_user_id: context.userId, p_revision_id: id.data })
  if (snapshot.error) return contentNoStoreJson({ error: 'Revizyon okunamadı' }, { status: contentGovernanceRpcStatus(snapshot.error.code) })
  const row = sourceReviewDraftSchema.safeParse((snapshot.data as { draft?: unknown } | null)?.draft)
  if (!row.success || row.data.published_revision_id !== id.data) return contentNoStoreJson({ error: 'Revizyon kanıtı doğrulanamadı' }, { status: 500 })
  const normalized = toDraft(row.data, { strictExamOptionCount: true })
  if (!normalized.ok) return contentNoStoreJson({ error: 'Soru yapısal kontrolü geçmedi' }, { status: 409 })
  const evaluation = evaluateSourceComparison(normalized.draft, body.data.report)
  if (evaluation.status !== 'evidence_complete') return contentNoStoreJson({
    error: 'Kaynak karşılaştırması tamamlanmadı', status: evaluation.status,
    issues: evaluation.issues, conflicts: evaluation.conflicts,
  }, { status: 409 })
  const { data, error } = await contentRpc(context.admin, 'accept_question_revision_source_review', {
    p_user_id: context.userId, p_revision_id: id.data, p_report: body.data.report,
    p_rationale: body.data.rationale, p_request_id: body.data.requestId,
  })
  if (error) return contentNoStoreJson({ error: 'Kaynak kabulü kaydedilemedi' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = revisionReviewResultSchema.safeParse(data)
  if (!result.success || result.data.revisionId !== id.data || result.data.status !== 'stage1_approved') return contentNoStoreJson({ error: 'Kaynak kabulü kaydedilemedi' }, { status: 500 })
  return contentNoStoreJson({ ...result.data, warnings: evaluation.warnings })
}
