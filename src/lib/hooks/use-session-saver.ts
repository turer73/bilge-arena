'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuizStore } from '@/stores/quiz-store'
import { saveGameSession } from '@/lib/supabase/sessions'
import { refreshProfile } from '@/lib/hooks/use-auth'
import { useAuthStore } from '@/stores/auth-store'
import { getLevelFromXP } from '@/lib/constants/levels'
import { BADGES } from '@/lib/constants/badges'
import { toast } from '@/stores/toast-store'
import type { GameSlug } from '@/lib/constants/games'
import type { SavedGameSession } from '@/lib/supabase/sessions'

interface SessionResult {
  correctAnswers: number
  totalQuestions: number
  maxStreak: number
  accuracy: number
  game: string
}

export type SessionSaveStatus = 'pending' | 'saved' | 'failed' | 'not_applicable'

interface UseSessionSaverOptions {
  screen: string
  userId?: string
  attemptId?: string | null
  game: GameSlug
  selectedMode: string
  selectedCategory?: string | null
  selectedDifficulty?: number | null
  onSessionSaved?: (data: SessionResult) => void
}

/**
 * Oyun oturumunu Supabase'e kaydeder.
 * screen === 'result' oldugunda bir kez tetiklenir.
 * Misafir kullanicilar icin kaydetme yapmaz.
 */
export function useSessionSaver({
  screen,
  userId,
  attemptId,
  game,
  selectedMode,
  selectedCategory,
  selectedDifficulty,
  onSessionSaved,
}: UseSessionSaverOptions) {
  const [saving, setSaving] = useState(false)
  const [savedSession, setSavedSession] = useState<SavedGameSession | null>(null)
  const [saveStatus, setSaveStatus] = useState<SessionSaveStatus>('not_applicable')
  const [settledContextKey, setSettledContextKey] = useState<string | null>(null)
  const savedRef = useRef(false)
  // Idempotency key (migration 081) sonuc-ekrani basina sabit, lobiye donulunce sifirlanir.
  const requestIdRef = useRef<string | null>(null)
  const contextKeyRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Lobiye donulunce ref'leri sifirla
  useEffect(() => {
    if (screen === 'lobby') {
      generationRef.current += 1
      savedRef.current = false
      requestIdRef.current = null
      contextKeyRef.current = null
      setSettledContextKey(null)
      setSavedSession(null)
      setSaveStatus('not_applicable')
    }
  }, [screen])

  // Sonuc ekranina gecildiginde oturumu kaydet
  useEffect(() => {
    if (screen !== 'result') return

    const contextKey = userId && attemptId ? `${userId}:${attemptId}` : null
    let contextChanged = false
    if (contextKey !== contextKeyRef.current) {
      generationRef.current += 1
      contextChanged = true
      contextKeyRef.current = contextKey
      setSettledContextKey(contextKey)
      savedRef.current = false
      requestIdRef.current = null
      setSavedSession(null)
      setSaveStatus('not_applicable')
      setSaving(false)
    }
    if (savedRef.current || (saving && !contextChanged)) return
    if (!userId || !attemptId) {
      setSaveStatus('not_applicable')
      return // Misafir veya dogrulanmis attempt yok - kaydetme
    }

    const { answers, xpEarned, maxStreak } = useQuizStore.getState()
    if (answers.length === 0) {
      setSaveStatus('not_applicable')
      return
    }

    savedRef.current = true
    const submissionContextKey = contextKey
    const submissionGeneration = generationRef.current
    let persisted = false
    if (!requestIdRef.current) {
      requestIdRef.current = crypto.randomUUID()
    }
    setSaving(true)
    setSaveStatus('pending')

    saveGameSession({
      userId,
      attemptId,
      game,
      mode: selectedMode,
      answers,
      totalXP: xpEarned,
      maxStreak,
      category: selectedCategory,
      difficulty: selectedDifficulty,
      clientRequestId: requestIdRef.current,
      })
      .then(async (session) => {
        if (!mountedRef.current || contextKeyRef.current !== submissionContextKey || generationRef.current !== submissionGeneration) return
        if (!session) {
          setSaveStatus('failed')
          return
        }
        persisted = true
        setSavedSession(session)
        setSaveStatus('saved')

        // Seviye atlama kontrolu icin onceki XP'yi kaydet
        const oldXP = useAuthStore.getState().profile?.total_xp ?? 0
        const oldLevel = getLevelFromXP(oldXP)
        try {
          await refreshProfile(() => (
            mountedRef.current
            && contextKeyRef.current === submissionContextKey
            && generationRef.current === submissionGeneration
          ))
        } catch (error) {
          console.error('[SessionSaver] Profil yenileme hatasi:', error)
        }
        if (!mountedRef.current || contextKeyRef.current !== submissionContextKey || generationRef.current !== submissionGeneration) return

        // Yeni profil ile seviye karsilastir; post-commit UI effects cannot
        // turn an already persisted session into a failed save.
        try {
          const newXP = useAuthStore.getState().profile?.total_xp ?? 0
          const newLevel = getLevelFromXP(newXP)
          if (newLevel.level > oldLevel.level) toast.levelUp(newLevel.name, newLevel.badge)
        } catch (error) {
          console.error('[SessionSaver] Seviye bildirimi hatasi:', error)
        }

        // Gunluk gorevleri guncelle
        // Callback consumers use only the canonical values returned from the
        // verified completion transaction. Local answer flags can be stale or
        // tampered with and must not be labelled as verified.
        const correctCount = session.correctCount
        const totalCount = session.correctCount + session.wrongCount
        try {
          onSessionSaved?.({
            correctAnswers: correctCount,
            totalQuestions: totalCount,
            maxStreak,
            accuracy: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0,
            game,
          })
        } catch (error) {
          console.error('[SessionSaver] Kayit callback hatasi:', error)
        }

        // Sessions API awards badge XP atomically. Do not POST /api/badges again:
        // that request sees an already-inserted badge and loses the toast.
        for (const code of session.newBadges) {
          const badge = BADGES.find((candidate) => candidate.code === code)
          if (badge) {
            try {
              toast.badge(badge.name, badge.icon, badge.xpReward)
            } catch (error) {
              console.error('[SessionSaver] Rozet bildirimi hatasi:', error)
            }
          }
        }
      })
      .catch((err) => {
        if (!mountedRef.current || contextKeyRef.current !== submissionContextKey || generationRef.current !== submissionGeneration) return
        console.error('[SessionSaver] Kaydetme hatasi:', err)
        // A later notification/profile consumer failure cannot undo the
        // server acknowledgement. Only submission failure changes this state.
        if (!persisted) setSaveStatus('failed')
      })
      .finally(() => {
        if (mountedRef.current && contextKeyRef.current === submissionContextKey && generationRef.current === submissionGeneration) setSaving(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, userId, attemptId, game, selectedMode, selectedCategory, selectedDifficulty])

  const currentContextKey = userId && attemptId ? `${userId}:${attemptId}` : null
  const contextSettled = settledContextKey === currentContextKey
  const visibleSavedSession = contextSettled ? savedSession : null
  const visibleSaveStatus = contextSettled
    ? saveStatus
    : (screen === 'result' && userId && attemptId ? 'pending' : 'not_applicable')

  return { saving, savedSession: visibleSavedSession, saveStatus: visibleSaveStatus }
}
