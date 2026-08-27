import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

import type { createServiceRoleClient } from '@/lib/supabase/service-role'

export const LEGAL_CONSENT_POLICY_VERSIONS = {
  terms: 'terms@2026-03-09-v1',
  kvkk: 'kvkk-notice@2026-08-24-v1',
} as const

export const LEGAL_CONSENT_INTENT_TTL_SECONDS = 30 * 60
export const LEGAL_CONSENT_INTENT_COOKIE = 'ba_legal_consent_intent'

const PURPOSE = 'legal-consent-intent'
const SIGNING_DOMAIN = `${PURPOSE}.v1`

const tokenSchema = z.object({
  version: z.literal(1),
  purpose: z.literal(PURPOSE),
  intentId: z.string().uuid(),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  policyVersions: z.object({
    terms: z.literal(LEGAL_CONSENT_POLICY_VERSIONS.terms),
    kvkk: z.literal(LEGAL_CONSENT_POLICY_VERSIONS.kvkk),
  }).strict(),
}).strict()

export type LegalConsentIntent = z.infer<typeof tokenSchema>
type AdminClient = ReturnType<typeof createServiceRoleClient>

function signingSecret(): string | null {
  const configured = process.env.LEGAL_CONSENT_SECRET?.trim()
  if (configured && configured.length >= 32) return configured
  if (process.env.NODE_ENV !== 'production') {
    return 'bilge-arena-local-legal-consent-secret-only'
  }
  return null
}

function signature(encoded: string, secret: string): Buffer {
  return createHmac('sha256', secret)
    .update(`${SIGNING_DOMAIN}|${encoded}`)
    .digest()
}

export function createLegalConsentIntentToken(): string | null {
  const secret = signingSecret()
  if (!secret) return null

  const now = Date.now()
  const payload: LegalConsentIntent = {
    version: 1,
    purpose: PURPOSE,
    intentId: randomUUID(),
    issuedAt: now,
    expiresAt: now + LEGAL_CONSENT_INTENT_TTL_SECONDS * 1000,
    policyVersions: LEGAL_CONSENT_POLICY_VERSIONS,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded, secret).toString('base64url')}`
}

export function verifyLegalConsentIntentToken(
  raw: string | null | undefined,
): LegalConsentIntent | null {
  const secret = signingSecret()
  if (!secret || !raw) return null
  const parts = raw.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null

  try {
    const supplied = Buffer.from(parts[1], 'base64url')
    const expected = signature(parts[0], secret)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return null
    }

    const decoded = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    const parsed = tokenSchema.safeParse(decoded)
    if (!parsed.success) return null
    const now = Date.now()
    if (parsed.data.expiresAt <= now || parsed.data.issuedAt > now + 60_000) return null
    return parsed.data
  } catch {
    return null
  }
}

export function legalConsentIntentMatchesCookie(
  rawToken: string | null | undefined,
  cookieToken: string | null | undefined,
): boolean {
  if (!rawToken || !cookieToken) return false
  const raw = Buffer.from(rawToken)
  const cookie = Buffer.from(cookieToken)
  return raw.length === cookie.length && timingSafeEqual(raw, cookie)
}

function currentPolicyIntent(
  row: { consent_type: string; consent_value: unknown },
  type: keyof typeof LEGAL_CONSENT_POLICY_VERSIONS,
): string | null {
  if (row.consent_type !== type || !row.consent_value || typeof row.consent_value !== 'object') {
    return null
  }
  const value = row.consent_value as Record<string, unknown>
  const intentId = z.string().uuid().safeParse(value.intentId)
  return value.accepted === true
    && value.policyVersion === LEGAL_CONSENT_POLICY_VERSIONS[type]
    && value.source === 'oauth_callback'
    && intentId.success
    ? intentId.data
    : null
}

export async function hasCurrentLegalConsent(
  admin: AdminClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('consent_logs')
    .select('consent_type, consent_value')
    .eq('user_id', userId)
    .in('consent_type', ['terms', 'kvkk'])

  if (error) throw new Error('legal_consent_lookup_failed', { cause: error })
  const rows = data ?? []
  const termsIntents = new Set(
    rows.map((row) => currentPolicyIntent(row, 'terms')).filter((value): value is string => Boolean(value)),
  )
  return rows.some((row) => {
    const intentId = currentPolicyIntent(row, 'kvkk')
    return intentId !== null && termsIntents.has(intentId)
  })
}

export async function recordLegalConsentIntent(
  admin: AdminClient,
  input: {
    userId: string
    rawToken: string | null | undefined
    ipAddress: string | null
    userAgent: string | null
  },
): Promise<boolean> {
  const token = verifyLegalConsentIntentToken(input.rawToken)
  if (!token) return false

  const existingIntentOwner = async (): Promise<string | null | false> => {
    const { data, error } = await admin
      .from('consent_logs')
      .select('user_id, consent_type, consent_value')
      .contains('consent_value', { intentId: token.intentId })
      .in('consent_type', ['terms', 'kvkk'])
    if (error) throw new Error('legal_consent_intent_lookup_failed', { cause: error })
    if (!data || data.length === 0) return null
    const complete = ['terms', 'kvkk'].every((type) => data.some((row) => (
      row.user_id === input.userId
      && row.consent_type === type
      && row.consent_value
      && typeof row.consent_value === 'object'
      && (row.consent_value as Record<string, unknown>).intentId === token.intentId
      && (row.consent_value as Record<string, unknown>).accepted === true
      && (row.consent_value as Record<string, unknown>).source === 'oauth_callback'
      && (row.consent_value as Record<string, unknown>).policyVersion
        === token.policyVersions[type as keyof typeof token.policyVersions]
    )))
    return complete ? input.userId : false
  }

  const existing = await existingIntentOwner()
  if (existing !== null) return existing === input.userId

  const common = {
    accepted: true,
    intentId: token.intentId,
    intentIssuedAt: new Date(token.issuedAt).toISOString(),
    source: 'oauth_callback',
  } as const
  const forensic = {
    user_id: input.userId,
    ip_address: input.ipAddress,
    user_agent: input.userAgent?.slice(0, 500) ?? null,
  }

  const { error } = await admin.from('consent_logs').insert([
    {
      ...forensic,
      consent_type: 'terms',
      consent_value: {
        ...common,
        policyVersion: token.policyVersions.terms,
      },
    },
    {
      ...forensic,
      consent_type: 'kvkk',
      consent_value: {
        ...common,
        policyVersion: token.policyVersions.kvkk,
      },
    },
  ])
  if (error) {
    // A concurrent callback may have consumed the signed intent between our
    // read and insert. The unique partial index decides the winner; replay is
    // valid only for the same user with both evidence rows present.
    if (error.code === '23505') {
      return await existingIntentOwner() === input.userId
    }
    throw new Error('legal_consent_insert_failed', { cause: error })
  }
  return true
}
