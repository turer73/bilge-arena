'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from '@/stores/toast-store'

/**
 * Opt-in keşif ayarı: kullanıcı kullanıcı-aramasında görünür mü.
 * Yeni kullanıcılar varsayılan GİZLİ (migration 072 grandfather: mevcut TRUE, yeni FALSE);
 * buradan kendi bulunabilirliğini açar/kapatır. Yazma /api/profile PATCH (service-role).
 */
export function DiscoverabilitySettings() {
  const profile = useAuthStore((s) => s.profile)
  const setProfile = useAuthStore((s) => s.setProfile)
  const [saving, setSaving] = useState(false)

  if (!profile) return null
  const isDiscoverable = profile.is_discoverable ?? false

  const toggle = async () => {
    if (saving) return
    setSaving(true)
    const next = !isDiscoverable
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_discoverable: next }),
    })
    setSaving(false)
    if (res.ok) {
      setProfile({ ...profile, is_discoverable: next })
      toast.success(next ? 'Artık aramada görünüyorsun' : 'Aramada gizlendin')
    } else {
      toast.error('Güncellenemedi')
    }
  }

  return (
    <div className="rounded-2xl border-2 border-[#e2e8f0] bg-white p-4 shadow-[0_4px_0_#dbe2ea]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-[#1e293b]">🔎 Aramada Görünürlük</h3>
          <p className="mt-1 text-xs font-medium leading-relaxed text-[#64748b]">
            Açıkken diğer arenacılar seni kullanıcı aramasında bulup arkadaş ekleyebilir.
            Kapalıyken aramada çıkmazsın (mevcut arkadaşların etkilenmez).
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isDiscoverable}
          aria-label="Aramada görünürlük"
          disabled={saving}
          onClick={toggle}
          className="relative -my-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-50"
        >
          <span
            aria-hidden
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isDiscoverable ? 'bg-[#16a34a]' : 'bg-[#cbd5e1]'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                isDiscoverable ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </div>
    </div>
  )
}
