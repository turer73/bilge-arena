import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const GUEST_GRADING_COOKIE = 'ba_guest_grading'
export const GUEST_GRADING_TTL_SECONDS = 2 * 60 * 60

/** Alan ayrimi etiketi: imza girdisine karisir, semada da dogrulanir. */
const TOKEN_PURPOSE = 'guest-grading'
const SIGNING_DOMAIN = `${TOKEN_PURPOSE}.v1`

const tokenSchema = z.object({
  version: z.literal(1),
  purpose: z.literal(TOKEN_PURPOSE),
  sessionId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()).min(1).max(3),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
}).strict()

export type GuestGradingToken = z.infer<typeof tokenSchema>

function gradingSecret(): string | null {
  const candidates = [
    process.env.QUESTION_GRADING_SECRET,
    process.env.ACTIVATION_REWARD_SECRET,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]
  const configured = candidates.find((value) => value?.trim().length && value.trim().length >= 32)
  if (configured) return configured.trim()
  if (process.env.NODE_ENV !== 'production') return 'bilge-arena-local-guest-grading-secret'
  return null
}

/**
 * Imza girdisi alan etiketiyle baslar. Bu olmadan misafir-puanlama ve
 * activation-odul token'lari BIREBIR takas edilebiliyordu: iki sema ayni
 * alanlara sahip (.strict()), iki imza ayni ham `encoded` uzerinden
 * uretiliyordu ve gizli anahtar zinciri ACTIVATION_REWARD_SECRET'i
 * paylasabiliyordu. Etiket + semadaki `purpose` alani iki katmanli kapatir.
 */
function signature(encoded: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`${SIGNING_DOMAIN}|${encoded}`).digest()
}

export function createGuestGradingToken(questionIds: string[]): string | null {
  const secret = gradingSecret()
  const uniqueQuestionIds = [...new Set(questionIds)]
  const parsedQuestionIds = z.array(z.string().uuid()).min(1).max(3).safeParse(uniqueQuestionIds)
  if (!secret || uniqueQuestionIds.length !== questionIds.length || !parsedQuestionIds.success) return null

  const now = Date.now()
  const payload: GuestGradingToken = {
    version: 1,
    purpose: TOKEN_PURPOSE,
    sessionId: randomUUID(),
    questionIds: parsedQuestionIds.data,
    issuedAt: now,
    expiresAt: now + GUEST_GRADING_TTL_SECONDS * 1000,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded, secret).toString('base64url')}`
}

export function verifyGuestGradingToken(raw: string | null | undefined): GuestGradingToken | null {
  const secret = gradingSecret()
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

export function readGuestGradingCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const entry of cookieHeader.split(';')) {
    const separator = entry.indexOf('=')
    if (separator < 0) continue
    if (entry.slice(0, separator).trim() !== GUEST_GRADING_COOKIE) continue
    try {
      return decodeURIComponent(entry.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

export function guestGradingActorKey(sessionId: string): string {
  return `guest:${sessionId}`
}
