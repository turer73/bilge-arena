'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import {
  PROFILE_BACKGROUNDS,
  BACKGROUND_CATEGORIES,
  BACKGROUND_RARITY_LABEL,
  BACKGROUND_STORAGE_KEY,
} from '@/lib/constants/profile-backgrounds'
import {
  CSS_STORE_ITEMS,
  rowToStoreItem,
  availableResolutions,
  resolveVariantUrl,
  RESOLUTION_LABELS,
  RESOLUTION_ORDER,
  BACKGROUND_RESOLUTION_KEY,
  PUBLISHED_BACKGROUNDS_ENDPOINT,
  type StoreBackgroundItem,
  type BackgroundAssetRow,
  type VideoResolution,
} from '@/lib/constants/video-backgrounds'
import { toast } from '@/stores/toast-store'
import { isStaff } from '@/lib/utils/is-staff'

/**
 * Arka Plan Mağazası (Faz-2): CSS temalar (statik) + video temalar (DB) tek
 * katalogta. Video kartlarda poster/önizleme, detayda autoplay video +
 * çözünürlük seçici (yalnız yüklü varyant) + satın-alma onay modalı.
 * Seçim localStorage'da (profil çerçevesi deseniyle aynı).
 */
export function StoreClient() {
  const { user, profile, setProfile } = useAuthStore()
  const [category, setCategory] = useState<string>('all')
  const [selectedId, setSelectedId] = useState(PROFILE_BACKGROUNDS[1].id)
  const [appliedId, setAppliedId] = useState('none')
  const [resolution, setResolution] = useState<VideoResolution>('k2')
  const [videoItems, setVideoItems] = useState<StoreBackgroundItem[]>([])
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Yayındaki video temaları çek
  useEffect(() => {
    let active = true
    fetch(PUBLISHED_BACKGROUNDS_ENDPOINT)
      .then((r) => (r.ok ? r.json() : { backgrounds: [] }))
      .then((data: { backgrounds: BackgroundAssetRow[] }) => {
        if (active) setVideoItems((data.backgrounds ?? []).map(rowToStoreItem))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // Uygulanmış tema + çözünürlük tercihini oku
  useEffect(() => {
    try {
      const saved = localStorage.getItem(BACKGROUND_STORAGE_KEY)
      if (saved) setAppliedId(saved)
      const res = localStorage.getItem(BACKGROUND_RESOLUTION_KEY)
      if (res === 'hd' || res === 'k2' || res === 'k4') setResolution(res)
    } catch {}
  }, [])

  const allItems = useMemo(() => [...CSS_STORE_ITEMS, ...videoItems], [videoItems])

  // Personel tüm temalara sahip (ücretsiz). allItems aşağıda tanımlı; staff
  // bypass için tüm id'ler owned sayılır.
  const owned = useMemo(
    () =>
      isStaff(profile)
        ? new Set(allItems.map((i) => i.id))
        : new Set(profile?.owned_backgrounds ?? ['none', 'gece-mavisi']),
    [profile, allItems],
  )

  // Kategori chip'leri: video temalar kendi kategorilerinde (lofi/cyberpunk/
  // manzara/pixel/kozmik) görünür; ayrı boş 'Video' chip'i yok (Codex P2).
  const categories = BACKGROUND_CATEGORIES

  const visible = useMemo(
    () => allItems.filter((b) => category === 'all' || b.category === category),
    [allItems, category],
  )

  const selected: StoreBackgroundItem =
    allItems.find((b) => b.id === selectedId) ?? CSS_STORE_ITEMS[0]
  const selectedOwned = owned.has(selected.id) || selected.coinCost === undefined
  const balance = profile?.coin_balance ?? 0

  const selectedResolutions = selected.kind === 'video' ? availableResolutions(selected.variants) : []
  const selectedVideoUrl =
    selected.kind === 'video' ? resolveVariantUrl(selected.variants, resolution) : null

  const applyBackground = (id: string) => {
    setAppliedId(id)
    try {
      localStorage.setItem(BACKGROUND_STORAGE_KEY, id)
      localStorage.setItem(BACKGROUND_RESOLUTION_KEY, resolution)
      window.dispatchEvent(new Event('bg-changed')) // global zemini anında güncelle
    } catch {}
    toast.success('Arka plan uygulandı', 'Tüm sayfalarda görüntülenecek ✨')
  }

  const pickResolution = (res: VideoResolution) => {
    setResolution(res)
    try {
      localStorage.setItem(BACKGROUND_RESOLUTION_KEY, res)
      window.dispatchEvent(new Event('bg-changed'))
    } catch {}
  }

  const buy = async () => {
    if (selected.coinCost === undefined) return // 0-coin tema geçerli (Codex P2)
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
      setConfirmOpen(false)
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-5">
      {/* Kategori chip'leri */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
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
              {bg.kind === 'video' ? (
                <div className="relative h-20 w-full bg-black md:h-24">
                  {bg.posterUrl ? (
                    <img src={bg.posterUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <video
                      src={resolveVariantUrl(bg.variants, 'hd') ?? undefined}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  )}
                  <span className="absolute left-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[8px] font-bold text-white">
                    ▶ VIDEO
                  </span>
                </div>
              ) : (
                <div
                  className={`h-20 w-full md:h-24 ${bg.animClass ?? ''}`}
                  style={{ background: bg.css }}
                />
              )}
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
          <div className="relative h-32 w-full overflow-hidden rounded-xl bg-black sm:w-56">
            {selected.kind === 'video' && selectedVideoUrl ? (
              <video
                key={selectedVideoUrl}
                src={selectedVideoUrl}
                poster={selected.posterUrl}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div
                className={`absolute inset-0 ${selected.animClass ?? ''}`}
                style={{ background: selected.css }}
              />
            )}
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

            {/* Çözünürlük seçici (yalnız video + yüklü varyantlar) */}
            {selected.kind === 'video' && selectedResolutions.length > 0 && (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-[var(--text-sub)]">Çözünürlük:</span>
                {RESOLUTION_ORDER.filter((r) => selectedResolutions.includes(r)).map((r) => (
                  <button
                    key={r}
                    onClick={() => pickResolution(r)}
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-bold transition-colors ${
                      resolution === r
                        ? 'border-[var(--focus)] bg-[var(--focus-bg)] text-[var(--focus)]'
                        : 'border-[var(--border)] text-[var(--text-sub)] hover:border-[var(--focus-border)]'
                    }`}
                  >
                    {RESOLUTION_LABELS[r]}
                  </button>
                ))}
              </div>
            )}

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
      </div>

      <p className="text-[11px] text-[var(--text-sub)]">
        Coin kazanmak için quiz çöz, görev tamamla. Video temalar profilinde otomatik oynar.
      </p>

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
              <strong className="text-[var(--text)]">{selected.name}</strong> temasını{' '}
              <span className="font-bold text-[var(--reward)]">🪙 {selected.coinCost}</span> coin
              karşılığında alıyorsun.
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
