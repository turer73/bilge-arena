'use client'

import { useEffect, useState } from 'react'
import {
  assistancePolicySchema,
  CLOSED_ASSISTANCE_POLICY,
  OPEN_ASSISTANCE_POLICY,
  type AssistancePolicy,
} from './contract'

export interface AssistancePolicyState {
  policy: AssistancePolicy
  /**
   * Politika henuz okunmadi. Tuketiciler bu sirada yardimciyi ACMAMALIDIR:
   * sinav modundaki bir ogrenciye bir an icin tahta/koc gorunmesini onler.
   * "Kapali" mesaji da gosterilmez; yalnizca beklenir.
   */
  loading: boolean
}

/**
 * Sinav modu politikasini okur. Istek basarisiz olursa FAIL-CLOSED davranir:
 * yardimcilar kapali sayilir. Sinav butunlugu ag hatasina feda edilmez.
 */
export function useAssistancePolicy(): AssistancePolicyState {
  const [policy, setPolicy] = useState<AssistancePolicy>(OPEN_ASSISTANCE_POLICY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    void fetch('/api/assistance-policy', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return CLOSED_ASSISTANCE_POLICY
        const parsed = assistancePolicySchema.safeParse(await response.json())
        return parsed.success ? parsed.data : CLOSED_ASSISTANCE_POLICY
      })
      .then((next) => {
        if (!active) return
        setPolicy(next)
        setLoading(false)
      })
      .catch((error: unknown) => {
        // Bilesen sokulurken atilan istek fail-closed sayilmaz.
        if (!active || (error instanceof Error && error.name === 'AbortError')) return
        setPolicy(CLOSED_ASSISTANCE_POLICY)
        setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  return { policy, loading }
}

/** Yardimci acilabilir mi: politika okunana kadar hayir. */
export function canUseHelper(
  state: AssistancePolicyState,
  helper: 'board' | 'coach' | 'assistant',
): boolean {
  if (state.loading) return false
  return state.policy[helper]
}
