'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuizStore } from '@/stores/quiz-store'
import { saveGameSession } from '@/lib/supabase/sessions'
import { refreshProfile } from '@/lib/hooks/use-auth'
import { useAuthStore } from '@/stores/auth-store'
import { getLevelFromXP } from '@/lib/constants/levels'
import { toast } from '@/stores/toast-store'
import type { GameSlug } from '@/lib/constants/games'

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
  game,
  selectedMode,
  selectedCategory,
  selectedDifficulty,
  onSessionSaved,
}: UseSessionSaverOptions) {
  const [saving, setSaving] = useState(false)
  const savedRef = useRef(false)

  // Lobiye donulunce ref'i sifirla
  useEffect(() => {
    if (screen === 'lobby') {
      savedRef.current = false
    }
  }, [screen])

  // Sonuc ekranina gecildiginde oturumu kaydet
  useEffect(() => {
    if (screen !== 'result' || savedRef.current || saving) return
    if (!userId) return // Misafir — kaydetme

    const { answers, xpEarned, maxStreak } = useQuizStore.getState()
    if (answers.length === 0) return

    savedRef.current = true
    setSaving(true)

    saveGameSession({
      userId,
      game,
      mode: selectedMode,
      answers,
      totalXP: xpEarned,
      maxStreak,
      category: selectedCategory,
      difficulty: selectedDifficulty,
    })
      .then(async (sessionId) => {
        if (sessionId) {
          console.log('[SessionSaver] Oturum kaydedildi:', sessionId)

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

          // Günlük görevleri güncelle
          const correctCount = answers.filter((a) => a.isCorrect).length
          const totalCount = answers.length
          onSessionSaved?.({
            correctAnswers: correctCount,
            totalQuestions: totalCount,
            maxStreak,
            accuracy: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0,
            game,
          })

          // Rozet kontrolü — yeni rozetleri toast ile bildir
          fetch('/api/badges', { method: 'POST' })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
              if (data?.newBadges?.length > 0) {
                for (const badge of data.newBadges) {
                  toast.badge(badge.name, badge.icon, badge.xpReward)
                }
              }
            })
            .catch(() => {})
        }
      })
      .catch((err) => console.error('[SessionSaver] Kaydetme hatasi:', err))
      .finally(() => setSaving(false))
  }, [screen, userId, game, selectedMode, selectedCategory, selectedDifficulty, saving])

  return { saving }
}
