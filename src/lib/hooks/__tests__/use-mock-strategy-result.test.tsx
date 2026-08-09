import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMockStrategyResult } from '../use-mock-strategy-result'

const mocks = vi.hoisted(() => ({
  finalize: vi.fn(),
  fetchAnalysis: vi.fn(),
  exposure: vi.fn(),
}))

vi.mock('@/lib/mock-strategy/client', () => ({
  finalizeMockStrategyAttempt: mocks.finalize,
  fetchMockStrategyAnalysis: mocks.fetchAnalysis,
  recordMockStrategyExposure: mocks.exposure,
}))

const ATTEMPT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const SESSION_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
const treatment = {
  experiment: { key: 'mock_strategy_analysis_v1' as const, revision: 1, variant: 'treatment' as const },
  analysis: {
    basis: 'server_receipt_approximate' as const,
    segments: [
      { key: 'opening' as const, planned: 1, answered: 1, correct: 1, averageSeconds: 20, unknownTiming: 0 },
      { key: 'middle' as const, planned: 1, answered: 1, correct: 1, averageSeconds: 30, unknownTiming: 0 },
      { key: 'closing' as const, planned: 1, answered: 1, correct: 1, averageSeconds: 40, unknownTiming: 0 },
    ],
    unanswered: 0,
    unknownTiming: 0,
    rushedWrong: 0,
    stuck: 0,
    recommendations: ['keep_pace' as const],
  },
}

describe('useMockStrategyResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.finalize.mockResolvedValue(true)
    mocks.fetchAnalysis.mockResolvedValue(treatment)
    mocks.exposure.mockResolvedValue(true)
  })

  it('waits for canonical session finalization, then fetches and exposes the rendered result once', async () => {
    const { result, rerender } = renderHook(
      props => useMockStrategyResult(props),
      {
        initialProps: {
          enabled: true,
          analysisEnabled: true,
          attemptId: ATTEMPT_ID,
          sessionId: SESSION_ID,
          plannedCount: 40,
        },
      },
    )

    await waitFor(() => expect(result.current.result).toEqual(treatment))
    await waitFor(() => expect(mocks.exposure).toHaveBeenCalledTimes(1))
    expect(mocks.finalize).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: ATTEMPT_ID,
      sessionId: SESSION_ID,
      requestId: expect.any(String),
    }))
    expect(mocks.finalize.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.fetchAnalysis.mock.invocationCallOrder[0])
    expect(mocks.exposure).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: ATTEMPT_ID,
      revision: 1,
      requestId: expect.any(String),
    }))

    rerender({ enabled: true, analysisEnabled: true, attemptId: ATTEMPT_ID, sessionId: SESSION_ID, plannedCount: 40 })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mocks.finalize).toHaveBeenCalledTimes(1)
    expect(mocks.exposure).toHaveBeenCalledTimes(1)
  })

  it('does nothing before a tracked attempt and saved session both exist', async () => {
    const { result } = renderHook(() => useMockStrategyResult({
      enabled: true,
      analysisEnabled: true,
      attemptId: ATTEMPT_ID,
      sessionId: null,
      plannedCount: 40,
    }))
    expect(result.current).toEqual({ result: null, loading: false })
    expect(mocks.finalize).not.toHaveBeenCalled()
    expect(mocks.fetchAnalysis).not.toHaveBeenCalled()
    expect(mocks.exposure).not.toHaveBeenCalled()
  })

  it('finalizes a verified exam even when no active experiment was assigned', async () => {
    const { result } = renderHook(() => useMockStrategyResult({
      enabled: true,
      analysisEnabled: false,
      attemptId: ATTEMPT_ID,
      sessionId: SESSION_ID,
      plannedCount: 40,
    }))
    await waitFor(() => expect(mocks.finalize).toHaveBeenCalledTimes(1))
    expect(result.current.result).toBeNull()
    expect(mocks.fetchAnalysis).not.toHaveBeenCalled()
    expect(mocks.exposure).not.toHaveBeenCalled()
  })
})
