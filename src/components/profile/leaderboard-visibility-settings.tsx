'use client'

import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

interface LeaderboardVisibilitySettingsProps {
  compact?: boolean
}

/**
 * Public leaderboard participation is separate from profile discovery.
 * Migration 177 keeps every account hidden until this explicit opt-in.
 */
export function LeaderboardVisibilitySettings({ compact = false }: LeaderboardVisibilitySettingsProps) {
  const profile = useAuthStore((state) => state.profile)
  const setProfile = useAuthStore((state) => state.setProfile)
  const [saving, setSaving] = useState(false)

  // App-first rollout: migration 177 uygulanana kadar alan profile cevabinda
  // yoktur. Kırık bir anahtar göstermek yerine kontrolü gizli tut.
  if (!profile || profile.leaderboard_opt_in === undefined) return null

  const isVisible = profile.leaderboard_opt_in ?? false

  const toggle = async () => {
    if (saving) return

    const next = !isVisible
    setSaving(true)

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderboard_opt_in: next }),
      })

      if (!response.ok) {
        toast.error('Sıralama tercihi güncellenemedi')
        return
      }

      setProfile({ ...profile, leaderboard_opt_in: next })
      toast.success(next ? 'Açık sıralamaya isteğinle katıldın' : 'Açık sıralamadan ayrıldın')
    } catch {
      toast.error('Sıralama tercihi güncellenemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      data-leaderboard-visibility
      className={`rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] shadow-[0_4px_0_var(--app-border)] ${compact ? 'p-3.5' : 'p-4'}`}
      aria-labelledby="leaderboard-visibility-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--app-warn-tint)] text-[var(--app-warn)]">
              <Trophy size={17} aria-hidden />
            </span>
            <div>
              <h3 id="leaderboard-visibility-title" className="text-sm font-black text-[var(--app-text)]">
                Açık sıralamaya katıl
              </h3>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--app-text-muted)]">
                Varsayılan: gizli
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs font-medium leading-relaxed text-[var(--app-text-sub)]">
            Açarsan kullanıcı adın, avatarın, XP&apos;n, seviyen ve seçtiğin profil süsleri haftalık
            ve tüm zamanlar sıralamasında herkese görünür. Kapalıyken oyun ilerlemen devam eder
            ama listelerde yer almazsın.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isVisible}
          aria-label="Açık sıralamaya katılım"
          disabled={saving}
          onClick={toggle}
          className="relative -my-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-50"
        >
          <span
            aria-hidden
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isVisible ? 'bg-[var(--app-success)]' : 'bg-[var(--app-disabled)]'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-[var(--app-card)] shadow transition-transform ${
                isVisible ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </div>
    </section>
  )
}
