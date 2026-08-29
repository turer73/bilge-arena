'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import {
  AVATAR_DECORATIONS,
  DECORATION_RARITY_LABEL,
  getDecorationById,
  isDecorationFree,
  type AvatarDecorationDef,
} from '@/lib/constants/avatar-decorations'
import { AvatarDecoration } from '@/components/profile/avatar-decoration'
import { toast } from '@/stores/toast-store'
import { isStaff } from '@/lib/utils/is-staff'

/**
 * Avatar Süsü mağazası — ÇOKLU seçim (kanat + taç + aura aynı anda). Nameplate
 * mağazasından farkı: seçim tekil değil dizi. "Tak/Çıkar" worn dizisini günceller
 * + /select API'sine yazar (DB selected_avatar_decorations → sıralama/profilde
 * başkalarına görünür). Ücretli süs sahipsizse önce satın al (otomatik takılır).
 * Personel (RBAC) tümünü ücretsiz kullanır.
 */
export function AvatarDecorationStoreClient() {
  const { user, profile, setProfile } = useAuthStore()
  const [worn, setWorn] = useState<string[]>(profile?.selected_avatar_decorations ?? [])
  const [selectedId, setSelectedId] = useState(AVATAR_DECORATIONS[0].id)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Profil geç yüklenirse worn'u senkronize et — yoksa initializer stale [] yakalar
  // ve ilk Tak/satın al mevcut süsleri /select ile siler (Codex P2). Optimistic
  // toggle sonrası setProfile de buraya düşer (aynı değer → no-op).
  useEffect(() => {
    setWorn(profile?.selected_avatar_decorations ?? [])
  }, [profile?.selected_avatar_decorations])

  const staff = isStaff(profile)
  const ownedSet = useMemo(
    () => new Set(profile?.owned_avatar_decorations ?? []),
    [profile?.owned_avatar_decorations],
  )
  const canWear = (id: string) => staff || isDecorationFree(id) || ownedSet.has(id)

  const selected: AvatarDecorationDef = getDecorationById(selectedId) ?? AVATAR_DECORATIONS[0]
  const balance = profile?.coin_balance ?? 0
  const avatarUrl = profile?.avatar_url ?? null
  const initial = (profile?.username || profile?.display_name || 'A').charAt(0).toUpperCase()

  // worn dizisini DB'ye yaz (optimistic; hata olursa geri al)
  const applyWorn = async (next: string[]) => {
    const prev = worn
    setWorn(next)
    setBusy(true)
    try {
      const res = await fetch('/api/profile/avatar-decorations/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decorationIds: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setWorn(prev)
        toast.error('Uygulanamadı', data.error ?? 'Bir şeyler ters gitti')
        return false
      }
      if (profile) setProfile({ ...profile, selected_avatar_decorations: next })
      return true
    } catch {
      setWorn(prev)
      toast.error('Bağlantı hatası', 'Tekrar dene')
      return false
    } finally {
      setBusy(false)
    }
  }

  const toggleWear = async (id: string) => {
    if (busy || !canWear(id)) return
    const next = worn.includes(id) ? worn.filter((x) => x !== id) : [...worn, id]
    const ok = await applyWorn(next)
    if (ok) toast.success(worn.includes(id) ? 'Süs çıkarıldı' : 'Süs takıldı ✨', 'Profilinde görünecek')
  }

  const buy = async () => {
    if (selected.coinCost === undefined) return
    setBusy(true)
    try {
      const res = await fetch('/api/profile/avatar-decorations/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decorationId: selected.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Satın alınamadı', data.error ?? 'Bir şeyler ters gitti')
        return
      }
      // Satın alındı → otomatik tak (worn'a ekle + /select)
      const next = worn.includes(selected.id) ? worn : [...worn, selected.id]
      let applied = profile?.selected_avatar_decorations ?? []
      try {
        const selRes = await fetch('/api/profile/avatar-decorations/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decorationIds: next }),
        })
        if (selRes.ok) {
          applied = next
          setWorn(next)
        }
      } catch {}
      if (profile) {
        setProfile({
          ...profile,
          coin_balance: data.coin_balance,
          owned_avatar_decorations: data.owned_avatar_decorations,
          selected_avatar_decorations: applied,
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

  const selectedWorn = worn.includes(selected.id)
  const selectedWearable = canWear(selected.id)

  return (
    <div className="mt-5 flex flex-col gap-5">
      {/* Canlı önizleme — takılı tüm süsler avatar etrafında */}
      <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
        <div className="grid place-items-center px-3 py-2">
          <AvatarDecoration decorationIds={worn} size={64}>
            <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[var(--focus)] to-[var(--reward)] text-xl font-black text-white">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initial
              )}
            </div>
          </AvatarDecoration>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text)]">Avatar Süsleri</p>
          <p className="mt-0.5 text-xs text-[var(--text-sub)]">
            {worn.length === 0
              ? 'Henüz süs takmadın. Aşağıdan seç, profilinde görünsün ✨'
              : `${worn.length} süs takılı — sıralama ve profilinde görünür.`}
          </p>
        </div>
      </div>

      {/* Katalog grid'i */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {AVATAR_DECORATIONS.map((d) => {
          const wearable = canWear(d.id)
          const isWorn = worn.includes(d.id)
          return (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              aria-label={`${d.name} önizleme`}
              className={`group flex items-center gap-2 rounded-xl border-2 p-3 text-left transition-all hover:-translate-y-0.5 ${
                selectedId === d.id ? 'border-[var(--focus)] shadow-lg' : 'border-[var(--border)]'
              } bg-[var(--card-bg)]`}
            >
              <span className="text-2xl">{d.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-bold text-[var(--text)]">{d.name}</span>
                <span className="block text-[9px] font-bold text-[var(--reward)]">
                  {isWorn ? '✓ Takılı' : wearable ? 'Sahip' : `🪙${d.coinCost}`}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Seçili ürün detayı */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-3xl">{selected.icon}</span>
            <div>
              <h2 className="font-display text-lg font-black text-[var(--text)]">{selected.name}</h2>
              <span className="rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-[var(--text-sub)]">
                {DECORATION_RARITY_LABEL[selected.rarity]}
              </span>
            </div>
          </div>
          <p className="text-sm text-[var(--text-sub)]">{selected.description}</p>

          {selected.coinCost !== undefined && !selectedWearable && (
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
            ) : selectedWearable ? (
              <button
                onClick={() => toggleWear(selected.id)}
                disabled={busy}
                className={`rounded-lg px-4 py-2 text-xs font-bold text-white transition-transform hover:scale-105 disabled:opacity-50 ${
                  selectedWorn ? 'bg-[var(--urgency)]' : 'bg-[var(--growth)]'
                }`}
              >
                {selectedWorn ? 'Çıkar' : 'Tak'}
              </button>
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
              <strong className="text-[var(--text)]">{selected.name}</strong> süsünü{' '}
              <span className="font-bold text-[var(--reward)]">🪙 {selected.coinCost}</span> coin
              karşılığında alıyorsun (otomatik takılır).
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
