'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameSlug } from '@/lib/constants/games'
import type { PublicQuestion } from '@/lib/utils/question-public'
import { isValidUuid } from '@/lib/utils/uuid'

export interface PersonalizedMockPlan {
  generatedFor: string
  game: GameSlug
  examRef: string | null
  questions: PublicQuestion[]
  attemptId: string
  expiresAt: string
  strategyEligible?: boolean
  blueprintVersion?: string
  breakdown: {
    wrong: number
    weak: number
    coverage: number
    weakCategories: string[]
  }
}

interface ErrorResponse {
  error?: string
}

/** İsteğe bağlı Akıllı Deneme üretimi; lobi render'ında otomatik sorgu yapmaz. */
export function usePersonalizedMock(
  game: GameSlug,
  userId?: string | null,
  examRef?: string | null,
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const requestRef = useRef<AbortController | null>(null)

  const generate = useCallback(async (): Promise<PersonalizedMockPlan | null> => {
    if (!userId || busyRef.current) return null

    busyRef.current = true
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ game })
      if (examRef) params.set('exam_ref', examRef)

      const response = await fetch(`/api/study/personalized-mock?${params}`, {
        cache: 'no-store',
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
        signal: controller.signal,
      })
      if (controller.signal.aborted) return null
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as ErrorResponse | null
        setError(payload?.error ?? 'Akıllı deneme oluşturulamadı.')
        return null
      }

      const payload = await response.json() as PersonalizedMockPlan
      if (controller.signal.aborted) return null
      if (
        payload.game !== game
        || !Array.isArray(payload.questions)
        || typeof payload.attemptId !== 'string'
        || !isValidUuid(payload.attemptId)
        || typeof payload.expiresAt !== 'string'
        || !Number.isFinite(Date.parse(payload.expiresAt))
        || Date.parse(payload.expiresAt) <= Date.now()
        || (payload.strategyEligible === true && (
          typeof payload.blueprintVersion !== 'string'
          || payload.blueprintVersion.length === 0
        ))
      ) {
        setError('Akıllı deneme yanıtı geçersiz.')
        return null
      }
      if (payload.questions.length < 40) {
        setError('Bu sınav için 40 aktif soru bulunamadı.')
        return null
      }
      return payload
    } catch (caught) {
      if (controller.signal.aborted || (caught as { name?: string } | null)?.name === 'AbortError') {
        return null
      }
      setError('Akıllı deneme oluşturulamadı. Bağlantını kontrol et.')
      return null
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        busyRef.current = false
        setLoading(false)
      }
    }
  }, [examRef, game, userId])

  useEffect(() => () => {
    requestRef.current?.abort()
    requestRef.current = null
    busyRef.current = false
    setLoading(false)
  }, [examRef, game, userId])

  return { generate, loading, error }
}
