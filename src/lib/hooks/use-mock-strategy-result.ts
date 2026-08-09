'use client'

import { useEffect, useRef, useState } from 'react'
import {
  fetchMockStrategyAnalysis,
  finalizeMockStrategyAttempt,
  recordMockStrategyExposure,
} from '@/lib/mock-strategy/client'
import type { MockStrategyPublicResponse } from '@/lib/mock-strategy/public-contract'

interface UseMockStrategyResultInput {
  enabled: boolean
  analysisEnabled: boolean
  attemptId: string | null
  sessionId: string | null
  plannedCount: number
}

export function useMockStrategyResult({
  enabled,
  analysisEnabled,
  attemptId,
  sessionId,
  plannedCount,
}: UseMockStrategyResultInput) {
  const [result, setResult] = useState<MockStrategyPublicResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const operationKeyRef = useRef<string | null>(null)
  const resultKeyRef = useRef<string | null>(null)
  const finalizeRequestIdRef = useRef<string | null>(null)
  const exposedKeyRef = useRef<string | null>(null)
  const exposureRequestIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !attemptId || !sessionId || plannedCount < 1) {
      setResult(null)
      resultKeyRef.current = null
      setLoading(false)
      operationKeyRef.current = null
      finalizeRequestIdRef.current = null
      exposedKeyRef.current = null
      exposureRequestIdRef.current = null
      return
    }
    const operationKey = `${attemptId}:${sessionId}`
    if (operationKeyRef.current === operationKey) return
    operationKeyRef.current = operationKey
    resultKeyRef.current = null
    exposedKeyRef.current = null
    exposureRequestIdRef.current = null
    setResult(null)
    const finalizeRequestId = finalizeRequestIdRef.current ?? crypto.randomUUID()
    finalizeRequestIdRef.current = finalizeRequestId
    const controller = new AbortController()
    setLoading(true)

    void (async () => {
      const finalized = await finalizeMockStrategyAttempt({
        attemptId,
        sessionId,
        requestId: finalizeRequestId,
        signal: controller.signal,
      })
      if (!finalized || controller.signal.aborted) return
      if (!analysisEnabled) return
      const analysis = await fetchMockStrategyAnalysis(attemptId, controller.signal)
      if (!controller.signal.aborted) {
        resultKeyRef.current = operationKey
        setResult(analysis)
      }
    })().finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })

    return () => {
      controller.abort()
      if (operationKeyRef.current === operationKey) operationKeyRef.current = null
    }
  }, [analysisEnabled, attemptId, enabled, plannedCount, sessionId])

  // Effects run after React has committed the control/treatment surface. That
  // makes this an actual render exposure, not merely assignment or API fetch.
  useEffect(() => {
    if (!enabled || !attemptId || !sessionId || !result) return
    if (resultKeyRef.current !== `${attemptId}:${sessionId}`) return
    const exposureKey = `${attemptId}:${sessionId}:${result.experiment.revision}`
    if (exposedKeyRef.current === exposureKey) return
    exposedKeyRef.current = exposureKey
    exposureRequestIdRef.current ??= crypto.randomUUID()
    void recordMockStrategyExposure({
      attemptId,
      revision: result.experiment.revision,
      requestId: exposureRequestIdRef.current,
    })
  }, [attemptId, enabled, result, sessionId])

  const currentKey = attemptId && sessionId ? `${attemptId}:${sessionId}` : null
  return {
    result: resultKeyRef.current === currentKey ? result : null,
    loading,
  }
}
