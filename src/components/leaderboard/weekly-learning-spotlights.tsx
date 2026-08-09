'use client'

import Image from 'next/image'
import {
  CalendarCheck2,
  LockKeyhole,
  RotateCcw,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useLearningSpotlights } from '@/lib/hooks/use-learning-spotlights'
import type { LearningSpotlightsResult } from '@/lib/social-league/server-contract'

type SpotlightKind = keyof LearningSpotlightsResult['boards']
type SpotlightBoard = LearningSpotlightsResult['boards'][SpotlightKind]

const BOARD_META = {
  improved: {
    title: 'En Çok Gelişen',
    description: 'Kendi önceki 28 günlük düzeyine göre en çok ilerleyenler.',
    icon: TrendingUp,
    iconClass: 'text-[var(--growth-text)] bg-[var(--growth-bg)]',
  },
  consistent: {
    title: 'En Düzenli',
    description: 'Farklı günlere yayılan doğrulanmış çalışma alışkanlığı.',
    icon: CalendarCheck2,
    iconClass: 'text-[var(--focus-text)] bg-[var(--focus-bg)]',
  },
  comeback: {
    title: 'En İyi Geri Dönüş',
    description: 'Bir aradan sonra yeniden düzenli çalışmaya başlayanlar.',
    icon: RotateCcw,
    iconClass: 'text-[var(--wisdom-text)] bg-[var(--wisdom-bg)]',
  },
} as const

function SpotlightAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return avatarUrl ? (
    <Image
      src={avatarUrl}
      alt=""
      width={32}
      height={32}
      className="h-8 w-8 rounded-full object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] text-sm font-black text-[var(--text-sub)]"
    >
      {name.slice(0, 1).toLocaleUpperCase('tr-TR')}
    </span>
  )
}

function formatSpotlightValue(kind: SpotlightKind, value: number): string {
  if (kind !== 'improved') return `${value} aktif gün`
  const decimal = (value / 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')
  return `+${decimal} puan`
}

function SpotlightBoardCard({ kind, board }: { kind: SpotlightKind; board: SpotlightBoard }) {
  const meta = BOARD_META[kind]
  const Icon = meta.icon
  const headingId = `learning-spotlight-${kind}`

  return (
    <article className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.iconClass}`}>
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 id={headingId} className="text-sm font-black">{meta.title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-sub)]">
            {meta.description}
          </p>
        </div>
      </div>

      {board.entries.length === 0 ? (
        <p className="mt-4 rounded-lg bg-[var(--card-bg)] p-3 text-xs leading-relaxed text-[var(--text-sub)]">
          Bu hafta henüz yeterli doğrulanmış örnek yok.
        </p>
      ) : (
        <ol aria-labelledby={headingId} className="mt-4 space-y-2">
          {board.entries.map((entry, index) => (
            <li
              key={`${entry.rank}-${entry.name}-${index}`}
              className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-xs ${
                entry.isMe ? 'bg-[var(--focus-bg)]' : 'bg-[var(--card-bg)]'
              }`}
            >
              <span className="w-5 shrink-0 font-display font-black text-[var(--text-sub)]">
                {entry.rank}
              </span>
              <SpotlightAvatar name={entry.name} avatarUrl={entry.avatarUrl} />
              <span className="min-w-0 flex-1 truncate font-semibold">
                {entry.name}{entry.isMe ? ' (Sen)' : ''}
              </span>
              <strong className="shrink-0 text-[var(--focus-text)]">
                {formatSpotlightValue(kind, entry.value)}
              </strong>
            </li>
          ))}
        </ol>
      )}

      {board.me.eligible && board.me.rank !== null && (
        <p className="mt-3 text-xs font-semibold text-[var(--text-sub)]">
          Senin sıran: #{board.me.rank}
        </p>
      )}
    </article>
  )
}

interface WeeklyLearningSpotlightsViewProps {
  result: LearningSpotlightsResult | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function WeeklyLearningSpotlights() {
  const spotlights = useLearningSpotlights()
  return <WeeklyLearningSpotlightsView {...spotlights} />
}

export function WeeklyLearningSpotlightsView({
  result,
  loading,
  error,
  refresh,
}: WeeklyLearningSpotlightsViewProps) {
  if (loading) {
    return (
      <section
        aria-labelledby="learning-spotlights-heading"
        aria-busy="true"
        className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5"
      >
        <h2 id="learning-spotlights-heading" className="font-display text-lg font-black">
          Olumlu Öğrenme Spotları
        </h2>
        <p className="mt-3 animate-pulse text-sm text-[var(--text-muted)]">Spotlar hazırlanıyor…</p>
      </section>
    )
  }

  if (!result) {
    return (
      <section
        aria-labelledby="learning-spotlights-heading"
        className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5"
      >
        <h2 id="learning-spotlights-heading" className="font-display text-lg font-black">
          Olumlu Öğrenme Spotları
        </h2>
        <p role="alert" className="mt-2 text-sm text-[var(--urgency-text)]">
          {error ?? 'Olumlu öğrenme spotları şu anda alınamıyor.'}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 min-h-11 rounded-xl bg-[var(--focus)] px-4 text-sm font-bold text-white"
        >
          Tekrar dene
        </button>
      </section>
    )
  }

  if (result.status === 'opted_out' || result.status === 'waiting') return null

  return (
    <section
      aria-labelledby="learning-spotlights-heading"
      className="mb-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)]"
    >
      <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--reward-bg)] text-[var(--reward-text)]">
            <Sparkles aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="learning-spotlights-heading" className="font-display text-lg font-black">
                Olumlu Öğrenme Spotları
              </h2>
              {result.status === 'finalized' && (
                <span className="rounded-full bg-[var(--growth-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--growth-text)]">
                  Hafta tamamlandı
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-sub)] sm:text-sm">
              Ham XP değil; gelişim, düzen ve yeniden başlama görünür olur.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-3">
          {(Object.keys(BOARD_META) as SpotlightKind[]).map((kind) => (
            <SpotlightBoardCard key={kind} kind={kind} board={result.boards[kind]} />
          ))}
        </div>

        <div className="flex gap-2 rounded-xl bg-[var(--bg-secondary)] p-3 text-xs leading-relaxed text-[var(--text-sub)]">
          <LockKeyhole aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--focus-text)]" />
          <p>
            Yalnız olumlu ilk üç ve kendi satırın görünür. Eksik çalışma, alt sıralar ve ara verilen gün sayısı paylaşılmaz.
          </p>
        </div>
      </div>
    </section>
  )
}
