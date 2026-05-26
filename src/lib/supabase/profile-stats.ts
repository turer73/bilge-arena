'use client'

import type { GameSlug } from '@/lib/constants/games'

export interface CategoryStat {
  category: string
  total: number
  correct: number
  percentage: number
}

export interface GameStat {
  game: GameSlug
  total: number
  correct: number
  percentage: number
  categories: CategoryStat[]
}

export interface RecentGame {
  id: string
  game: GameSlug
  mode: string
  correct_count: number
  total_questions: number
  total_xp: number
  completed_at: string | null
}

export interface ProfileStats {
  gameStats: GameStat[]
  recentGames: RecentGame[]
}

/**
 * Kullanicinin oyun/kategori bazli basari istatistiklerini ve son oyunlarini
 * /api/profile/stats proxy uzerinden ceker.
 *
 * Madde 9 #7: eski client `.from('session_answers')` + `.from('game_sessions')`
 * cagrilari server'a tasindi. UserId parametre kaldirildi — server-side
 * auth.uid() kullanilir.
 *
 * Hata durumunda bos ProfileStats doner (UI graceful degrade).
 */
export async function fetchProfileStats(): Promise<ProfileStats> {
  try {
    const res = await fetch('/api/profile/stats', { cache: 'no-store' })
    if (!res.ok) return { gameStats: [], recentGames: [] }
    return (await res.json()) as ProfileStats
  } catch {
    return { gameStats: [], recentGames: [] }
  }
}

export interface BootstrapResponse extends ProfileStats {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any
  isAdmin: boolean
}

/**
 * Profile + istatistikleri tek seferde ceker (H3 — 2 round-trip → 1).
 * /api/profile/bootstrap proxy uzerinden: profile + roles + stats hepsi paralel.
 *
 * Hata durumunda null doner — caller fallback'e dusebilir.
 */
export async function fetchProfileBootstrap(): Promise<BootstrapResponse | null> {
  try {
    const res = await fetch('/api/profile/bootstrap', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as BootstrapResponse
  } catch {
    return null
  }
}
