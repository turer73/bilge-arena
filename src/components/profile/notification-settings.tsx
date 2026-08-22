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
    <div className="rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_4px_0_var(--app-border)]">
      <h3 className="text-sm font-black text-[var(--app-text)]">🔔 Bildirimler</h3>
      <p className="mt-1 text-xs font-medium leading-relaxed text-[var(--app-text-sub)]">
        Seri hatırlatmaları ve önemli güncellemeler için bildirim al.
      </p>

      <div className="mt-3">
        {status === 'denied' && (
          <p className="text-xs text-[var(--urgency)]">
            Bildirimler tarayıcı tarafından engellendi. Tarayıcı ayarlarından izin verin.
          </p>
        )}

        {status === 'prompt' && (
          <button
            onClick={subscribe}
            className="min-h-11 rounded-xl border-2 border-[var(--app-accent-strong)] bg-[var(--app-accent)] px-4 py-2 text-sm font-black text-white shadow-[0_3px_0_var(--app-accent-strong)] active:translate-y-0.5 active:shadow-none"
          >
            Bildirimleri Aç
          </button>
        )}

        {status === 'subscribed' && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--growth)]">Bildirimler aktif</span>
            <button
              onClick={unsubscribe}
              className="min-h-11 min-w-11 px-2 text-xs text-[var(--muted)] underline hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
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
