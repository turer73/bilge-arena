'use client'

import { useToastStore, type ToastType } from '@/stores/toast-store'

const TYPE_STYLES: Record<ToastType, { bg: string; border: string; glow: string }> = {
  success: { bg: 'var(--growth-bg)', border: 'var(--growth-border)', glow: 'var(--growth)' },
  error: { bg: 'var(--urgency-bg)', border: 'var(--urgency-border)', glow: 'var(--urgency)' },
  info: { bg: 'var(--focus-bg)', border: 'var(--focus-border)', glow: 'var(--focus)' },
  badge: { bg: 'var(--reward-bg)', border: 'var(--reward-border)', glow: 'var(--reward)' },
  quest: { bg: 'var(--wisdom-bg)', border: 'var(--wisdom-border)', glow: 'var(--wisdom)' },
  streak: { bg: 'var(--reward-bg)', border: 'var(--reward-border)', glow: 'var(--reward)' },
  level_up: { bg: 'var(--reward-bg)', border: 'var(--reward-border)', glow: 'var(--reward)' },
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-[100] flex -translate-x-1/2 flex-col-reverse gap-2 md:bottom-auto md:left-auto md:right-5 md:top-5 md:translate-x-0 md:flex-col">
      {toasts.map((t) => {
        const style = TYPE_STYLES[t.type]
        return (
          <div
            key={t.id}
            className="animate-slideDown flex w-[min(340px,calc(100vw-32px))] items-start gap-2.5 rounded-xl border py-2 pl-4 pr-2 text-left shadow-lg backdrop-blur-sm"
            style={{
              background: style.bg,
              borderColor: style.border,
              boxShadow: `0 4px 24px color-mix(in srgb, ${style.glow} 20%, transparent)`,
            }}
            role={t.type === 'error' ? 'alert' : 'status'}
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
          >
            {t.icon && <span className="mt-1.5 flex-shrink-0 text-lg" aria-hidden="true">{t.icon}</span>}
            <div className="min-w-0 flex-1 py-1.5">
              <div className="text-sm font-bold">{t.title}</div>
              {t.description && (
                <div className="mt-0.5 text-xs leading-relaxed text-[var(--text-sub)]">{t.description}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label={`${t.title} bildirimini kapat`}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-xl leading-none text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
