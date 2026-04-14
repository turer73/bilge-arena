'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { playSound } from '@/lib/utils/sounds'

interface UseTimerOptions {
  initialTime: number      // saniye
  onTimeUp?: () => void
  autoStart?: boolean
}

interface UseTimerReturn {
  seconds: number
  isRunning: boolean
  isUrgent: boolean        // <= 10 saniye
  isCritical: boolean      // <= 5 saniye
  start: () => void
  pause: () => void
  reset: (newTime?: number) => void
  stop: () => void
}

export function useTimer({
  initialTime,
  onTimeUp,
  autoStart = false,
}: UseTimerOptions): UseTimerReturn {
  const [seconds, setSeconds] = useState(initialTime)
  const [isRunning, setIsRunning] = useState(autoStart)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const onTimeUpRef = useRef(onTimeUp)

  // Callback ref pattern — stale closure onleme
  useEffect(() => {
    onTimeUpRef.current = onTimeUp
  })

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsRunning(false)
  }, [])

  const start = useCallback(() => {
    setIsRunning(true)
  }, [])

  const pause = useCallback(() => {
    stop()
  }, [stop])

  const reset = useCallback((newTime?: number) => {
    stop()
    setSeconds(newTime ?? initialTime)
  }, [stop, initialTime])

  // Timer interval — stop() ve onTimeUp artik state updater disinda
  useEffect(() => {
    if (!isRunning) return

    intervalRef.current = setInterval(() => {
      setSeconds(prev => {
        // Son 5 saniyede tik-tak sesi
        if (prev <= 6 && prev > 1) {
          playSound('countdown')
        }
        return prev <= 1 ? 0 : prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isRunning])

  // seconds === 0 olunca durdur ve onTimeUp cagir (state updater disinda)
  useEffect(() => {
    if (seconds === 0 && isRunning) {
      stop()
      onTimeUpRef.current?.()
    }
  }, [seconds, isRunning, stop])

  return {
    seconds,
    isRunning,
    isUrgent: seconds <= 10 && seconds > 5,
    isCritical: seconds <= 5,
    start,
    pause,
    reset,
    stop,
  }
}
