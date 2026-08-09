import { describe, expect, it } from 'vitest'
import { parseMockStrategyPublicResponse } from '../public-contract'

const analysis = {
  basis: 'server_receipt_approximate' as const,
  segments: [
    { key: 'opening' as const, planned: 2, answered: 2, correct: 1, averageSeconds: 20, unknownTiming: 0 },
    { key: 'middle' as const, planned: 2, answered: 2, correct: 1, averageSeconds: 30, unknownTiming: 0 },
    { key: 'closing' as const, planned: 2, answered: 1, correct: 1, averageSeconds: null, unknownTiming: 1 },
  ],
  unanswered: 1,
  unknownTiming: 1,
  rushedWrong: 1,
  stuck: 0,
  recommendations: ['check_fast_answers' as const],
}

describe('mock strategy public contract', () => {
  it('accepts treatment analysis but rejects internal identifiers/timestamps', () => {
    const response = {
      experiment: { key: 'mock_strategy_analysis_v1', revision: 1, variant: 'treatment' },
      analysis,
    }
    expect(parseMockStrategyPublicResponse(response)).toEqual(response)
    expect(parseMockStrategyPublicResponse({ ...response, sessionId: crypto.randomUUID() })).toBeNull()
    expect(parseMockStrategyPublicResponse({ ...response, analysis: { ...analysis, openedAt: '2026-08-08T10:00:00Z' } })).toBeNull()
  })

  it('requires null analysis for control and non-null analysis for treatment', () => {
    expect(parseMockStrategyPublicResponse({
      experiment: { key: 'mock_strategy_analysis_v1', revision: 1, variant: 'control' },
      analysis: null,
    })).not.toBeNull()
    expect(parseMockStrategyPublicResponse({
      experiment: { key: 'mock_strategy_analysis_v1', revision: 1, variant: 'control' },
      analysis,
    })).toBeNull()
    expect(parseMockStrategyPublicResponse({
      experiment: { key: 'mock_strategy_analysis_v1', revision: 1, variant: 'treatment' },
      analysis: null,
    })).toBeNull()
  })
})
