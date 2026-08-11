'use client'

import { useEffect } from 'react'
import { toast } from '@/stores/toast-store'
import { playSound } from '@/lib/utils/sounds'
import { trackEvent } from '@/lib/utils/plausible'
import {
  ACTIVATION_EXPERIMENT,
  ACTIVATION_RESULT_STORAGE_KEY,
  getActivationExposure,
} from '@/lib/experiments/activation'

const RETRY_IN_FLIGHT_KEY = 'ba-activation-reward-retry-in-flight'

function validRewardXp(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= 150 && Number(value) % 50 === 0
}

function announceReward(xp: number) {
  playSound('xp')
  toast.success(`İlk turun kaydedildi: +${xp} XP`, 'Hazırsın; şimdi serini başlat!')
  trackEvent('ActivationRewardClaimed', {
    props: {
      experiment: ACTIVATION_EXPERIMENT,
      variant: getActivationExposure() ?? 'micro',
      xp,
    },
  })
}

export function ActivationRewardNotice() {
  useEffect(() => {
    const url = new URL(window.location.href)
    const rawXp = url.searchParams.get('activationXp')
    const xp = rawXp ? Number(rawXp) : 0

    if (rawXp) {
      url.searchParams.delete('activationXp')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
      if (validRewardXp(xp)) {
        announceReward(xp)
        try { localStorage.removeItem(ACTIVATION_RESULT_STORAGE_KEY) } catch {}
      }
      return
    }

    let hasPendingResult = false
    try {
      const stored = localStorage.getItem(ACTIVATION_RESULT_STORAGE_KEY)
      const parsed = stored ? JSON.parse(stored) as { completedAt?: unknown } : null
      const completedAt = typeof parsed?.completedAt === 'string' ? Date.parse(parsed.completedAt) : NaN
      hasPendingResult = Number.isFinite(completedAt)
        && Date.now() - completedAt < 2 * 60 * 60 * 1000
      if (!hasPendingResult && stored) localStorage.removeItem(ACTIVATION_RESULT_STORAGE_KEY)
      if (sessionStorage.getItem(RETRY_IN_FLIGHT_KEY) === '1') return
      if (hasPendingResult) sessionStorage.setItem(RETRY_IN_FLIGHT_KEY, '1')
    } catch {
      return
    }
    if (!hasPendingResult) return

    fetch('/api/activation/reward', { method: 'POST' })
      .then(async (response) => {
        if (response.status === 204) {
          try { localStorage.removeItem(ACTIVATION_RESULT_STORAGE_KEY) } catch {}
          return
        }
        if (!response.ok) return
        const reward = await response.json() as { xpAwarded?: unknown; alreadyProcessed?: unknown }
        if (validRewardXp(reward.xpAwarded)) announceReward(reward.xpAwarded)
        if (reward.alreadyProcessed === true || Number.isInteger(reward.xpAwarded)) {
          try { localStorage.removeItem(ACTIVATION_RESULT_STORAGE_KEY) } catch {}
        }
      })
      .catch(() => {})
      .finally(() => {
        try { sessionStorage.removeItem(RETRY_IN_FLIGHT_KEY) } catch {}
      })
  }, [])

  return null
}
