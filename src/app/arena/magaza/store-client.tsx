'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import {
  PROFILE_BACKGROUNDS,
  BACKGROUND_CATEGORIES,
  BACKGROUND_RARITY_LABEL,
  BACKGROUND_STORAGE_KEY,
  type BackgroundCategory,
  type ProfileBackgroundDef,
} from '@/lib/constants/profile-backgrounds'
import { toast } from '@/stores/toast-store'

/**
 * Arka Plan Mağazası (Ensar mockup'ı, Faz-1):
 * kategori chip'leri → önizlemeli katalog → seçili ürün detayı
 * (fiyat + bakiye + Satın Al / Uygula). Seçim localStorage'da
 * (profil çerçevesi deseniyle aynı). Çözünürlük seçimi + video Faz-2.
 */
export function StoreClient() {
  const { user, profile, setProfile } = useAuthStore()
  const [category, setCategory] = useState<BackgroundCategory | 'all'>('all')
  const [selectedId, setSelectedId] = useState(PROFILE_BACKGROUNDS[1].id)
  const [appliedId, setAppliedId] = useState('none')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(BACKGROUND_STORAGE_KEY)
      if (saved && PROFILE_BACKGROUNDS.some((b) => b.id === saved)) setAppliedId(saved)
    } catch {}
  }, [])

  const owned = useMemo(
    () => new Set(profile?.owned_backgrounds ?? ['none', 'gece-mavisi']),
    [profile?.owned_backgrounds],
  )
  const visible = useMemo(
    () => PROFILE_BACKGROUNDS.filter((b) => category === 'all' || b.category === category),
    [category],
  )
  const selected: ProfileBackgroundDef =
    PROFILE_BACKGROUNDS.find((b) => b.id === selectedId) ?? PROFILE_BACKGROUNDS[0]
  const selectedOwned = owned.has(selected.id) || selected.coinCost === undefined
  const balance = profile?.coin_balance ?? 0

  const applyBackground = (id: string) => {
    setAppliedId(id)
    try { localStorage.setItem(BACKGROUND_STORAGE_KEY, id) } catch {}
    toast.success('Arka plan uygulandı', 'Profilinde görüntülenecek ✨')
  }

  const buy = async () => {
    if (!selected.coinCost) return
    setBusy(true)
    try {
      const res = await fetch('/api/profile/backgrounds/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundId: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Satın alınamadı', data.error ?? 'Bir şeyler ters gitti')
        return
      }
      // Profili güncelle (bakiye + sahiplik) ve hemen uygula
      if (profile) {
        setProfile({
          ...profile,
          coin_balance: data.coin_balance,
          owned_backgrounds: data.owned_backgrounds,
        })
      }
      applyBackground(selected.id)
      toast.success('Satın alındı! 🪙', `Yeni bakiye: ${data.coin_balance}`)
    } catch {
      toast.error('Bağlantı hatası', 'Tekrar dene')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-5">
      {/* Kategori chip'leri */}
      <div className="flex flex-wrap gap-2">
        {BACKGROUND_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
              category === c.id
                ? 'border-[var(--focus)] bg-[var(--focus-bg)] text-[var(--focus)]'
                : 'border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-sub)] hover:border-[var(--focus-border)]'
            }`}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* Katalog grid'i */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {visible.map((bg) => {
          const isOwned = owned.has(bg.id) || bg.coinCost === undefined
          return (
            <button
              key={bg.id}
              onClick={() => setSelectedId(bg.id)}
              aria-label={`${bg.name} önizleme`}
              className={`group relative overflow-hidden rounded-xl border-2 text-left transition-all hover:-translate-y-0.5 ${
                selectedId === bg.id ? 'border-[var(--focus)] shadow-lg' : 'border-[var(--border)]'
              }`}
            >
              <div
                className={`h-20 w-full md:h-24 ${bg.animClass ?? ''}`}
                style={{ background: bg.css }}
              />
              <div className="flex items-center justify-between bg-[var(--card-bg)] px-2 py-1.5">
                <span className="truncate text-[11px] font-bold text-[var(--text)]">{bg.name}</span>
                <span className="shrink-0 text-[10px] font-bold text-[var(--reward)]">
                  {isOwned ? '✓' : `🪙${bg.coinCost}`}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Seçili ürün detayı */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Önizleme: profil kartı taklidi */}
          <div
            className={`relative h-32 w-full overflow-hidden rounded-xl sm:w-56 ${selected.animClass ?? ''}`}
            style={{ background: selected.css }}
          >
            <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 rounded-lg bg-black/35 px-2 py-1.5 backdrop-blur-sm">
              <div className="h-6 w-6 rounded-full bg-white/70" />
              <div className="flex flex-col gap-1">
                <div className="h-1.5 w-16 rounded bg-white/70" />
                <div className="h-1.5 w-10 rounded bg-white/40" />
              </div>
            </div>
            <span className="absolute right-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[9px] text-white">
              Profil Önizleme
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-black text-[var(--text)]">{selected.name}</h2>
              <span className="rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-[var(--text-sub)]">
                {BACKGROUND_RARITY_LABEL[selected.rarity]}
              </span>
            </div>
            <p className="text-sm text-[var(--text-sub)]">{selected.description}</p>
            {selected.coinCost !== undefined && !owned.has(selected.id) && (
              <p className="mt-1 text-sm font-bold text-[var(--text)]">
                Ürün Fiyatı: <span className="text-[var(--reward)]">🪙 {selected.coinCost}</span>
              </p>
            )}

            <div className="mt-auto flex items-center justify-between pt-3">
              <span className="text-xs text-[var(--text-sub)]">
                Bakiyeniz: <strong className="text-[var(--reward)]">🪙 {balance.toLocaleString('tr-TR')}</strong>
              </span>

              {!user ? (
                <Link
                  href="/giris?redirect=/arena/magaza"
                  className="rounded-lg bg-[var(--focus)] px-4 py-2 text-xs font-bold text-white"
                >
                  Giriş Yap
                </Link>
              ) : selectedOwned ? (
                appliedId === selected.id ? (
                  <span className="rounded-lg bg-[var(--growth-bg)] px-4 py-2 text-xs font-bold text-[var(--growth)]">
                    ✓ Uygulandı
                  </span>
                ) : (
                  <button
                    onClick={() => applyBackground(selected.id)}
                    className="rounded-lg bg-[var(--growth)] px-4 py-2 text-xs font-bold text-white transition-transform hover:scale-105"
                  >
                    Uygula
                  </button>
                )
              ) : (
                <button
                  onClick={buy}
                  disabled={busy || balance < (selected.coinCost ?? 0)}
                  className="rounded-lg bg-gradient-to-r from-[var(--urgency)] to-[var(--reward)] px-5 py-2 text-xs font-bold text-white transition-transform hover:scale-105 disabled:opacity-50"
                >
                  {busy ? 'Alınıyor…' : 'Şimdi Al'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-[var(--text-sub)]">
        Coin kazanmak için quiz çöz, görev tamamla. Video arka planlar yakında!
      </p>
    </div>
  )
}
