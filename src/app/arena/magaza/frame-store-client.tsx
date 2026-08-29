'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuthStore } from '@/stores/auth-store'
import {
  PROFILE_FRAMES,
  FRAME_RARITY_LABEL,
  FRAME_STORAGE_KEY,
  type FrameRarity,
  type ProfileFrameDef,
} from '@/lib/constants/profile-frames'
import { ProfileFrameRing } from '@/components/profile/profile-frame-ring'
import { toast } from '@/stores/toast-store'
import { isStaff } from '@/lib/utils/is-staff'

/**
 * Çerçeve mağazası. Nameplate mağazasıyla aynı akış AMA seçim DB'de DEĞİL,
 * localStorage'da (FRAME_STORAGE_KEY — kişiselleştirme stüdyosuyla aynı anahtar).
 * Bu yüzden "Uygula" bir API çağrısı yapmaz; yalnız satın alma sunucuya gider.
 *
 * NEDEN BU SEKME VAR: çerçeveler mağazanın EN UCUZ ürünleri (30–300) ama satın
 * alma yalnız profil sayfasında duruyordu — mağazada hiç listelenmiyordu. Bakiyesi
 * yeten 10 kullanıcı olmasına karşın toplam 1 satın alma yapılmış olmasının
 * ölçülen sebeplerinden biri bu (docs/plans/2026-08-16-kozmetik-ekonomi-yol-haritasi.md).
 */

const CATEGORIES: { id: FrameRarity | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'Tümü', icon: '🎨' },
  { id: 'common', label: FRAME_RARITY_LABEL.common, icon: '⚪' },
  { id: 'rare', label: FRAME_RARITY_LABEL.rare, icon: '🔵' },
  { id: 'epic', label: FRAME_RARITY_LABEL.epic, icon: '🟣' },
  { id: 'legendary', label: FRAME_RARITY_LABEL.legendary, icon: '🟡' },
]

export function FrameStoreClient() {
  const { user, profile, setProfile } = useAuthStore()
  const [category, setCategory] = useState<FrameRarity | 'all'>('all')
  const [selectedId, setSelectedId] = useState(PROFILE_FRAMES[1].id)
  const [appliedId, setAppliedId] = useState('none')
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Uygulanan çerçeve localStorage'da; kişiselleştirme stüdyosu da buradan okur.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FRAME_STORAGE_KEY)
      if (saved && PROFILE_FRAMES.some((f) => f.id === saved)) setAppliedId(saved)
    } catch {}
  }, [])

  const owned = useMemo(
    () =>
      isStaff(profile)
        ? new Set(PROFILE_FRAMES.map((f) => f.id))
        : new Set(profile?.owned_frames ?? ['none', 'mavi']),
    [profile],
  )
  const visible = useMemo(
    () => PROFILE_FRAMES.filter((f) => category === 'all' || f.rarity === category),
    [category],
  )
  const selected: ProfileFrameDef =
    PROFILE_FRAMES.find((f) => f.id === selectedId) ?? PROFILE_FRAMES[0]
  const selectedOwned = owned.has(selected.id) || selected.coinCost === undefined
  const balance = profile?.coin_balance ?? 0
  const avatarUrl = profile?.avatar_url ?? null

  const apply = (id: string) => {
    try {
      localStorage.setItem(FRAME_STORAGE_KEY, id)
    } catch {}
    setAppliedId(id)
    toast.success('Çerçeve uygulandı', 'Profilinde ve lobide görünecek ✨')
  }

  const buy = async () => {
    if (selected.coinCost === undefined) return
    setBusy(true)
    try {
      const res = await fetch('/api/profile/frames/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frameId: selected.id }),
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
          owned_frames: data.owned_frames,
        })
      }
      // Satın alındı → otomatik uygula (nameplate akışıyla aynı his; burada
      // uygulama localStorage olduğu için ikinci bir istek gerekmez).
      apply(selected.id)
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
        {CATEGORIES.map((c) => (
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((frm) => {
          const isOwned = owned.has(frm.id) || frm.coinCost === undefined
          return (
            <button
              key={frm.id}
              onClick={() => setSelectedId(frm.id)}
              aria-label={`${frm.name} önizleme`}
              className={`group flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all hover:-translate-y-0.5 ${
                selectedId === frm.id ? 'border-[var(--focus)] shadow-lg' : 'border-[var(--border)]'
              } bg-[var(--card-bg)]`}
            >
              {/* FrameDot değil ProfileFrameRing: FrameDot bir <button>, kartın
                  kendisi de button — iç içe button geçersiz HTML olurdu. */}
              <div className="flex h-12 items-center justify-center">
                <ProfileFrameRing frame={frm} size={36}>
                  <div className="h-9 w-9 rounded-full bg-[var(--surface)]" />
                </ProfileFrameRing>
              </div>
              <div className="flex w-full items-center justify-between">
                <span className="truncate text-[11px] font-bold text-[var(--text)]">{frm.name}</span>
                <span className="shrink-0 text-[10px] font-bold text-[var(--reward)]">
                  {isOwned ? '✓' : `🪙${frm.coinCost}`}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Seçili ürün detayı */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-black text-[var(--text)]">{selected.name}</h2>
            <span className="rounded-md bg-[var(--surface)] px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-[var(--text-sub)]">
              {FRAME_RARITY_LABEL[selected.rarity]}
            </span>
          </div>
          <p className="text-sm text-[var(--text-sub)]">{selected.description}</p>

          {/* Önizleme: avatarın etrafında gerçek çerçeve */}
          <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-secondary)] p-3">
            <ProfileFrameRing frame={selected} size={44}>
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  width={44}
                  height={44}
                  className="rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="h-11 w-11 rounded-full bg-[var(--surface)]" />
              )}
            </ProfileFrameRing>
            <span className="text-xs text-[var(--text-sub)]">
              Profilinde, lobide ve sıralamada böyle görünür
            </span>
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
                {balance < (selected.coinCost ?? 0)
                  ? `🪙 ${((selected.coinCost ?? 0) - balance).toLocaleString('tr-TR')} daha`
                  : 'Şimdi Al'}
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
              <strong className="text-[var(--text)]">{selected.name}</strong> çerçevesini{' '}
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
