import { z } from 'zod'
import { requireContentGovernanceContext } from '@/lib/content-governance/route-context'
import { contentGovernanceReadLimiter } from '@/lib/content-governance/rate-limits'
import { contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { QUESTION_QUALITY_POLICY_VERSION } from '@/lib/question-audit/orchestrator'
import { buildFiveModelReport, type FiveModelRunRow } from '@/lib/question-audit/five-model-report'

const uuid = z.string().uuid()
const querySchema = z.object({ questionId: uuid.optional(), revisionId: uuid.optional() }).strict().superRefine((value, ctx) => {
  if (Boolean(value.questionId) === Boolean(value.revisionId)) ctx.addIssue({ code: 'custom', message: 'Tam olarak bir hedef gerekli' })
})
const contentSchema = z.object({ question: z.string().optional(), sentence: z.string().optional(), options: z.array(z.string()).min(2).max(5), answer: z.number().int().optional(), correct: z.number().int().optional() }).passthrough()
const revisionSchema = z.object({ id: uuid, question_id: uuid, content_sha256: z.string().regex(/^[0-9a-f]{64}$/), status: z.string(), content: contentSchema })
const runSchema = z.object({ question_id: uuid, revision_id: uuid.nullable(), content_sha256: z.string().regex(/^[0-9a-f]{64}$/), agent: z.string(), sample_index: z.number().int(), provider_id: z.string().nullable(), model_id: z.string(), prompt_version: z.string(), policy_version: z.string().nullable(), generation_config: z.unknown(), generation_config_sha256: z.string().nullable(), run_id: uuid, status: z.string(), parsed_output: z.unknown(), input_snapshot: z.unknown(), executed_at: z.string().nullable() })
const permissions = ['content.prepare', 'content.review.stage1', 'content.review.stage2', 'content.publish', 'content.appeals.manage', 'content.corrections.apply', 'content.psychometrics.refresh'] as const

/** Salt-okunur insan inceleme yardimcisi; AI sonuclariyla onay/yayin yapmaz. */
export async function GET(request: Request) {
  const context = await requireContentGovernanceContext(request, contentGovernanceReadLimiter, permissions)
  if (!context.ok) return context.response
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return contentNoStoreJson({ error: 'Geçersiz model raporu sorgusu' }, { status: 400 })
  let revisionId = parsed.data.revisionId
  let requestedQuestionId: string | undefined
  if (parsed.data.questionId) {
    const { data: question, error } = await context.admin.from('questions').select('id,published_revision_id').eq('id', parsed.data.questionId).maybeSingle()
    if (error) return contentNoStoreJson({ error: 'Soru hedefi alınamadı' }, { status: 500 })
    if (!question) return contentNoStoreJson({ error: 'Soru bulunamadı' }, { status: 404 })
    if (!question.published_revision_id) return contentNoStoreJson({ error: 'Yayımlanmış soru revizyonu bulunamadı' }, { status: 404 })
    if (question.id !== parsed.data.questionId) return contentNoStoreJson({ error: 'Soru hedefi güvenli olarak doğrulanamadı' }, { status: 500 })
    requestedQuestionId = question.id
    revisionId = question.published_revision_id
  }
  const { data: rawRevision, error: revisionError } = await context.admin.from('question_content_revisions').select('id,question_id,content_sha256,status,content').eq('id', revisionId!).maybeSingle()
  if (revisionError) return contentNoStoreJson({ error: 'Soru revizyonu alınamadı' }, { status: 500 })
  if (!rawRevision) return contentNoStoreJson({ error: 'Soru revizyonu bulunamadı' }, { status: 404 })
  const revision = revisionSchema.safeParse(rawRevision)
  if (!revision.success || revision.data.id !== revisionId || (requestedQuestionId !== undefined && (revision.data.question_id !== requestedQuestionId || revision.data.status !== 'published'))) return contentNoStoreJson({ error: 'Soru revizyonu güvenli olarak doğrulanamadı' }, { status: 500 })
  const content = revision.data.content
  const questionText = (content.question ?? content.sentence ?? '').trim()
  const markedAnswerIndex = content.answer ?? content.correct
  if (!questionText || markedAnswerIndex === undefined || markedAnswerIndex < 0 || markedAnswerIndex >= content.options.length) return contentNoStoreJson({ error: 'Soru revizyonu güvenli rapor için geçersiz' }, { status: 500 })
  const { data: rawRuns, error: runsError } = await context.admin.from('question_validation_runs')
    .select('question_id,revision_id,content_sha256,agent,sample_index,provider_id,model_id,prompt_version,policy_version,generation_config,generation_config_sha256,run_id,status,parsed_output,input_snapshot,executed_at')
    .eq('question_id', revision.data.question_id).eq('revision_id', revision.data.id).eq('content_sha256', revision.data.content_sha256).eq('policy_version', QUESTION_QUALITY_POLICY_VERSION).eq('agent', 'blind_solver').order('executed_at', { ascending: false }).limit(201)
  if (runsError) return contentNoStoreJson({ error: 'Model raporu alınamadı' }, { status: 500 })
  const capped = (rawRuns?.length ?? 0) > 200
  const rows = z.array(runSchema).safeParse((rawRuns ?? []).slice(0, 200))
  if (!rows.success) return contentNoStoreJson({ error: 'Model raporu güvenli olarak okunamadı' }, { status: 500 })
  return contentNoStoreJson({ report: buildFiveModelReport({ questionId: revision.data.question_id, revisionId: revision.data.id, contentSha256: revision.data.content_sha256, policyVersion: QUESTION_QUALITY_POLICY_VERSION, revisionStatus: revision.data.status, questionText, options: content.options, markedAnswerIndex }, rows.data as FiveModelRunRow[], capped) })
}
