'use client'

import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table'

// Mock data — Supabase baglaninca gercek veri gelecek
const MOCK_ENTRIES = [
  { rank: 1, name: 'Zeynep K.', avatar: '🦊', xp: 4820, level: 'Savasci', isCurrentUser: false },
  { rank: 2, name: 'Emre Y.', avatar: '🐉', xp: 4520, level: 'Savasci', isCurrentUser: false },
  { rank: 3, name: 'Selin A.', avatar: '🌟', xp: 3890, level: 'Cirak', isCurrentUser: false },
  { rank: 4, name: 'Kaan B.', avatar: '⚔️', xp: 3210, level: 'Cirak', isCurrentUser: false },
  { rank: 5, name: 'Deniz T.', avatar: '🦉', xp: 2950, level: 'Cirak', isCurrentUser: true },
  { rank: 6, name: 'Ayse M.', avatar: '🎯', xp: 2780, level: 'Cirak', isCurrentUser: false },
  { rank: 7, name: 'Burak S.', avatar: '🔥', xp: 2340, level: 'Cirak', isCurrentUser: false },
  { rank: 8, name: 'Elif N.', avatar: '💎', xp: 2100, level: 'Cirak', isCurrentUser: false },
  { rank: 9, name: 'Mert K.', avatar: '🐺', xp: 1890, level: 'Cirak', isCurrentUser: false },
  { rank: 10, name: 'Ceren D.', avatar: '🌸', xp: 1650, level: 'Cirak', isCurrentUser: false },
]

export default function GlobalLeaderboardPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 text-center">
        <h1 className="font-display text-2xl font-black">
          <span className="bg-gradient-to-r from-[var(--reward)] to-[var(--reward-light)] bg-clip-text text-transparent">
            🏆 Haftalik Siralama
          </span>
        </h1>
        <p className="mt-1 text-sm text-[var(--text-sub)]">
          Bu haftanin en basarili arenacilari
        </p>
      </div>

      <LeaderboardTable entries={MOCK_ENTRIES} title="Global Siralama — Bu Hafta" />

      <div className="mt-4 text-center text-xs text-[var(--text-muted)]">
        Siralama her Pazartesi sifirlanir
      </div>
    </div>
  )
}
