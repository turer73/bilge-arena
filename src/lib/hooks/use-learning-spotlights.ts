'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchLearningSpotlights } from '@/lib/social-league/client'
import type { LearningSpotlightsResult } from '@/lib/social-league/server-contract'

export function useLearningSpotlights() {
  const [result, setResult] = useState<LearningSpotlightsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchLearningSpotlights(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setResult(data)
        setError(null)
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Olumlu öğrenme spotları şu anda alınamıyor.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setResult(await fetchLearningSpotlights())
    } catch {
      setError('Olumlu öğrenme spotları şu anda alınamıyor.')
    } finally {
      setLoading(false)
    }
  }, [])

  return { result, loading, error, refresh }
}
