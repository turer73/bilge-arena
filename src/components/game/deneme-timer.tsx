'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface DenemeTimerProps {
  totalTime: number        // toplam sure (saniye)
  onTimeUp: () => void     // sure dolunca
  isPaused?: boolean
}

export function DenemeTimer({ totalTime, onTimeUp, isPaused = false }: DenemeTimerProps) {
  const [remaining, setRemaining] = useState(totalTime)
  const startTimeRef = useRef(Date.now())
  const onTimeUpRef = useRef(onTimeUp)
  onTimeUpRef.current = onTimeUp

  // totalTime degisirse remaining'i sifirla (ornegin deneme tekrari)
  useEffect(() => {
    setRemaining(totalTime)
    startTimeRef.current = Date.now()
  }, [totalTime])

  useEffect(() => {
    if (isPaused) return

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          onTimeUpRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isPaused])

  const elapsed = totalTime - remaining
  const pct = (remaining / totalTime) * 100

  const formatTime = useCallback((s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }, [])

  // Renk: yesil -> sari -> kirmizi
  const getColor = () => {
    if (pct > 50) return 'var(--growth)'
    if (pct > 20) return 'var(--reward)'
    return 'var(--urgency)'
  }

  const isLow = remaining < 120 // son 2 dakika

  return (
    <div className="flex items-center gap-3">
      {/* Sure cubugu */}
      <div className="flex-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-linear"
            style={{
              width: `${pct}%`,
              backgroundColor: getColor(),
            }}
          />
        </div>
      </div>

      {/* Sure gostergesi */}
      <div
        className={`rounded-lg px-2.5 py-1 text-xs font-mono font-bold ${isLow ? 'animate-pulse' : ''}`}
        style={{
          color: getColor(),
          backgroundColor: `color-mix(in srgb, ${getColor()} 10%, transparent)`,
        }}
      >
        {formatTime(remaining)}
      </div>
    </div>
  )
}

// Gecen sureyi hesapla (deneme sonucu icin)
export function useElapsedTime() {
  const startRef = useRef(Date.now())

  const getElapsed = useCallback(() => {
    return Math.floor((Date.now() - startRef.current) / 1000)
  }, [])

  const reset = useCallback(() => {
    startRef.current = Date.now()
  }, [])

  return { getElapsed, reset }
}
