'use client'

import {
  Flame,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useTeamBoss } from '@/lib/hooks/use-team-boss'
import type { TeamBossResult } from '@/lib/social-league/server-contract'

const PHASE_LABELS = {
  awakening: 'Uyanıyor',
  weakened: 'Zayıflıyor',
  critical: 'Kritik',
  defeated: 'Yenildi',
} as const

interface WeeklyTeamBossViewProps {
  result: TeamBossResult | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function WeeklyTeamBoss() {
  const teamBoss = useTeamBoss()
  return <WeeklyTeamBossView {...teamBoss} />
}

export function WeeklyTeamBossView({
  result,
  loading,
  error,
  refresh,
}: WeeklyTeamBossViewProps) {
  if (loading) {
    return (
      <section
        aria-labelledby="weekly-team-boss-heading"
        aria-busy="true"
        className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5"
      >
        <h2 id="weekly-team-boss-heading" className="font-display text-lg font-black">
          Takım Bossu
        </h2>
        <p className="mt-3 animate-pulse text-sm text-[var(--text-muted)]">
          Takım ilerlemesi hazırlanıyor…
        </p>
      </section>
    )
  }

  if (!result) {
    return (
      <section
        aria-labelledby="weekly-team-boss-heading"
        className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5"
      >
        <h2 id="weekly-team-boss-heading" className="font-display text-lg font-black">
          Takım Bossu
        </h2>
        <p role="alert" className="mt-2 text-sm text-[var(--urgency-text)]">
          {error ?? 'Takım bossu şu anda alınamıyor.'}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--focus)] px-4 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Tekrar dene
        </button>
      </section>
    )
  }

  if (result.status === 'opted_out' || result.status === 'waiting') return null
  if (!result.boss || !result.team) return null

  const { boss, team } = result
  const headingId = 'weekly-team-boss-heading'

  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)]"
    >
      <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--urgency-bg)] text-[var(--urgency-text)]">
            <Flame aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={headingId} className="font-display text-lg font-black">
                Takım Bossu
              </h2>
              {result.status === 'finalized' && (
                <span className="rounded-full bg-[var(--growth-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--growth-text)]">
                  Hafta tamamlandı
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-sub)] sm:text-sm">
              Yakın Rakip Ligi kohortun ortak bir öğrenme hedefinde buluşuyor.
            </p>
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-4 p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-black">{boss.name}</p>
            <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-[var(--urgency-text)]">
              {PHASE_LABELS[boss.phase]}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl bg-[var(--focus-bg)] px-3 py-2 text-xs font-bold text-[var(--focus-text)]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            {boss.defeated ? 'Takım hedefi tamamlandı' : `${boss.remaining} puan kaldı`}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
            <span className="font-bold">{boss.progress} / {boss.target}</span>
            <span className="font-black text-[var(--focus-text)]">%{boss.progressPercent}</span>
          </div>
          <div
            role="progressbar"
            aria-label="Takım bossu ilerlemesi"
            aria-valuemin={0}
            aria-valuemax={boss.target}
            aria-valuenow={boss.progress}
            aria-valuetext={`${boss.progress} / ${boss.target} doğrulanmış puan`}
            className="h-3 overflow-hidden rounded-full bg-[var(--surface)]"
          >
            <div
              aria-hidden="true"
              className="h-full rounded-full bg-gradient-to-r from-[var(--focus)] to-[var(--growth)] transition-[width]"
              style={{ width: `${boss.progressPercent}%` }}
            />
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-xl bg-[var(--bg-secondary)] p-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-sub)]">
              <Users aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--focus-text)]" />
              Takım katılımı
            </div>
            <p className="mt-1 text-sm font-black">
              {team.activeMemberCount} / {team.memberCount} üye katkı verdi
            </p>
          </div>
          <div className="min-w-0 rounded-xl bg-[var(--bg-secondary)] p-3">
            <p className="text-xs font-bold text-[var(--text-sub)]">Senin katkın</p>
            <p className="mt-1 text-sm font-black">
              {team.ownerContribution} doğrulanmış puan
            </p>
          </div>
        </div>

        <div className="flex gap-2 rounded-xl bg-[var(--bg-secondary)] p-3 text-xs leading-relaxed text-[var(--text-sub)]">
          <LockKeyhole aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--focus-text)]" />
          <p>
            Yalnız takım toplamı ve kendi katkın görünür. Bu ortak hedef ekstra XP, coin veya bireysel sıralama üretmez.
          </p>
        </div>
      </div>
    </section>
  )
}
