import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Sohbet geçmişindeki asistan turlarının imzası.
 *
 * Geçmiş istemcide yaşar; sunucuda tutulmaz (kullanıcıların çoğu reşit değil,
 * sohbet metnini saklamamak bilinçli). Bu yüzden istemcinin "assistant" diye
 * gönderdiği her tur, bu sunucunun ürettiği ve aynı kullanıcıya imzaladığı bir
 * yanıt olmalı. İmzasız tur sağlayıcıya gitmez: sahte asistan turuyla prompt
 * enjeksiyonu ve 50 × 8.000 karakterlik maliyet şişirmesi böyle kapanır.
 */
const SIGNING_DOMAIN = 'chat-turn.v1'
export const CHAT_TURN_TTL_SECONDS = 24 * 60 * 60
const SIGNATURE_FORMAT = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/

function turnSecret(): string | null {
  const candidates = [
    process.env.CHAT_TURN_SECRET,
    process.env.QUESTION_GRADING_SECRET,
    process.env.ACTIVATION_REWARD_SECRET,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]
  const configured = candidates.find((value) => value?.trim().length && value.trim().length >= 32)
  if (configured) return configured.trim()
  if (process.env.NODE_ENV !== 'production') return 'bilge-arena-local-chat-turn-secret'
  return null
}

/** Alan etiketi, diğer token'larla aynı gizli anahtarı paylaşan imzaların takasını önler. */
function turnMac(secret: string, userId: string, issuedAt: number, content: string): Buffer {
  const contentHash = createHash('sha256').update(content, 'utf8').digest('hex')
  return createHmac('sha256', secret)
    .update(`${SIGNING_DOMAIN}|${userId}|${issuedAt}|${contentHash}`)
    .digest()
}

export function signAssistantTurn(userId: string, content: string, now = Date.now()): string | null {
  const secret = turnSecret()
  if (!secret) return null
  const issuedAt = Math.floor(now / 1000)
  return `v1.${issuedAt}.${turnMac(secret, userId, issuedAt, content).toString('base64url')}`
}

export function verifyAssistantTurn(
  userId: string,
  content: string,
  signature: string | null | undefined,
  now = Date.now(),
): boolean {
  const secret = turnSecret()
  const parsed = signature ? SIGNATURE_FORMAT.exec(signature) : null
  if (!secret || !parsed) return false

  const issuedAt = Number(parsed[1])
  const nowSeconds = Math.floor(now / 1000)
  if (issuedAt > nowSeconds + 60 || nowSeconds - issuedAt > CHAT_TURN_TTL_SECONDS) return false

  const supplied = Buffer.from(parsed[2]!, 'base64url')
  const expected = turnMac(secret, userId, issuedAt, content)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
