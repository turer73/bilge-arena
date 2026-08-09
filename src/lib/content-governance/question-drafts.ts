import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import { contentRpc } from './route-context'

type ServiceClient = ReturnType<typeof createServiceRoleClient>
type SourceKind = 'original' | 'licensed' | 'public_domain' | 'user_generated' | 'official_exam'

export interface GovernedQuestionDraftInput {
  actorId: string
  requestId: string
  content: Record<string, unknown>
  metadata: {
    game: string
    category: string
    subcategory?: string | null
    topic?: string | null
    difficulty: number
    levelTag?: string | null
    examRef?: string | null
    isBoss?: boolean
  }
  outcomeId: string
  source: {
    kind: SourceKind
    title: string
    licenseCode: string
    attribution?: string
    provenanceRef?: string
  }
  summary: string
}

const resultSchema = z.object({
  questionId: z.string().uuid(),
  revisionId: z.string().uuid(),
  revisionNo: z.literal(1),
  status: z.literal('draft'),
  replayed: z.boolean(),
}).strip()

export async function createGovernedQuestionDraft(admin: ServiceClient, input: GovernedQuestionDraftInput) {
  const payload = {
    content: input.content,
    metadata: input.metadata,
    outcomes: [{ outcomeId: input.outcomeId, weight: 1, primary: true }],
    source: input.source,
    changeKind: 'create',
    summary: input.summary,
  }
  const { data, error } = await contentRpc(admin, 'create_governed_question', {
    p_user_id: input.actorId,
    p_payload: payload,
    p_request_id: input.requestId,
  })
  if (error) return { data: null, error }
  const parsed = resultSchema.safeParse(data)
  return parsed.success
    ? { data: parsed.data, error: null }
    : { data: null, error: { code: 'PGRST_CONTRACT' } }
}

/** Stable UUID-shaped request identity for one item in an idempotent batch. */
export function deriveGovernedQuestionRequestId(batchRequestId: string, index: number): string {
  const bytes = Buffer.from(createHash('sha256').update(`${batchRequestId}:${index}`).digest().subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
