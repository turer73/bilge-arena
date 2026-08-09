'use client'

import Link from 'next/link'
import type { TodayPlan } from '@/lib/hooks/use-today-plan'

interface TodayPlanCardProps {
  plan: TodayPlan | null
  loading: boolean
  onStart: () => void
  paperHref?: string | null
}

/**
 * "Bugunun 15'i" lobby karti -- daily-quests.tsx (header + progress-bar)
 * modelinden. Giris yapmamis / plan henuz yuklenmemis / plan uretilemedi
 * (bos havuz) durumlarinda sessizce gizlenir -- quiz akisini bloklamaz.
 */
export function TodayPlanCard({ plan, loading, onStart, paperHref }: TodayPlanCardProps) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
        <div className="px-3 py-4 text-center text-[11px] text-[var(--text-sub)]">
          Bugunun plani hazirlaniyor...
        </div>
      </div>
    )
  }

  if (!plan || plan.questions.length === 0) return null

  const total = plan.questions.length
  const completed = Math.min(plan.completedIds.length, total)
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const isDone = completed >= total
  const composition = [
    ['due', 'tekrar'],
    ['weak_outcome', 'zayıf kazanım'],
    ['current_target', 'hedef'],
    ['challenge', 'meydan okuma'],
    ['student_choice', 'senin seçimin'],
  ]
    .map(([slotType, label]) => ({
      label,
      count: (plan.items ?? []).filter((item) => item.slotType === slotType).length,
    }))
    .filter((entry) => entry.count > 0)

  return (
    <div className="animate-fadeUp overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]" style={{ animationDelay: '0.28s', animationFillMode: 'both' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
        <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          BUGÜNÜN 15&apos;İ
        </span>
        <span className="text-[10px] font-bold text-[var(--reward)]">
          {completed}/{total} {isDone ? '✓' : ''}
        </span>
      </div>

      <div className="px-3 py-3">
        <p className="mb-2 text-[11px] text-[var(--text-sub)]">
          Tekrar zamanı gelenler, zayıf konuların ve yeni sorulardan karma bir plan hazırladık.
        </p>

        {composition.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1" aria-label="Plan dengesi">
            {composition.map((entry) => (
              <span
                key={entry.label}
                className="rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-0.5 text-[9px] font-semibold text-[var(--text-sub)]"
              >
                {entry.count} {entry.label}
              </span>
            ))}
          </div>
        )}

        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-full rounded-full transition-[width] duration-600"
            style={{
              width: `${pct}%`,
              background: 'var(--reward)',
              boxShadow: isDone ? '0 0 6px color-mix(in srgb, var(--reward) 53%, transparent)' : undefined,
            }}
          />
        </div>

        <button
          onClick={onStart}
          className="btn-primary w-full rounded-[10px] py-2 text-xs font-bold tracking-wide transition-transform hover:scale-[1.02]"
        >
          {isDone ? '🔁 Tekrar Çöz' : completed > 0 ? '▶️ Devam Et' : '📝 Planı Başlat'} — {total} Soru
        </button>
        {paperHref && (
          <Link
            href={paperHref}
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-4 text-xs font-bold text-[var(--text)] transition-colors hover:bg-[var(--cardHover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            🖨️ Kağıt / PDF paketi
          </Link>
        )}
      </div>
    </div>
  )
}
