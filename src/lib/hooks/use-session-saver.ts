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
  const savedRef = useRef(false)
  // Idempotency key (migration 081) sonuc-ekrani basina sabit, lobiye donulunce sifirlanir.
  const requestIdRef = useRef<string | null>(null)

  // Lobiye donulunce ref'leri sifirla
  useEffect(() => {
    if (screen === 'lobby') {
      savedRef.current = false
      requestIdRef.current = null
      setSavedSession(null)
    }
  }, [screen])

  // Sonuc ekranina gecildiginde oturumu kaydet
  useEffect(() => {
    if (screen !== 'result' || savedRef.current || saving) return
    if (!userId || !attemptId) return // Misafir veya dogrulanmis attempt yok - kaydetme

    const { answers, xpEarned, maxStreak } = useQuizStore.getState()
    if (answers.length === 0) return

    savedRef.current = true
    if (!requestIdRef.current) {
      requestIdRef.current = crypto.randomUUID()
    }
    setSaving(true)

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
        if (!session) return
        setSavedSession(session)

        // Seviye atlama kontrolu icin onceki XP'yi kaydet
        const oldXP = useAuthStore.getState().profile?.total_xp ?? 0
        const oldLevel = getLevelFromXP(oldXP)
        await refreshProfile()

        // Yeni profil ile seviye karsilastir
        const newXP = useAuthStore.getState().profile?.total_xp ?? 0
        const newLevel = getLevelFromXP(newXP)
        if (newLevel.level > oldLevel.level) {
          toast.levelUp(newLevel.name, newLevel.badge)
        }

        // Gunluk gorevleri guncelle
        // Callback consumers use only the canonical values returned from the
        // verified completion transaction. Local answer flags can be stale or
        // tampered with and must not be labelled as verified.
        const correctCount = session.correctCount
        const totalCount = session.correctCount + session.wrongCount
        onSessionSaved?.({
          correctAnswers: correctCount,
          totalQuestions: totalCount,
          maxStreak,
          accuracy: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0,
          game,
        })

        // Sessions API awards badge XP atomically. Do not POST /api/badges again:
        // that request sees an already-inserted badge and loses the toast.
        for (const code of session.newBadges) {
          const badge = BADGES.find((candidate) => candidate.code === code)
          if (badge) toast.badge(badge.name, badge.icon, badge.xpReward)
        }
      })
      .catch((err) => console.error('[SessionSaver] Kaydetme hatasi:', err))
      .finally(() => setSaving(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, userId, attemptId, game, selectedMode, selectedCategory, selectedDifficulty])

  return { saving, savedSession }
}
