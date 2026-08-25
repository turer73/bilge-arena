import { z } from 'zod'
import { requireContentGovernanceContext } from '@/lib/content-governance/route-context'
import { contentGovernanceReadLimiter } from '@/lib/content-governance/rate-limits'
import { contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { loadValidatedOutcomeScopes, type OutcomeScopeRow } from '@/lib/content-governance/curriculum-scope'

const querySchema = z.object({
  game: z.enum(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal']),
  category: z.string().trim().min(1).max(80),
  examRef: z.enum(['TYT', 'LGS', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ', 'YDT']).optional(),
  scope: z.literal('general').optional(),
}).strict().refine((value) => !(value.examRef && value.scope), {
  message: 'examRef and general scope are mutually exclusive',
})
const resultSchema = z.object({ outcomes: z.array(z.object({
  id: z.string().uuid(), code: z.string().max(80), title: z.string().max(200), category: z.string().max(80),
  examRef: z.string().max(20).nullable(), taxonomyVersion: z.string().max(80),
}).strict()).max(200) }).strict()

type OutcomeRow = {
  id: string
  code: string
  title: string
  game: string
  category: string
  exam_ref: string | null
  node_id: string | null
  taxonomy_version: string | null
  is_active: boolean
}

export async function GET(request: Request) {
  const context = await requireContentGovernanceContext(request, contentGovernanceReadLimiter, 'content.prepare')
  if (!context.ok) return context.response
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return contentNoStoreJson({ error: 'Geçersiz kazanım sorgusu' }, { status: 400 })
  let outcomesQuery = context.admin
    .from('curriculum_outcomes')
    .select('id,code,title,game,category,exam_ref,node_id,taxonomy_version,is_active')
    .eq('game', query.data.game)
    .eq('category', query.data.category)
    .eq('is_active', true)

  if (query.data.examRef) outcomesQuery = outcomesQuery.eq('exam_ref', query.data.examRef)
  else if (query.data.scope === 'general') outcomesQuery = outcomesQuery.is('exam_ref', null)

  const { data, error } = await outcomesQuery
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
    .limit(200)
  if (error) return contentNoStoreJson({ error: 'Kazanımlar alınamadı' }, { status: 500 })

  const candidates = (data ?? []) as OutcomeRow[]
  const validated = await loadValidatedOutcomeScopes(context.admin, candidates as OutcomeScopeRow[])
  if (validated.error || !validated.data) {
    return contentNoStoreJson({ error: 'Kazanımlar alınamadı' }, { status: 500 })
  }
  const outcomes = candidates.flatMap((outcome) => {
    if (!validated.data?.has(outcome.id)) return []
    return [{
      id: outcome.id,
      code: outcome.code,
      title: outcome.title,
      category: outcome.category,
      examRef: outcome.exam_ref,
      taxonomyVersion: outcome.taxonomy_version,
    }]
  })
  const result = resultSchema.safeParse({ outcomes })
  return result.success
    ? contentNoStoreJson(result.data)
    : contentNoStoreJson({ error: 'Kazanımlar alınamadı' }, { status: 500 })
}
