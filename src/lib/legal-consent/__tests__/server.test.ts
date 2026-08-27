import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createLegalConsentIntentToken,
  hasCurrentLegalConsent,
  legalConsentIntentMatchesCookie,
  recordLegalConsentIntent,
  verifyLegalConsentIntentToken,
} from '../server'

const SECRET = 'legal-consent-test-secret-at-least-32-characters'

function adminClient(input: {
  rows?: Array<{ user_id: string; consent_type: string; consent_value: unknown }>
  insertError?: { code?: string; message: string } | null
} = {}) {
  const selectResult = Promise.resolve({ data: input.rows ?? [], error: null })
  const inFilter = vi.fn(() => selectResult)
  const contains = vi.fn(() => ({ in: inFilter }))
  const eq = vi.fn(() => ({ in: inFilter }))
  const select = vi.fn(() => ({ eq, contains }))
  const insert = vi.fn().mockResolvedValue({ error: input.insertError ?? null })
  return {
    client: { from: vi.fn(() => ({ select, insert })) },
    insert,
  }
}

describe('legal consent intent', () => {
  beforeEach(() => {
    vi.stubEnv('LEGAL_CONSENT_SECRET', SECRET)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('signs, verifies, rejects tampering, and expires', () => {
    const token = createLegalConsentIntentToken()
    expect(token).toBeTruthy()
    expect(verifyLegalConsentIntentToken(token)?.purpose).toBe('legal-consent-intent')
    expect(legalConsentIntentMatchesCookie(token, token)).toBe(true)
    expect(legalConsentIntentMatchesCookie(token, `${token}x`)).toBe(false)
    expect(legalConsentIntentMatchesCookie(token, undefined)).toBe(false)
    expect(verifyLegalConsentIntentToken(`${token}x`)).toBeNull()

    vi.advanceTimersByTime(31 * 60 * 1000)
    expect(verifyLegalConsentIntentToken(token)).toBeNull()
  })

  it('fails closed in production without a dedicated legal-consent secret', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('LEGAL_CONSENT_SECRET', '')
    vi.stubEnv('ACTIVATION_REWARD_SECRET', 'activation-secret-must-not-sign-legal-evidence')

    expect(createLegalConsentIntentToken()).toBeNull()
  })

  it('records both current policy evidences for the authenticated callback user', async () => {
    const token = createLegalConsentIntentToken()
    const { client, insert } = adminClient()

    await expect(recordLegalConsentIntent(client as never, {
      userId: '00000000-0000-4000-8000-000000000001',
      rawToken: token,
      ipAddress: '203.0.113.7',
      userAgent: 'test-agent',
    })).resolves.toBe(true)

    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ consent_type: 'terms', user_id: '00000000-0000-4000-8000-000000000001' }),
      expect.objectContaining({ consent_type: 'kvkk', user_id: '00000000-0000-4000-8000-000000000001' }),
    ])
  })

  it('accepts same-user idempotency but rejects cross-user and partial intent replay', async () => {
    const ownerId = '00000000-0000-4000-8000-000000000001'
    const otherId = '00000000-0000-4000-8000-000000000002'
    const token = createLegalConsentIntentToken()
    const intentId = verifyLegalConsentIntentToken(token)?.intentId
    expect(intentId).toBeTruthy()

    const completeRows = [
      { user_id: ownerId, consent_type: 'terms', consent_value: { intentId, accepted: true, source: 'oauth_callback', policyVersion: 'terms@2026-03-09-v1' } },
      { user_id: ownerId, consent_type: 'kvkk', consent_value: { intentId, accepted: true, source: 'oauth_callback', policyVersion: 'kvkk-notice@2026-08-24-v1' } },
    ]
    const complete = adminClient({ rows: completeRows })
    await expect(recordLegalConsentIntent(complete.client as never, {
      userId: ownerId, rawToken: token, ipAddress: null, userAgent: null,
    })).resolves.toBe(true)
    expect(complete.insert).not.toHaveBeenCalled()

    await expect(recordLegalConsentIntent(complete.client as never, {
      userId: otherId, rawToken: token, ipAddress: null, userAgent: null,
    })).resolves.toBe(false)
    expect(complete.insert).not.toHaveBeenCalled()

    const partial = adminClient({ rows: completeRows.slice(0, 1) })
    await expect(recordLegalConsentIntent(partial.client as never, {
      userId: ownerId, rawToken: token, ipAddress: null, userAgent: null,
    })).resolves.toBe(false)
    expect(partial.insert).not.toHaveBeenCalled()
  })

  it('resolves a concurrent unique-index winner only for the same complete user evidence', async () => {
    const userId = '00000000-0000-4000-8000-000000000001'
    const token = createLegalConsentIntentToken()
    const intentId = verifyLegalConsentIntentToken(token)?.intentId
    const rows = [
      { user_id: userId, consent_type: 'terms', consent_value: { intentId, accepted: true, source: 'oauth_callback', policyVersion: 'terms@2026-03-09-v1' } },
      { user_id: userId, consent_type: 'kvkk', consent_value: { intentId, accepted: true, source: 'oauth_callback', policyVersion: 'kvkk-notice@2026-08-24-v1' } },
    ]
    const lookup = vi.fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: rows, error: null })
    const insert = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ contains: vi.fn(() => ({ in: lookup })) })),
        insert,
      })),
    }

    await expect(recordLegalConsentIntent(client as never, {
      userId, rawToken: token, ipAddress: null, userAgent: null,
    })).resolves.toBe(true)
    expect(insert).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('rejects forged intent evidence before any database write', async () => {
    const { client, insert } = adminClient()
    await expect(recordLegalConsentIntent(client as never, {
      userId: '00000000-0000-4000-8000-000000000001',
      rawToken: 'forged.token',
      ipAddress: null,
      userAgent: null,
    })).resolves.toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it('accepts current terms and notice only when both belong to the user', async () => {
    const userId = '00000000-0000-4000-8000-000000000001'
    const intentId = '10000000-0000-4000-8000-000000000001'
    const { client } = adminClient({ rows: [
      { user_id: userId, consent_type: 'terms', consent_value: { accepted: true, policyVersion: 'terms@2026-03-09-v1', source: 'oauth_callback', intentId } },
      { user_id: userId, consent_type: 'kvkk', consent_value: { accepted: true, policyVersion: 'kvkk-notice@2026-08-24-v1', source: 'oauth_callback', intentId } },
    ] })

    await expect(hasCurrentLegalConsent(client as never, userId)).resolves.toBe(true)
  })

  it('rejects legacy client-forged or mismatched legal evidence pairs', async () => {
    const userId = '00000000-0000-4000-8000-000000000001'
    const legacy = adminClient({ rows: [
      { user_id: userId, consent_type: 'terms', consent_value: { accepted: true, policyVersion: 'terms@2026-03-09-v1' } },
      { user_id: userId, consent_type: 'kvkk', consent_value: { accepted: true, policyVersion: 'kvkk-notice@2026-08-24-v1' } },
    ] })
    await expect(hasCurrentLegalConsent(legacy.client as never, userId)).resolves.toBe(false)

    const mismatched = adminClient({ rows: [
      { user_id: userId, consent_type: 'terms', consent_value: { accepted: true, policyVersion: 'terms@2026-03-09-v1', source: 'oauth_callback', intentId: '10000000-0000-4000-8000-000000000001' } },
      { user_id: userId, consent_type: 'kvkk', consent_value: { accepted: true, policyVersion: 'kvkk-notice@2026-08-24-v1', source: 'oauth_callback', intentId: '10000000-0000-4000-8000-000000000002' } },
    ] })
    await expect(hasCurrentLegalConsent(mismatched.client as never, userId)).resolves.toBe(false)
  })
})
