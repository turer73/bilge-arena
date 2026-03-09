'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuizStore } from '@/stores/quiz-store'
import { saveGameSession } from '@/lib/supabase/sessions'
import { refreshProfile } from '@/lib/hooks/use-auth'
import type { GameSlug } from '@/lib/constants/games'

interface UseSessionSaverOptions {
  screen: string
  userId?: string
  game: GameSlug
  selectedMode: string
  selectedCategory?: string | null
  selectedDifficulty?: number | null
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
          // DB trigger'lari XP/level/streak guncelledi → profil verisini yenile
          await refreshProfile()
        }
      })
      .catch((err) => console.error('[SessionSaver] Kaydetme hatasi:', err))
      .finally(() => setSaving(false))
  }, [screen, userId, game, selectedMode, selectedCategory, selectedDifficulty, saving])

  return { saving }
}
