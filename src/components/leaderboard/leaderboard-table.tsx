'use client'

import Image from 'next/image'
import { Nameplate } from '@/components/profile/nameplate'
import { AvatarDecoration } from '@/components/profile/avatar-decoration'

interface LeaderboardEntry {
  rank: number
  user_id?: string
  name: string
  avatar: string
  xp: number
  level: string
  isCurrentUser?: boolean
  nameplate?: string
  decorations?: string[]
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  title?: string
}

const MEDALS = ['🥇', '🥈', '🥉']
const MEDAL_COLORS = ['var(--app-warn)', '#94A3B8', '#C47A44']

export function LeaderboardTable({ entries, title = 'Haftalık Sıralama' }: LeaderboardTableProps) {
  return (
    <div className="overflow-hidden rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] shadow-[0_5px_0_var(--app-border)]">
      {/* Header */}
      <div className="border-b-2 border-[var(--app-border-soft)] bg-[var(--app-card-sunken)] px-4 py-3">
        <h2 className="font-display text-sm font-black text-[var(--app-text)]">{title}</h2>
      </div>

      {/* Table header — mobilde 3 sütun (rank/oyuncu/XP), sm+ 4 sütun (+seviye) */}
      <div className="grid grid-cols-[30px_minmax(0,1fr)_auto] gap-2 border-b-2 border-[var(--app-border-soft)] px-3 py-2 sm:grid-cols-[40px_minmax(0,1fr)_80px_64px] sm:px-4">
        <span className="text-[9px] font-black tracking-wider text-[var(--app-text-muted)]">#</span>
        <span className="text-[9px] font-black tracking-wider text-[var(--app-text-muted)]">OYUNCU</span>
        <span className="text-right text-[9px] font-black tracking-wider text-[var(--app-text-muted)]">XP</span>
        <span className="hidden text-right text-[9px] font-black tracking-wider text-[var(--app-text-muted)] sm:block">SEVİYE</span>
      </div>

      {/* Entries */}
      {entries.map((entry, idx) => (
        <div
          key={entry.user_id ?? `rank-${idx}`}
          className="grid min-h-14 grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[var(--app-border-soft)] px-3 py-2.5 transition-colors duration-200 last:border-b-0 sm:grid-cols-[40px_minmax(0,1fr)_80px_64px] sm:px-4"
          style={{
            background: entry.isCurrentUser ? 'var(--app-accent-tint)' : 'transparent',
            borderLeft: entry.isCurrentUser ? '3px solid var(--app-accent)' : '3px solid transparent',
          }}
        >
          {/* Rank */}
          <span
            className="font-display text-sm font-black"
            style={{ color: MEDAL_COLORS[entry.rank - 1] || 'var(--text-sub)' }}
          >
            {MEDALS[entry.rank - 1] || entry.rank}
          </span>

          {/* Player */}
          <div className="flex min-w-0 items-center gap-2">
            <AvatarDecoration decorationIds={entry.decorations ?? []} size={32}>
              {entry.avatar.startsWith('http') || entry.avatar.startsWith('/') ? (
                <Image
                  src={entry.avatar}
                  alt={entry.name}
                  width={32}
                  height={32}
                  unoptimized={entry.avatar.endsWith('.svg')}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--app-card-sunken)] text-lg">
                  {entry.avatar}
                </span>
              )}
            </AvatarDecoration>
            <div className="min-w-0 flex-1">
              <span
                className="block truncate text-sm"
                style={{
                  fontWeight: entry.isCurrentUser ? 700 : 400,
                  color: entry.isCurrentUser ? 'var(--app-text)' : 'var(--app-text-sub)',
                }}
              >
                <Nameplate nameplateId={entry.nameplate}>{entry.name}</Nameplate>
                {entry.isCurrentUser && <span className="ml-1 text-[10px] text-[var(--app-accent-text)]">(Sen)</span>}
              </span>
              {/* Seviye — mobilde isim altında; sm+ kendi sütununda */}
              <span className="block truncate text-[10px] font-semibold text-[var(--app-text-muted)] sm:hidden">
                {entry.level}
              </span>
            </div>
          </div>

          {/* XP */}
          <span className="text-right font-display text-sm font-black text-[var(--app-warn)]">
            {entry.xp.toLocaleString()}
          </span>

          {/* Level (sm+ ayrı sütun) */}
          <span className="hidden text-right text-xs font-semibold text-[var(--app-text-sub)] sm:block">
            {entry.level}
          </span>
        </div>
      ))}
    </div>
  )
}
