import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getFirstQuestionAttempt } from '@/lib/questions/attempt-store'

export const ACTIVATION_REWARD_COOKIE = 'ba_activation_reward'
export const ACTIVATION_REWARD_TTL_SECONDS = 2 * 60 * 60
export const ACTIVATION_XP_PER_CORRECT = 50

/** Alan ayrimi etiketi (bkz. lib/questions/guest-grading-session.ts). */
const TOKEN_PURPOSE = 'activation-reward'
const SIGNING_DOMAIN = `${TOKEN_PURPOSE}.v1`

const tokenSchema = z.object({
  version: z.literal(1),
  purpose: z.literal(TOKEN_PURPOSE),
  sessionId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()).min(1).max(3),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
}).strict()

const questionContentSchema = z.object({
  options: z.array(z.string()).min(2).max(5),
  answer: z.number().int().min(0).max(4).optional(),
  correct: z.number().int().min(0).max(4).optional(),
}).passthrough().refine(
  (content) => content.answer !== undefined || content.correct !== undefined,
  { message: 'answer key required' },
).refine(
  (content) => content.answer === undefined
    || content.correct === undefined
    || content.answer === content.correct,
  { message: 'conflicting answer keys' },
).refine(
  (content) => (content.answer ?? content.correct ?? -1) < content.options.length,
  { message: 'answer key outside options' },
)

const claimResultSchema = z.object({
  xpAwarded: z.number().int().nonnegative().max(150),
  alreadyProcessed: z.boolean(),
})

export type ActivationRewardToken = z.infer<typeof tokenSchema>
type AdminClient = ReturnType<typeof createServiceRoleClient>

function rewardSecret(): string | null {
  const configured = process.env.ACTIVATION_REWARD_SECRET?.trim()
  if (configured && configured.length >= 32) return configured
  if (process.env.NODE_ENV !== 'production') return 'bilge-arena-local-activation-secret-only'
  return null
}

function signature(encoded: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`${SIGNING_DOMAIN}|${encoded}`).digest()
}

export function createActivationRewardToken(questionIds: string[]): string | null {
  const secret = rewardSecret()
  const uniqueQuestionIds = [...new Set(questionIds)]
  if (uniqueQuestionIds.length !== questionIds.length) return null
  const parsedQuestionIds = z.array(z.string().uuid()).min(1).max(3)
    .safeParse(uniqueQuestionIds)
  if (!secret || !parsedQuestionIds.success) return null

  const now = Date.now()
  const payload: ActivationRewardToken = {
    version: 1,
    purpose: TOKEN_PURPOSE,
    sessionId: randomUUID(),
    questionIds: parsedQuestionIds.data,
    issuedAt: now,
    expiresAt: now + ACTIVATION_REWARD_TTL_SECONDS * 1000,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded, secret).toString('base64url')}`
}

export function verifyActivationRewardToken(raw: string | null | undefined): ActivationRewardToken | null {
  const secret = rewardSecret()
  if (!secret || !raw) return null
  const parts = raw.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null

  try {
    const suppliedSignature = Buffer.from(parts[1], 'base64url')
    const expectedSignature = signature(parts[0], secret)
    if (
      suppliedSignature.length !== expectedSignature.length
      || !timingSafeEqual(suppliedSignature, expectedSignature)
    ) return null

    const decoded = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    const parsed = tokenSchema.safeParse(decoded)
    if (!parsed.success) return null
    if (parsed.data.expiresAt <= Date.now() || parsed.data.issuedAt > Date.now() + 60_000) return null
    return parsed.data
  } catch {
    return null
  }
}

export function readActivationRewardCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=')
    if (separator < 0) continue
    if (entry.slice(0, separator).trim() !== ACTIVATION_REWARD_COOKIE) continue
    try {
      return decodeURIComponent(entry.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

export function activationActorKey(sessionId: string): string {
  return `activation:${sessionId}`
}

export async function claimActivationReward(
  admin: AdminClient,
  userId: string,
  rawToken: string | null | undefined,
): Promise<{ xpAwarded: number; alreadyProcessed: boolean } | null> {
  const token = verifyActivationRewardToken(rawToken)
  if (!token) return null

  const attempts = await Promise.all(token.questionIds.map((questionId) =>
    getFirstQuestionAttempt(activationActorKey(token.sessionId), questionId)
  ))
  if (attempts.some((attempt) => attempt === null)) return null

  const { data, error } = await admin
    .from('questions')
    .select('id, content')
    .in('id', token.questionIds)
  if (error || !data || data.length !== token.questionIds.length) {
    throw new Error('activation_question_lookup_failed')
  }

  const questions = new Map(data.map((row) => [row.id, row.content]))
  let correctCount = 0
  token.questionIds.forEach((questionId, index) => {
    const content = questionContentSchema.safeParse(questions.get(questionId))
    if (!content.success) throw new Error('activation_question_content_invalid')
    const correctOption = content.data.answer ?? content.data.correct
    if (attempts[index] === correctOption) correctCount += 1
  })

  const { data: claimData, error: claimError } = await admin.rpc('claim_activation_reward', {
    p_user_id: userId,
    p_claim_id: token.sessionId,
    p_amount: correctCount * ACTIVATION_XP_PER_CORRECT,
  })
  if (claimError) throw new Error('activation_reward_rpc_failed')

  const parsed = claimResultSchema.safeParse(claimData)
  if (!parsed.success) throw new Error('activation_reward_result_invalid')
  return parsed.data
}
