import { z } from 'zod'
import { requireContentGovernanceContext } from '@/lib/content-governance/route-context'
import { contentGovernanceReadLimiter } from '@/lib/content-governance/rate-limits'
import { contentNoStoreJson } from '@/lib/content-governance/server-contract'

const querySchema = z.object({
  game: z.enum(['wordquest', 'matematik', 'turkce', 'fen', 'sosyal']),
  category: z.string().trim().min(1).max(80),
}).strict()
const resultSchema = z.object({ outcomes: z.array(z.object({
  id: z.string().uuid(), code: z.string().max(80), title: z.string().max(200), category: z.string().max(80),
}).strict()).max(200) }).strict()

export async function GET(request: Request) {
  const context = await requireContentGovernanceContext(request, contentGovernanceReadLimiter, 'content.prepare')
  if (!context.ok) return context.response
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!query.success) return contentNoStoreJson({ error: 'Geçersiz kazanım sorgusu' }, { status: 400 })
  const { data, error } = await context.admin
    .from('curriculum_outcomes')
    .select('id,code,title,category')
    .eq('game', query.data.game)
    .eq('category', query.data.category)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
    .limit(200)
  if (error) return contentNoStoreJson({ error: 'Kazanımlar alınamadı' }, { status: 500 })
  const result = resultSchema.safeParse({ outcomes: data ?? [] })
  return result.success
    ? contentNoStoreJson(result.data)
    : contentNoStoreJson({ error: 'Kazanımlar alınamadı' }, { status: 500 })
}
