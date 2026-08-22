import { z } from 'zod'
import { requireContentGovernanceContext } from '@/lib/content-governance/route-context'
import { contentGovernanceReadLimiter } from '@/lib/content-governance/rate-limits'
import { contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { QUESTION_QUALITY_POLICY_VERSION } from '@/lib/question-audit/orchestrator'

/**
 * Otomatik dogrulama verdict'ine gore soru listesi.
 *
 * NEDEN AYRI ENDPOINT:
 *   /admin/sorular listesi `search_questions` RPC'sinden geliyor ve o RPC
 *   verdict bilmiyor; oraya join eklemek paylasilan bir fonksiyonu degistirmek
 *   demek. Mevcut governance kuyrugu ise EDITORYAL duruma gore filtreliyor
 *   (draft/stage1_approved/...), otomatik karara gore degil. Bu iki eksen
 *   farkli: bir soru editoryal olarak `published` iken otomatik denetimde
 *   NEEDS_REVIEW olabilir. Ayri eksen, ayri sorgu.
 *
 * POLICY VERSION: varsayilan olarak KODUN mevcut surumu filtrelenir. Eski
 * surumle uretilmis kararlar farkli bir esikle olusmustur ve ayni listede
 * gosterilirse yaniltir.
 */
const querySchema = z.object({
  verdict: z.enum(['APPROVED', 'REJECTED', 'NEEDS_REVIEW', 'INCONCLUSIVE']),
  policyVersion: z.string().max(100).optional(),
  activeOnly: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
}).strict()

const rowSchema = z.object({
  question_id: z.string().uuid(),
  verdict: z.enum(['APPROVED', 'REJECTED', 'NEEDS_REVIEW', 'INCONCLUSIVE']),
  policy_version: z.string(),
  rationale: z.string(),
  findings: z.array(z.object({
    code: z.string(),
    evidence: z.string(),
    optionIndexes: z.array(z.number().int()).optional(),
  })).default([]),
  blind_agreement_ratio: z.number().nullable(),
  decided_at: z.string(),
  questions: z.object({
    game: z.string(), category: z.string(), is_active: z.boolean(),
  }).nullable(),
}).passthrough()

export async function GET(request: Request) {
  const context = await requireContentGovernanceContext(request, contentGovernanceReadLimiter, [
    'content.prepare', 'content.review.stage1', 'content.review.stage2', 'content.publish',
    'content.appeals.manage', 'content.corrections.apply', 'content.psychometrics.refresh',
  ])
  if (!context.ok) return context.response

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return contentNoStoreJson({ error: 'Geçersiz doğrulama sorgusu' }, { status: 400 })
  const { verdict, policyVersion, activeOnly, limit, offset } = parsed.data

  let query = context.admin
    .from('question_validation_decisions')
    .select('question_id,verdict,policy_version,rationale,findings,blind_agreement_ratio,decided_at,questions(game,category,is_active)', { count: 'exact' })
    .eq('verdict', verdict)
    .eq('policy_version', policyVersion ?? QUESTION_QUALITY_POLICY_VERSION)
    .order('decided_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (activeOnly === 'true') query = query.eq('questions.is_active', true)
  if (activeOnly === 'false') query = query.eq('questions.is_active', false)

  const { data, error, count } = await query
  if (error) {
    console.error('[content-quality/validation]', error.message)
    return contentNoStoreJson({ error: 'Doğrulama verisi alınamadı' }, { status: 500 })
  }

  const rows = z.array(rowSchema).safeParse(data ?? [])
  if (!rows.success) return contentNoStoreJson({ error: 'Doğrulama verisi alınamadı' }, { status: 500 })

  // Ham model ciktisi (raw_output) ve prompt/model kimligi DISARI CIKMAZ:
  // reviewer'a yalniz tiplenmis bulgu ve gerekce gider.
  return contentNoStoreJson({
    total: count ?? 0,
    policyVersion: policyVersion ?? QUESTION_QUALITY_POLICY_VERSION,
    items: rows.data.map((r) => ({
      questionId: r.question_id,
      verdict: r.verdict,
      game: r.questions?.game ?? null,
      category: r.questions?.category ?? null,
      isActive: r.questions?.is_active ?? null,
      findingCodes: r.findings.map((f) => f.code),
      findings: r.findings,
      rationale: r.rationale,
      blindAgreementRatio: r.blind_agreement_ratio,
      decidedAt: r.decided_at,
    })),
  })
}
