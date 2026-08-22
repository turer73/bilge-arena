'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export const GAME_INACTIVITY_PAUSE_MS = 2 * 60 * 1000

interface UseGameAutoPauseOptions {
  active: boolean
  sessionKey: string | null
  onPause: () => void
  timeoutMs?: number
}

/**
 * Klasik/pratik oyunu sekme gizlendiginde veya uzun sure dokunulmadiginda
 * durdurur. Devam otomatik degildir: kullanici ekrandaki Devam Et eylemini
 * secmelidir. Deneme sinavlari adalet nedeniyle bu hook'a active=false verir.
 */
export function useGameAutoPause({
  active,
  sessionKey,
  onPause,
  timeoutMs = GAME_INACTIVITY_PAUSE_MS,
}: UseGameAutoPauseOptions) {
  const [pausedSession, setPausedSession] = useState<string | null>(null)
  const onPauseRef = useRef(onPause)

  useEffect(() => {
    onPauseRef.current = onPause
  }, [onPause])

  const autoPaused = Boolean(active && sessionKey && pausedSession === sessionKey)

  useEffect(() => {
    if (!active || !sessionKey || autoPaused) return

    let inactivityTimer: ReturnType<typeof setTimeout> | null = null
    const clearTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer)
      inactivityTimer = null
    }
    const pause = () => {
      clearTimer()
      onPauseRef.current()
      setPausedSession(sessionKey)
    }
    const armTimer = () => {
      clearTimer()
      inactivityTimer = setTimeout(pause, timeoutMs)
    }
    const handleVisibility = () => {
      if (document.hidden) pause()
      else armTimer()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', pause)
    window.addEventListener('pointerdown', armTimer, { passive: true })
    window.addEventListener('keydown', armTimer)
    window.addEventListener('touchstart', armTimer, { passive: true })
    armTimer()

    return () => {
      clearTimer()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', pause)
      window.removeEventListener('pointerdown', armTimer)
      window.removeEventListener('keydown', armTimer)
      window.removeEventListener('touchstart', armTimer)
    }
  }, [active, autoPaused, sessionKey, timeoutMs])

  const resume = useCallback(() => {
    if (!sessionKey) return
    setPausedSession((current) => current === sessionKey ? null : current)
  }, [sessionKey])

  return { autoPaused, resume }
}
