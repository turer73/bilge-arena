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
      <div className="overflow-hidden rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] shadow-[0_5px_0_var(--app-border)]" role="status">
        <div className="px-4 py-6 text-center text-xs font-bold text-[var(--app-text-sub)]">
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
        className="animate-fadeUp overflow-hidden rounded-[22px] border-2 border-[var(--app-warn-border)] bg-[var(--app-card)] shadow-[0_5px_0_var(--app-warn-border)]"
        style={{ animationDelay: '0.28s', animationFillMode: 'both' }}
      >
        <div className="flex items-center justify-between gap-3 border-b-2 border-[var(--app-warn-border)] bg-[var(--app-warn-tint)] px-4 py-3">
          <div>
            <p className="text-[10px] font-black tracking-[0.16em] text-[var(--app-warn-ink)]">{title}</p>
            <p className="mt-0.5 text-[10px] font-semibold text-[var(--app-text-sub)]">
              {actionCount} soru · yaklaşık {estimatedMinutes} dk
            </p>
          </div>
          <span className="shrink-0 rounded-xl bg-[var(--app-card)] px-3 py-1.5 text-xs font-black text-[var(--app-warn-ink)] shadow-[0_2px_0_var(--app-warn-border)]">
            {completed}/{total}{isDone ? ' ✓' : ''}
          </span>
        </div>

        <div className="p-4 md:p-5">
          <h2 className="text-base font-black text-[var(--app-text)] md:text-lg">
            {isDone ? 'Bugünkü hedef tamamlandı' : completed > 0 ? 'Kaldığın yerden devam et' : 'Dengeli planın hazır'}
          </h2>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--app-text-sub)]">
            Tekrar zamanı gelenler, gelişmekte olan konular ve yeni sorular tek oturumda dengelendi.
          </p>

          {composition.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Plan dengesi">
              {composition.map((entry) => (
                <span
                  key={entry.label}
                  className="rounded-xl border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] px-2.5 py-1 text-[10px] font-bold text-[var(--app-text-sub)]"
                >
                  {entry.count} {entry.label}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--app-border-soft)] p-[2px]" aria-hidden="true">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${pct}%`,
                background: 'var(--app-warn-strong)',
                boxShadow: isDone ? '0 0 8px color-mix(in srgb, var(--reward) 50%, transparent)' : undefined,
              }}
            />
          </div>
          <p className="mt-1.5 text-right text-[10px] font-bold text-[var(--app-text-sub)]">
            %{pct} tamamlandı
          </p>

          <button
            type="button"
            onClick={onStart}
            className={`mt-4 min-h-12 w-full rounded-2xl bg-[var(--app-accent)] px-4 text-sm font-black tracking-wide text-white shadow-[0_5px_0_var(--app-accent-strong)] active:translate-y-1 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)] ${showStickyMobileAction ? 'hidden md:block' : ''}`}
          >
            {actionLabel} · {actionCount} Soru
          </button>
          {paperHref && (
            <Link
              href={paperHref}
              className="mt-2 flex min-h-11 w-full items-center justify-center rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card-sunken)] px-4 text-xs font-black text-[var(--app-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]"
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
          <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-[20px] border-2 border-[var(--app-warn-border)] bg-[var(--app-card)]/96 p-2.5 shadow-[0_5px_0_var(--app-warn-border),0_12px_30px_rgba(15,23,42,.18)] backdrop-blur-xl">
            <div className="min-w-0 flex-1 pl-1">
              <p className="truncate text-[10px] font-black tracking-wide text-[var(--app-warn-ink)]">BUGÜNÜN PLANI</p>
              <p className="truncate text-[10px] font-semibold text-[var(--app-text-sub)]">{actionCount} soru · yaklaşık {estimatedMinutes} dk</p>
            </div>
            <button
              type="button"
              onClick={onStart}
              aria-label={`${actionLabel}: ${actionCount} soru`}
              className="min-h-11 shrink-0 rounded-2xl bg-[var(--app-accent)] px-4 text-xs font-black text-white shadow-[0_4px_0_var(--app-accent-strong)] active:translate-y-0.5 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)]"
            >
              {actionLabel}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
