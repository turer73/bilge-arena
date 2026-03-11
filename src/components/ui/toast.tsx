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
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 sm:top-5 sm:right-5">
      {toasts.map((t) => {
        const style = TYPE_STYLES[t.type]
        return (
          <div
            key={t.id}
            className="animate-slideDown flex w-[300px] max-w-[calc(100vw-32px)] items-start gap-2.5 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm cursor-pointer transition-all hover:scale-[1.02]"
            style={{
              background: style.bg,
              borderColor: style.border,
              boxShadow: `0 4px 24px color-mix(in srgb, ${style.glow} 20%, transparent)`,
            }}
            onClick={() => removeToast(t.id)}
            role="alert"
          >
            {t.icon && <span className="mt-0.5 text-lg flex-shrink-0">{t.icon}</span>}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold">{t.title}</div>
              {t.description && (
                <div className="mt-0.5 text-[11px] text-[var(--text-sub)] leading-relaxed">{t.description}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
