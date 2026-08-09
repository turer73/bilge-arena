'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchTeamBoss } from '@/lib/social-league/client'
import type { TeamBossResult } from '@/lib/social-league/server-contract'

const LOAD_ERROR = 'Takım bossu şu anda alınamıyor.'

export function useTeamBoss() {
  const [result, setResult] = useState<TeamBossResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchTeamBoss(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setResult(data)
        setError(null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(LOAD_ERROR)
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
      setResult(await fetchTeamBoss())
    } catch {
      setError(LOAD_ERROR)
    } finally {
      setLoading(false)
    }
  }, [])

  return { result, loading, error, refresh }
}
