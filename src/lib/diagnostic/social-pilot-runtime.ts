import 'server-only'
import { z } from 'zod'
import { replaySocialPilotSession } from './social-pilot-session'
import { SOCIAL_DISCOVERY_DESCRIPTION, SOCIAL_DISCOVERY_LABEL, socialPilotPublicSchema } from './social-pilot-public'

const rowSchema = z.object({
  id: z.string().uuid(), game: z.literal('sosyal'), exam_ref: z.literal('TYT'),
  category: z.enum(['tarih', 'cografya', 'felsefe', 'sosyoloji']),
  difficulty: z.number().int().min(1).max(5),
  published_revision_id: z.string().uuid(), content_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  content: z.record(z.string(), z.unknown()),
})
const responseSchema = z.object({
  questionId: z.string().uuid(), revisionId: z.string().uuid(),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  selectedOptionIndex: z.number().int().min(0).max(4),
})
const contextSchema = z.object({
  enabled: z.boolean(), packId: z.string().uuid().nullable(),
  rows: z.array(rowSchema).max(24),
  session: z.object({
    id: z.string().uuid(), status: z.enum(['active', 'completed', 'abandoned', 'expired']),
    expiresAt: z.string().datetime({ offset: true }), currentQuestionId: z.string().uuid().nullable(),
    answeredCount: z.number().int().min(0).max(12),
    rows: z.array(rowSchema).length(24), responses: z.array(responseSchema).max(12),
  }).nullable(),
})
export type SocialPilotContext = z.infer<typeof contextSchema>
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}'
  return JSON.stringify(value) ?? 'undefined'
}
export function parseSocialPilotContext(value: unknown): SocialPilotContext {
  const context = contextSchema.parse(value)
  if (!context.enabled) {
    if (context.packId || context.session || context.rows.length) throw new Error('Invalid disabled pilot')
    return context
  }
  if (!context.packId || context.rows.length !== 24) throw new Error('Invalid pilot catalog')
  replaySocialPilotSession({ rows: context.rows, seed: context.packId, responses: [] })
  if (context.session) {
    const session = context.session
    const catalog = new Map(context.rows.map(row => [row.id, canonical(row)]))
    if (session.rows.some(row => catalog.get(row.id) !== canonical(row))) throw new Error('Pilot catalog/session mismatch')
    const replay = replaySocialPilotSession({ rows: session.rows, seed: session.id, responses: session.responses })
    if (session.answeredCount !== replay.answeredCount
      || (session.status === 'completed') !== replay.completed
      || (session.status === 'active' && session.currentQuestionId !== replay.nextQuestion?.questionId)
      || (session.status !== 'active' && session.currentQuestionId !== null)) throw new Error('Invalid pilot snapshot')
  }
  return context
}

export function publicSocialPilotContext(context: SocialPilotContext) {
  const base = { supported: context.enabled, label: SOCIAL_DISCOVERY_LABEL,
    description: SOCIAL_DISCOVERY_DESCRIPTION, questionCount: 12 as const }
  const session = context.session
  if (!session) return socialPilotPublicSchema.parse({ ...base, session: null })
  const replay = replaySocialPilotSession({ rows: session.rows, seed: session.id, responses: session.responses })
  const expired = session.status === 'active' && Date.parse(session.expiresAt) <= Date.now()
  const status = expired ? 'expired' : session.status
  const next = status === 'active' ? replay.nextQuestion : null
  return socialPilotPublicSchema.parse({ ...base, session: {
    id: session.id, status, expiresAt: session.expiresAt, answeredCount: replay.answeredCount,
    question: next ? { id: next.questionId, category: next.category, question: next.questionText,
      passage: next.passage, options: next.options } : null,
    observations: status === 'completed' ? replay.observations : null,
  } })
}
