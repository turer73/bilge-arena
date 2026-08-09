import { describe, expect, it } from 'vitest'
import { appealAdminQueueSchema, appealSubmitInputSchema, contentNoStoreJson, correctionsSchema, incidentApplyResultSchema, psychometricRefreshInputSchema, revisionReviewInputSchema } from '../server-contract'

describe('content governance server contract', () => {
  it('rejects unknown keys and invalid stage values', () => {
    expect(revisionReviewInputSchema.safeParse({ stage: 1, decision: 'approved', rationale: 'Uygun', requestId: '11111111-1111-4111-8111-111111111111', actorId: 'leak' }).success).toBe(false)
    expect(revisionReviewInputSchema.safeParse({ stage: 3, decision: 'approved', rationale: 'Uygun', requestId: '11111111-1111-4111-8111-111111111111' }).success).toBe(false)
    expect(appealSubmitInputSchema.safeParse({ questionId: '11111111-1111-4111-8111-111111111111', sessionAnswerId: null, reason: 'wrong_key', explanation: 'Anahtar yanlış.', requestId: '22222222-2222-4222-8222-222222222222', correctOption: 1 }).success).toBe(false)
    expect(appealSubmitInputSchema.safeParse({ questionId: '11111111-1111-4111-8111-111111111111', sessionAnswerId: null, reason: 'other', explanation: '', requestId: '22222222-2222-4222-8222-222222222222' }).success).toBe(true)
  })
  it('only accepts generic owner correction records and marks all responses private', () => {
    expect(correctionsSchema.safeParse({ corrections: [{ sessionDate: '2026-08-09', reason: 'wrong_key', scoreDelta: 1, correctedAt: '2026-08-09T10:00:00.000Z', correctOption: 1 }] }).success).toBe(false)
    const response = contentNoStoreJson({ ok: true })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
  })
  it('projects the exact correction-application counters returned by migration 106', () => {
    const result = incidentApplyResultSchema.parse({ replayed: false, incidentId: '11111111-1111-4111-8111-111111111111', eligibleCount: 4, changedCount: 3, manualRequiredCount: 1, affectedCount: 99, internalNote: 'private' })
    expect(result).toEqual({ replayed: false, incidentId: '11111111-1111-4111-8111-111111111111', eligibleCount: 4, changedCount: 3, manualRequiredCount: 1 })
  })
  it('rejects identity and answer leakage from the administrator appeal queue', () => {
    const item = { appealId: '11111111-1111-4111-8111-111111111111', questionId: '22222222-2222-4222-8222-222222222222', revisionId: null, reasonCode: 'ambiguous', description: '', status: 'submitted', submittedAt: '2026-08-09T10:00:00.000Z', ackDueAt: '2026-08-11T10:00:00.000Z', resolveDueAt: '2026-08-23T10:00:00.000Z', slaBreachedAt: null, hasSessionEvidence: false, latestPublicMessage: null, latestInternalNote: null }
    expect(appealAdminQueueSchema.safeParse({ items: [item], nextCursor: null }).success).toBe(true)
    expect(appealAdminQueueSchema.safeParse({ items: [{ ...item, userId: '33333333-3333-4333-8333-333333333333' }], nextCursor: null }).success).toBe(false)
  })
  it('requires an ordered psychometric window and rejects unknown actor fields', () => {
    const request = { windowStart: '2026-07-01T00:00:00.000Z', windowEnd: '2026-08-01T00:00:00.000Z', requestId: '11111111-1111-4111-8111-111111111111' }
    expect(psychometricRefreshInputSchema.safeParse(request).success).toBe(true)
    expect(psychometricRefreshInputSchema.safeParse({ ...request, windowStart: request.windowEnd }).success).toBe(false)
    expect(psychometricRefreshInputSchema.safeParse({ ...request, userId: '22222222-2222-4222-8222-222222222222' }).success).toBe(false)
  })
})
