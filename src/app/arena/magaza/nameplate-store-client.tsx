'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import {
  PROFILE_NAMEPLATES,
  NAMEPLATE_CATEGORIES,
  NAMEPLATE_RARITY_LABEL,
  type NameplateRarity,
  type NameplateDef,
} from '@/lib/constants/profile-nameplates'
import { Nameplate } from '@/components/profile/nameplate'
import { toast } from '@/stores/toast-store'

/**
 * İsim Paneli (Nameplate) mağazası. Arka plan mağazasıyla aynı akış AMA seçim
 * DB'de (selected_nameplate) — "Uygula" /select API'sine yazar (sıralamada
 * başkalarına görünür). Satın-alma /purchase, sonra otomatik uygula.
 */
export function NameplateStoreClient() {
  const { user, profile, setProfile } = useAuthStore()
  const [category, setCategory] = useState<NameplateRarity | 'all'>('all')
  const [selectedId, setSelectedId] = useState(PROFILE_NAMEPLATES[1].id)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const owned = useMemo(
    () => new Set(profile?.owned_nameplates ?? ['none']),
    [profile?.owned_nameplates],
  )
  const appliedId = profile?.selected_nameplate ?? 'none'
  const visible = useMemo(
    () => PROFILE_NAMEPLATES.filter((n) => category === 'all' || n.rarity === category),
    [category],
  )
  const selected: NameplateDef =
    PROFILE_NAMEPLATES.find((n) => n.id === selectedId) ?? PROFILE_NAMEPLATES[0]
  const selectedOwned = owned.has(selected.id) || selected.coinCost === undefined
  const balance = profile?.coin_balance ?? 0
  const previewName = profile?.username || profile?.display_name || 'Arenacı'

  const apply = async (id: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/profile/nameplates/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameplateId: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Uygulanamadı', data.error ?? 'Bir şeyler ters gitti')
        return
      }
      if (profile) setProfile({ ...profile, selected_nameplate: id })
      toast.success('İsim paneli uygulandı', 'Sıralama ve profilinde görünecek ✨')
    } catch {
      toast.error('Bağlantı hatası', 'Tekrar dene')
    } finally {
      setBusy(false)
    }
  }

  const buy = async () => {
    if (!selected.coinCost) return
    setBusy(true)
    try {
      const res = await fetch('/api/profile/nameplates/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameplateId: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Satın alınamadı', data.error ?? 'Bir şeyler ters gitti')
        return
      }
      // Satın alındı → otomatik uygula (select)
      let applied = profile?.selected_nameplate ?? 'none'
      try {
        const selRes = await fetch('/api/profile/nameplates/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nameplateId: selected.id }),
        })
        if (selRes.ok) applied = selected.id
      } catch {}
      if (profile) {
        setProfile({
          ...profile,
          coin_balance: data.coin_balance,
          owned_nameplates: data.owned_nameplates,
          selected_nameplate: applied,
        })
      }
      toast.success('Satın alındı! 🪙', `Yeni bakiye: ${data.coin_balance}`)
    } catch {
      toast.error('Bağlantı hatası', 'Tekrar dene')
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-5">
      {/* Kategori chip'leri (nadirlik) */}
      <div className="flex flex-wrap gap-2">
        {NAMEPLATE_CATEGORIES.map((c) => (
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visible.map((np) => {
          const isOwned = owned.has(np.id) || np.coinCost === undefined
          return (
            <button
              key={np.id}
              onClick={() => setSelectedId(np.id)}
              aria-label={`${np.name} önizleme`}
              className={`group flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition-all hover:-translate-y-0.5 ${
                selectedId === np.id ? 'border-[var(--focus)] shadow-lg' : 'border-[var(--border)]'
              } bg-[var(--card-bg)]`}
            >
              <div className="flex min-h-[28px] items-center">
                <Nameplate nameplateId={np.id} className="text-xs font-bold">
                  {previewName}
                </Nameplate>
              </div>
              <div className="flex items-center justify-between">
                <span className="truncate text-[11px] font-bold text-[var(--text)]">{np.name}</span>
                <span className="shrink-0 text-[10px] font-bold text-[var(--reward)]">
                  {isOwned ? '✓' : `🪙${np.coinCost}`}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Seçili ürün detayı */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-black text-[var(--text)]">{selected.name}</h2>
              <span className="rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-[var(--text-sub)]">
                {NAMEPLATE_RARITY_LABEL[selected.rarity]}
              </span>
            </div>
          </div>
          <p className="text-sm text-[var(--text-sub)]">{selected.description}</p>

          {/* Önizleme: sıralamadaki gibi isim paneli */}
          <div className="flex items-center gap-2 rounded-xl bg-[var(--bg-secondary)] p-3">
            <span className="text-[10px] font-bold text-[var(--text-muted)]">🥇 1</span>
            <div className="h-7 w-7 rounded-full bg-[var(--surface)]" />
            <Nameplate nameplateId={selected.id} className="text-sm font-bold">
              {previewName}
            </Nameplate>
          </div>

          {selected.coinCost !== undefined && !owned.has(selected.id) && (
            <p className="text-sm font-bold text-[var(--text)]">
              Ürün Fiyatı: <span className="text-[var(--reward)]">🪙 {selected.coinCost}</span>
            </p>
          )}

          <div className="flex items-center justify-between pt-1">
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
                  onClick={() => apply(selected.id)}
                  disabled={busy}
                  className="rounded-lg bg-[var(--growth)] px-4 py-2 text-xs font-bold text-white transition-transform hover:scale-105 disabled:opacity-50"
                >
                  Uygula
                </button>
              )
            ) : (
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={busy || balance < (selected.coinCost ?? 0)}
                className="rounded-lg bg-gradient-to-r from-[var(--urgency)] to-[var(--reward)] px-5 py-2 text-xs font-bold text-white transition-transform hover:scale-105 disabled:opacity-50"
              >
                {balance < (selected.coinCost ?? 0) ? 'Yetersiz Coin' : 'Şimdi Al'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Satın-alma onay modalı */}
      {confirmOpen && (
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
              <strong className="text-[var(--text)]">{selected.name}</strong> panelini{' '}
              <span className="font-bold text-[var(--reward)]">🪙 {selected.coinCost}</span> coin
              karşılığında alıyorsun (otomatik uygulanır).
            </p>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--surface)] px-3 py-2 text-xs">
              <span className="text-[var(--text-sub)]">Kalan bakiye</span>
              <strong className="text-[var(--reward)]">
                🪙 {(balance - (selected.coinCost ?? 0)).toLocaleString('tr-TR')}
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
