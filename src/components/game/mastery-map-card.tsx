'use client'

import type { MasteryOutcome } from '@/lib/hooks/use-mastery-map'

interface MasteryMapCardProps {
  outcomes: MasteryOutcome[]
  loading: boolean
}

const STATUS_LABEL = {
  insufficient: 'Kanıt birikiyor',
  developing: 'Gelişiyor',
  mastered: 'Ustalaştın',
} as const

/** Lobi özeti; ayrıntılı kanıt ağacı ayrı hâkimiyet ekranında gösterilir. */
export function MasteryMapCard({ outcomes, loading }: MasteryMapCardProps) {
  if (loading || outcomes.length === 0) return null

  const outcome = outcomes[0]
  const progress = outcome.status === 'insufficient' ? outcome.evidenceCompleteness : outcome.score

  return (
    <div className="animate-fadeUp overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]" style={{ animationDelay: '0.34s', animationFillMode: 'both' }}>
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
        <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          KAZANIM ÖZETİ · İÇ GRAFİK
        </span>
        <span className="text-[10px] font-bold text-[var(--growth)]">
          {STATUS_LABEL[outcome.status]}
        </span>
      </div>

      <div className="px-3 py-3">
        <div className="mb-1 flex items-start justify-between gap-3">
          <p className="text-xs font-bold text-[var(--text)]">{outcome.title}</p>
          <span className="shrink-0 text-xs font-extrabold text-[var(--growth)]">
            {outcome.status === 'insufficient' ? `${outcome.attempts}/3 kanıt` : `%${outcome.score}`}
          </span>
        </div>
        <p className="mb-2 text-[10px] leading-relaxed text-[var(--text-sub)]">
          Bilge Arena öğrenme grafiğidir; resmî kazanım sınıflandırması değildir.
        </p>

        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-full rounded-full bg-[var(--growth)] transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between text-[9px] font-semibold text-[var(--text-sub)]">
          <span>{outcome.correctAttempts}/{outcome.attempts} doğru</span>
          <span>{outcome.delayedCorrect} gecikmeli doğru</span>
        </div>
      </div>
    </div>
  )
}
