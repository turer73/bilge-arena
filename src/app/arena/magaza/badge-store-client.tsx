'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import {
  COSMETIC_BADGE_RARITY_LABEL,
  rowToBadgeItem,
  PUBLISHED_BADGES_ENDPOINT,
  type StoreBadgeItem,
  type CosmeticBadgeRow,
} from '@/lib/constants/cosmetic-badges'
import { toast } from '@/stores/toast-store'

/**
 * Kozmetik rozet mağazası. Rozetler tümü DB'de (admin yükler). Satın alınca
 * profil rozet rafında otomatik görünür — "uygula" kavramı yok (tüm sahip
 * olunan rozetler gösterilir).
 */
export function BadgeStoreClient() {
  const { user, profile, setProfile } = useAuthStore()
  const [items, setItems] = useState<StoreBadgeItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    let active = true
    fetch(PUBLISHED_BADGES_ENDPOINT)
      .then((r) => (r.ok ? r.json() : { badges: [] }))
      .then((d: { badges: CosmeticBadgeRow[] }) => {
        if (!active) return
        const mapped = (d.badges ?? []).map(rowToBadgeItem)
        setItems(mapped)
        if (mapped.length > 0) setSelectedId((cur) => cur ?? mapped[0].id)
        setLoaded(true)
      })
      .catch(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  const owned = useMemo(
    () => new Set(profile?.owned_cosmetic_badges ?? []),
    [profile?.owned_cosmetic_badges],
  )
  const selected = items.find((b) => b.id === selectedId) ?? null
  const balance = profile?.coin_balance ?? 0

  const buy = async () => {
    if (!selected) return
    setBusy(true)
    try {
      const res = await fetch('/api/profile/cosmetic-badges/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badgeId: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Satın alınamadı', data.error ?? 'Bir şeyler ters gitti')
        return
      }
      if (profile) {
        setProfile({
          ...profile,
          coin_balance: data.coin_balance,
          owned_cosmetic_badges: data.owned_cosmetic_badges,
        })
      }
      toast.success('Rozet alındı! 🏅', 'Profilinde görüntülenecek')
    } catch {
      toast.error('Bağlantı hatası', 'Tekrar dene')
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }

  if (loaded && items.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-6 text-center text-sm text-[var(--text-sub)]">
        Henüz rozet yok — yakında! 🏅
      </p>
    )
  }

  return (
    <div className="mt-5 flex flex-col gap-5">
      {/* Katalog grid'i */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((b) => {
          const isOwned = owned.has(b.id)
          return (
            <button
              key={b.id}
              onClick={() => setSelectedId(b.id)}
              aria-label={`${b.name} önizleme`}
              className={`group flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition-all hover:-translate-y-0.5 ${
                selectedId === b.id ? 'border-[var(--focus)] shadow-lg' : 'border-[var(--border)]'
              } bg-[var(--card-bg)]`}
            >
              {b.iconUrl ? (
                 
                <img src={b.iconUrl} alt={b.name} className="h-14 w-14 object-contain" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center text-3xl">🏅</div>
              )}
              <span className="truncate text-[11px] font-bold text-[var(--text)]">{b.name}</span>
              <span className="text-[10px] font-bold text-[var(--reward)]">
                {isOwned ? '✓ Sahipsin' : `🪙${b.coinCost}`}
              </span>
            </button>
          )
        })}
      </div>

      {/* Seçili rozet detayı */}
      {selected && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
          <div className="flex items-center gap-4">
            {selected.iconUrl ? (
               
              <img src={selected.iconUrl} alt={selected.name} className="h-20 w-20 shrink-0 object-contain" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center text-4xl">🏅</div>
            )}
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-black text-[var(--text)]">{selected.name}</h2>
                <span className="rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-[var(--text-sub)]">
                  {COSMETIC_BADGE_RARITY_LABEL[selected.rarity]}
                </span>
              </div>
              <p className="text-sm text-[var(--text-sub)]">{selected.description}</p>
              <div className="mt-auto flex items-center justify-between pt-2">
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
                ) : owned.has(selected.id) ? (
                  <span className="rounded-lg bg-[var(--growth-bg)] px-4 py-2 text-xs font-bold text-[var(--growth)]">
                    ✓ Sahipsin
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmOpen(true)}
                    disabled={busy || balance < selected.coinCost}
                    className="rounded-lg bg-gradient-to-r from-[var(--urgency)] to-[var(--reward)] px-5 py-2 text-xs font-bold text-white transition-transform hover:scale-105 disabled:opacity-50"
                  >
                    {balance < selected.coinCost ? 'Yetersiz Coin' : 'Şimdi Al'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onay modalı */}
      {confirmOpen && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setConfirmOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-lg font-black text-[var(--text)]">Satın almayı onayla</h3>
            <p className="mt-2 text-sm text-[var(--text-sub)]">
              <strong className="text-[var(--text)]">{selected.name}</strong> rozetini{' '}
              <span className="font-bold text-[var(--reward)]">🪙 {selected.coinCost}</span> coin
              karşılığında alıyorsun.
            </p>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--surface)] px-3 py-2 text-xs">
              <span className="text-[var(--text-sub)]">Kalan bakiye</span>
              <strong className="text-[var(--reward)]">
                🪙 {(balance - selected.coinCost).toLocaleString('tr-TR')}
              </strong>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--text-sub)] disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                onClick={buy}
                disabled={busy}
                className="flex-1 rounded-lg bg-gradient-to-r from-[var(--urgency)] to-[var(--reward)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? 'Alınıyor…' : 'Onayla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
