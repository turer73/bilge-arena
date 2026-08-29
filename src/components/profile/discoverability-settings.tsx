'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Globe2, LockKeyhole, UserRoundCheck } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

type ProfileVisibility = 'private' | 'friends' | 'public'

const VISIBILITY_OPTIONS: Array<{
  value: ProfileVisibility
  label: string
  description: string
  Icon: typeof LockKeyhole
}> = [
  { value: 'private', label: 'Sadece ben', description: 'Profil bağlantını yalnız sen açabilirsin.', Icon: LockKeyhole },
  { value: 'friends', label: 'Arkadaşlarım', description: 'Yalnız kabul ettiğin arkadaşların görebilir.', Icon: UserRoundCheck },
  { value: 'public', label: 'Herkes', description: 'Bağlantıya sahip herkes profilini görebilir.', Icon: Globe2 },
]

/** Aramada bulunabilirlik ve profil hedef kitlesi birbirinden bağımsızdır. */
export function DiscoverabilitySettings() {
  const profile = useAuthStore((state) => state.profile)
  const setProfile = useAuthStore((state) => state.setProfile)
  const [savingField, setSavingField] = useState<'discovery' | 'visibility' | null>(null)

  if (!profile) return null
  const isDiscoverable = profile.is_discoverable ?? false
  // Migration 185 gelmeden once alan yoksa fail-closed davran.
  const profileVisibility: ProfileVisibility = profile.profile_visibility ?? 'private'

  const updateProfile = async (
    body: { is_discoverable: boolean } | { profile_visibility: ProfileVisibility },
    nextProfile: typeof profile,
    successMessage: string,
  ) => {
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        toast.error('Gizlilik tercihi güncellenemedi')
        return false
      }

      setProfile(nextProfile)
      toast.success(successMessage)
      return true
    } catch {
      toast.error('Bağlantı kurulamadı. Tekrar deneyebilirsin.')
      return false
    }
  }

  const toggleDiscovery = async () => {
    if (savingField) return
    setSavingField('discovery')
    const next = !isDiscoverable
    await updateProfile(
      { is_discoverable: next },
      { ...profile, is_discoverable: next },
      next ? 'Artık arkadaş aramasında görünüyorsun' : 'Arkadaş aramasında gizlendin',
    )
    setSavingField(null)
  }

  const changeVisibility = async (next: ProfileVisibility) => {
    if (savingField || next === profileVisibility) return
    setSavingField('visibility')
    await updateProfile(
      { profile_visibility: next },
      { ...profile, profile_visibility: next },
      'Profil hedef kitlesi güncellendi',
    )
    setSavingField(null)
  }

  return (
    <section aria-labelledby="profile-privacy-title" className="rounded-2xl border-2 border-[var(--app-border)] bg-[var(--app-card)] p-4 shadow-[0_4px_0_var(--app-border)]">
      <div>
        <h3 id="profile-privacy-title" className="text-sm font-black text-[var(--app-text)]">🔐 Profili kimler görebilir?</h3>
        <p className="mt-1 text-xs font-medium leading-relaxed text-[var(--app-text-sub)]">
          Bu tercih profil bağlantındaki istatistikleri korur. E-posta, şehir ve gerçek ad hiçbir seçenekte paylaşılmaz.
        </p>
      </div>

      <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Profil hedef kitlesi">
        {VISIBILITY_OPTIONS.map(({ value, label, description, Icon }) => {
          const active = profileVisibility === value
          return (
            <button
              type="button"
              role="radio"
              aria-checked={active}
              disabled={savingField !== null}
              key={value}
              onClick={() => changeVisibility(value)}
              className={`flex min-h-[64px] items-center gap-3 rounded-2xl border-2 p-3 text-left disabled:opacity-60 ${active ? 'border-[var(--app-accent)] bg-[var(--app-accent-tint)]' : 'border-[var(--app-border)] bg-[var(--app-bg)]'}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--app-card)] text-[var(--app-accent-text)]">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-[var(--app-text)]">{label}</span>
                <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-[var(--app-text-sub)]">{description}</span>
              </span>
              {active && <Check size={18} strokeWidth={3.5} className="shrink-0 text-[var(--app-accent-text)]" aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex items-start justify-between gap-3 border-t-2 border-[var(--app-border-soft)] pt-4">
        <div>
          <h4 className="text-sm font-black text-[var(--app-text)]">Arkadaş aramasında görün</h4>
          <p className="mt-1 text-[11px] font-semibold leading-4 text-[var(--app-text-sub)]">
            Kapalıyken yeni kişiler seni arayamaz; mevcut arkadaşların etkilenmez.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isDiscoverable}
          aria-label="Arkadaş aramasında görün"
          disabled={savingField !== null}
          onClick={toggleDiscovery}
          className="relative -my-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-50"
        >
          <span aria-hidden="true" className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDiscoverable ? 'bg-[var(--app-success)]' : 'bg-[var(--app-disabled)]'}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-[var(--app-card)] shadow transition-transform ${isDiscoverable ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </span>
        </button>
      </div>

      {profileVisibility !== 'private' && profile.username && (
        <div className="mt-3 flex justify-end">
          <Link
            href={`/u/${encodeURIComponent(profile.username)}`}
            className="inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-black text-[var(--app-accent-text)] hover:bg-[var(--app-accent-tint)]"
          >
            Profilimi görüntüle
          </Link>
        </div>
      )}
    </section>
  )
}
