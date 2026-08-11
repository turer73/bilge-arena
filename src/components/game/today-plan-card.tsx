'use client'

import Link from 'next/link'
import type { TodayPlan } from '@/lib/hooks/use-today-plan'

interface TodayPlanCardProps {
  plan: TodayPlan | null
  loading: boolean
  onStart: () => void
  paperHref?: string | null
  showStickyMobileAction?: boolean
}

const COMPOSITION_LABELS = [
  ['due', 'tekrar zamanı'],
  ['weak_outcome', 'geliştirilecek'],
  ['current_target', 'yeni konu'],
  ['challenge', 'meydan okuma'],
  ['student_choice', 'senin seçimin'],
] as const

export function TodayPlanCard({
  plan,
  loading,
  onStart,
  paperHref,
  showStickyMobileAction = false,
}: TodayPlanCardProps) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)]" role="status">
        <div className="px-4 py-6 text-center text-xs text-[var(--text-sub)]">
          Bugünün planı hazırlanıyor...
        </div>
      </div>
    )
  }

  if (!plan || plan.questions.length === 0) return null

  const total = plan.questions.length
  const completedQuestionIds = new Set(plan.completedIds)
  const completed = plan.questions.filter((question) => completedQuestionIds.has(question.id)).length
  const remaining = Math.max(0, total - completed)
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  const isDone = completed >= total
  const actionCount = isDone ? total : remaining
  const estimatedMinutes = Math.max(2, Math.ceil(actionCount * 0.75))
  const title = total === 15 ? "BUGÜNÜN 15'İ" : `BUGÜNÜN PLANI · ${total} SORU`
  const actionLabel = isDone ? 'Tekrar Çöz' : completed > 0 ? 'Devam Et' : 'Planı Başlat'
  const composition = COMPOSITION_LABELS
    .map(([slotType, label]) => ({
      label,
      count: (plan.items ?? []).filter((item) => item.slotType === slotType).length,
    }))
    .filter((entry) => entry.count > 0)

  return (
    <>
      <article
        className="animate-fadeUp overflow-hidden rounded-2xl border border-[var(--reward)]/30 bg-[var(--card-bg)] shadow-sm"
        style={{ animationDelay: '0.28s', animationFillMode: 'both' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--reward)]/10 px-4 py-3">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.16em] text-[var(--reward-text)]">{title}</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-sub)]">
              {actionCount} soru · yaklaşık {estimatedMinutes} dk
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--reward)]/15 px-3 py-1 text-xs font-extrabold text-[var(--reward-text)]">
            {completed}/{total}{isDone ? ' ✓' : ''}
          </span>
        </div>

        <div className="p-4 md:p-5">
          <h2 className="text-base font-extrabold text-[var(--text)] md:text-lg">
            {isDone ? 'Bugünkü hedef tamamlandı' : completed > 0 ? 'Kaldığın yerden devam et' : 'Dengeli planın hazır'}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-sub)]">
            Tekrar zamanı gelenler, gelişmekte olan konular ve yeni sorular tek oturumda dengelendi.
          </p>

          {composition.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Plan dengesi">
              {composition.map((entry) => (
                <span
                  key={entry.label}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-sub)]"
                >
                  {entry.count} {entry.label}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--border)]" aria-hidden="true">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${pct}%`,
                background: 'var(--reward)',
                boxShadow: isDone ? '0 0 8px color-mix(in srgb, var(--reward) 50%, transparent)' : undefined,
              }}
            />
          </div>
          <p className="mt-1.5 text-right text-[10px] font-semibold text-[var(--text-sub)]">
            %{pct} tamamlandı
          </p>

          <button
            type="button"
            onClick={onStart}
            className={`btn-primary mt-4 min-h-12 w-full rounded-xl px-4 text-sm font-extrabold tracking-wide transition-transform hover:scale-[1.01] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${showStickyMobileAction ? 'hidden md:block' : ''}`}
          >
            {actionLabel} · {actionCount} Soru
          </button>
          {paperHref && (
            <Link
              href={paperHref}
              className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-xs font-bold text-[var(--text)] transition-colors hover:bg-[var(--cardHover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              🖨️ Kağıt / PDF paketi
            </Link>
          )}
        </div>
      </article>

      {showStickyMobileAction && (
        <div
          className="pointer-events-none fixed inset-x-3 z-30 md:hidden"
          style={{ bottom: 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom) + 0.75rem)' }}
        >
          <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[var(--reward)]/30 bg-[var(--card-bg)]/95 p-2.5 shadow-2xl backdrop-blur-xl">
            <div className="min-w-0 flex-1 pl-1">
              <p className="truncate text-[10px] font-extrabold tracking-wide text-[var(--reward-text)]">BUGÜNÜN PLANI</p>
              <p className="truncate text-[10px] text-[var(--text-sub)]">{actionCount} soru · yaklaşık {estimatedMinutes} dk</p>
            </div>
            <button
              type="button"
              onClick={onStart}
              aria-label={`${actionLabel}: ${actionCount} soru`}
              className="btn-primary min-h-11 shrink-0 rounded-xl px-4 text-xs font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              {actionLabel}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
