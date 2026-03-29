'use client'

import { usePushNotifications } from '@/lib/hooks/use-push-notifications'

/**
 * Push bildirim ayarlari paneli.
 * Profil sayfasinda gosterilir.
 */
export function NotificationSettings() {
  const { status, subscribe, unsubscribe } = usePushNotifications()

  if (status === 'unsupported') return null

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Bildirimler</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Seri hatirlatmalari ve onemli guncellemeler icin bildirim al.
      </p>

      <div className="mt-3">
        {status === 'denied' && (
          <p className="text-xs text-[var(--urgency)]">
            Bildirimler tarayici tarafindan engellendi. Tarayici ayarlarindan izin verin.
          </p>
        )}

        {status === 'prompt' && (
          <button
            onClick={subscribe}
            className="rounded-lg bg-[var(--focus)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--focus)]/90"
          >
            Bildirimleri Ac
          </button>
        )}

        {status === 'subscribed' && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--growth)]">Bildirimler aktif</span>
            <button
              onClick={unsubscribe}
              className="text-xs text-[var(--muted)] underline hover:text-[var(--foreground)]"
            >
              Kapat
            </button>
          </div>
        )}

        {status === 'loading' && (
          <div className="h-8 w-32 animate-pulse rounded-lg bg-[var(--border)]" />
        )}
      </div>
    </div>
  )
}
