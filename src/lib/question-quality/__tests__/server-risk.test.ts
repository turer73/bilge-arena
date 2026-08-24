import { afterEach, describe, expect, it, vi } from 'vitest'

import { questionQualityIndependenceKey } from '../server-risk'

describe('questionQualityIndependenceKey', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('clusters different users from the same IPv4 prefix together', () => {
    vi.stubEnv('QUESTION_QUALITY_INDEPENDENCE_SECRET', 'test-secret')
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.10' })
    expect(questionQualityIndependenceKey('user-a', headers))
      .toBe(questionQualityIndependenceKey('user-b', new Headers({ 'x-forwarded-for': '203.0.113.99' })))
  })

  it('fails closed in production when the secret or network signal is unavailable', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QUESTION_QUALITY_INDEPENDENCE_SECRET', '')
    expect(() => questionQualityIndependenceKey('user-a', new Headers({ 'x-forwarded-for': '203.0.113.10' }))).toThrow('question_quality_independence_signal_unavailable')
    vi.stubEnv('QUESTION_QUALITY_INDEPENDENCE_SECRET', 'test-secret')
    expect(() => questionQualityIndependenceKey('user-a', new Headers())).toThrow('question_quality_independence_signal_unavailable')
  })
})
