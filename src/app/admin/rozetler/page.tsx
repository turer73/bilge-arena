'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CosmeticBadgeRow } from '@/lib/constants/cosmetic-badges'

interface FormState {
  slug: string
  name: string
  description: string
  category: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  coinCost: string
  iconUrl?: string
}

const EMPTY_FORM: FormState = {
  slug: '',
  name: '',
  description: '',
  category: 'genel',
  rarity: 'epic',
  coinCost: '500',
}

/**
 * Admin — Satın-alınabilir Kozmetik Rozet yönetimi. Görsel (PNG) yükle, coin
 * fiyatı belirle, yayınla. Kazanılan achievement rozetlerinden ayrı.
 */
export default function CosmeticBadgesAdminPage() {
  const [items, setItems] = useState<CosmeticBadgeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [uploading, setUploading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cosmetic-badges')
      if (!res.ok) {
        setError('Rozetler alınamadı')
        return
      }
      const data = await res.json()
      setItems(data.badges ?? [])
    } catch {
      setError('Bağlantı hatası')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const slugValid = /^[a-z0-9-]{2,40}$/.test(form.slug)

  const handleUpload = async (file: File) => {
    setError('')
    if (!slugValid) {
      setError('Önce geçerli bir slug girin')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('slug', form.slug)
      const res = await fetch('/api/admin/cosmetic-badges/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Yükleme başarısız')
        return
      }
      setForm((f) => ({ ...f, iconUrl: data.url }))
    } catch {
      setError('Yükleme sırasında hata')
    } finally {
      setUploading(false)
    }
  }

  const create = async () => {
    setError('')
    if (!slugValid || !form.name.trim()) {
      setError('Slug ve ad zorunlu')
      return
    }
    const cost = parseInt(form.coinCost, 10)
    if (isNaN(cost) || cost < 0) {
      setError('Geçerli bir fiyat girin')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/admin/cosmetic-badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: form.slug,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          category: form.category.trim() || 'genel',
          rarity: form.rarity,
          coinCost: cost,
          iconUrl: form.iconUrl,
          isPublished: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Oluşturulamadı')
        return
      }
      setForm(EMPTY_FORM)
      await fetchItems()
    } catch {
      setError('Bağlantı hatası')
    } finally {
      setCreating(false)
    }
  }

  const patch = async (id: string, payload: Record<string, unknown>) => {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/admin/cosmetic-badges/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Güncellenemedi')
        return
      }
      setItems((prev) => prev.map((it) => (it.id === id ? data.badge : it)))
    } catch {
      setError('Bağlantı hatası')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string, slug: string) => {
    if (!window.confirm(`"${slug}" rozetini silmek istediğine emin misin? Satın alanlar kaybeder.`)) {
      return
    }
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/admin/cosmetic-badges/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Silinemedi')
        return
      }
      setItems((prev) => prev.filter((it) => it.id !== id))
    } catch {
      setError('Bağlantı hatası')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="font-display text-xl font-black text-[var(--text)]">🏅 Kozmetik Rozetler</h1>
      <p className="mt-1 text-sm text-[var(--text-sub)]">
        Coin karşılığı satın-alınabilir prestij/sezon rozetleri. (Quiz başarımlarıyla
        kazanılan rozetlerden ayrıdır.)
      </p>

      <div className="mt-3 rounded-xl border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-4 py-3 text-sm text-[var(--urgency)]">
        ⚠️ <strong>Telif sorumluluğu yükleyene aittir.</strong> Yalnızca lisanslı, CC0 veya kendi
        ürettiğin rozet görsellerini yükle.
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-3 py-2 text-sm text-[var(--urgency)]">
          {error}
        </p>
      )}

      {/* Yeni rozet formu */}
      <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
        <h2 className="font-display text-base font-black text-[var(--text)]">Yeni Rozet</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--text-sub)]">
            Slug (id)
            <input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="sampiyon-2026"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-normal text-[var(--text)]"
            />
            {!slugValid && form.slug.length > 0 && (
              <span className="text-[10px] text-[var(--urgency)]">küçük harf, rakam, tire (2-40)</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--text-sub)]">
            Ad
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Şampiyon 2026"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-normal text-[var(--text)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--text-sub)] sm:col-span-2">
            Açıklama
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="2026 sezonunun şampiyonu"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-normal text-[var(--text)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--text-sub)]">
            Nadirlik
            <select
              value={form.rarity}
              onChange={(e) => setForm((f) => ({ ...f, rarity: e.target.value as FormState['rarity'] }))}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-normal text-[var(--text)]"
            >
              <option value="common">Sıradan</option>
              <option value="rare">Nadir</option>
              <option value="epic">Epik</option>
              <option value="legendary">Efsanevi</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--text-sub)]">
            Fiyat (coin)
            <input
              type="number"
              min={0}
              value={form.coinCost}
              onChange={(e) => setForm((f) => ({ ...f, coinCost: e.target.value }))}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-normal text-[var(--text)]"
            />
          </label>
        </div>

        {/* Görsel yükleme */}
        <div className="mt-4 flex items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleUpload(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading || !slugValid}
            className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
              form.iconUrl
                ? 'border-[var(--growth)] bg-[var(--growth-bg)] text-[var(--growth)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-sub)] hover:border-[var(--focus)]'
            }`}
          >
            {uploading ? '⏳…' : form.iconUrl ? '✓ Görsel yüklendi' : '📤 Rozet görseli (PNG, ≤2MB)'}
          </button>
          {form.iconUrl && (
             
            <img src={form.iconUrl} alt="" className="h-10 w-10 rounded object-contain" />
          )}
        </div>

        <button
          onClick={create}
          disabled={creating || !slugValid || !form.name.trim()}
          className="mt-3 rounded-lg bg-[var(--focus)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {creating ? 'Oluşturuluyor…' : 'Taslak Oluştur'}
        </button>
      </section>

      {/* Mevcut rozetler */}
      <section className="mt-6">
        <h2 className="font-display text-base font-black text-[var(--text)]">Mevcut Rozetler</h2>
        {loading ? (
          <p className="mt-3 text-sm text-[var(--text-sub)]">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-6 text-center text-sm text-[var(--text-sub)]">
            Henüz kozmetik rozet yok.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3"
              >
                {it.icon_url ? (
                   
                  <img src={it.icon_url} alt="" className="h-12 w-12 rounded-lg object-contain" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--surface)] text-lg">🏅</div>
                )}
                <div className="min-w-[120px] flex-1">
                  <p className="text-sm font-bold text-[var(--text)]">
                    {it.name} <span className="text-[11px] font-normal text-[var(--text-sub)]">/{it.slug}</span>
                  </p>
                  <p className="text-[11px] text-[var(--text-sub)]">
                    🪙 {it.coin_cost} · {it.rarity}
                    {it.is_published ? (
                      <span className="ml-1 font-bold text-[var(--growth)]">· yayında</span>
                    ) : (
                      <span className="ml-1 font-bold text-[var(--text-sub)]">· taslak</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => patch(it.id, { isPublished: !it.is_published })}
                  disabled={busyId === it.id}
                  className="rounded-lg bg-[var(--growth)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  {it.is_published ? 'Yayından kaldır' : 'Yayınla'}
                </button>
                <button
                  onClick={() => remove(it.id, it.slug)}
                  disabled={busyId === it.id}
                  className="rounded-lg bg-[var(--urgency)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                >
                  Sil
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
