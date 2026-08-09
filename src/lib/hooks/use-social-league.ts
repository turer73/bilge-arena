'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchSocialLeague,
  saveSocialLeaguePreference,
} from '@/lib/social-league/client'
import type { SocialLeagueResult } from '@/lib/social-league/server-contract'

type PendingPreference = { optedIn: boolean; requestId: string }

export function useSocialLeague() {
  const [result, setResult] = useState<SocialLeagueResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingPreferenceRef = useRef<PendingPreference | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchSocialLeague(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setResult(data)
        setError(null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Lig bilgisi şu anda alınamıyor.')
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
      setResult(await fetchSocialLeague())
    } catch {
      setError('Lig bilgisi şu anda alınamıyor.')
    } finally {
      setLoading(false)
    }
  }, [])

  const updatePreference = useCallback(async (optedIn: boolean) => {
    const pending = pendingPreferenceRef.current?.optedIn === optedIn
      ? pendingPreferenceRef.current
      : { optedIn, requestId: crypto.randomUUID() }
    pendingPreferenceRef.current = pending
    setUpdating(true)
    setError(null)
    let preferenceSaved = false
    try {
      const preference = await saveSocialLeaguePreference(pending)
      preferenceSaved = true
      pendingPreferenceRef.current = null
      setResult((current) => current
        ? {
            ...current,
            optedIn: preference.optedIn,
            effectiveWeekStart: preference.effectiveWeekStart,
            status: current.week
              ? current.status
              : preference.optedIn ? 'waiting' : 'opted_out',
          }
        : current)
      setResult(await fetchSocialLeague())
      return true
    } catch {
      setError(preferenceSaved
        ? 'Tercihin kaydedildi; güncel lig durumu yenilenemedi.'
        : 'Lig tercihi kaydedilemedi. Lütfen tekrar dene.')
      return preferenceSaved
    } finally {
      setUpdating(false)
    }
  }, [])

  return { result, loading, updating, error, refresh, updatePreference }
}
