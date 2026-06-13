'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RESOLUTION_LABELS,
  RESOLUTION_ORDER,
  type VideoResolution,
  type BackgroundAssetRow,
} from '@/lib/constants/video-backgrounds'

type UploadKind = VideoResolution | 'poster'
const UPLOAD_KINDS: UploadKind[] = [...RESOLUTION_ORDER, 'poster']

const KIND_LABEL: Record<UploadKind, string> = {
  hd: 'HD video',
  k2: '2K video',
  k4: '4K video',
  poster: 'Poster (görsel)',
}

interface FormState {
  slug: string
  name: string
  description: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  coinCost: string
  variants: { hd?: string; k2?: string; k4?: string }
  posterUrl?: string
}

const EMPTY_FORM: FormState = {
  slug: '',
  name: '',
  description: '',
  rarity: 'epic',
  coinCost: '1000',
  variants: {},
}

/**
 * Admin — Video Arka Plan yönetimi.
 * Önce slug+ad+fiyat girilir, sonra dosyalar yüklenir (her biri public URL
 * döner), en son "Oluştur" temayı taslak olarak kaydeder. Yayına alma listede.
 */
export default function BackgroundsAdminPage() {
  const [items, setItems] = useState<BackgroundAssetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [uploading, setUploading] = useState<UploadKind | null>(null)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/backgrounds')
      if (!res.ok) {
        setError('Temalar alınamadı')
        return
      }
      const data = await res.json()
      setItems(data.backgrounds ?? [])
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

  const handleUpload = async (kind: UploadKind, file: File) => {
    setError('')
    if (!slugValid) {
      setError('Önce geçerli bir slug girin (küçük harf, rakam, tire)')
      return
    }
    setUploading(kind)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('slug', form.slug)
      fd.append('kind', kind)
      const res = await fetch('/api/admin/backgrounds/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Yükleme başarısız')
        return
      }
      if (kind === 'poster') {
        setForm((f) => ({ ...f, posterUrl: data.url }))
      } else {
        setForm((f) => ({ ...f, variants: { ...f.variants, [kind]: data.url } }))
      }
    } catch {
      setError('Yükleme sırasında hata')
    } finally {
      setUploading(null)
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
      const res = await fetch('/api/admin/backgrounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: form.slug,
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          rarity: form.rarity,
          coinCost: cost,
          variants: form.variants,
          posterUrl: form.posterUrl,
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
      const res = await fetch(`/api/admin/backgrounds/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Güncellenemedi')
        return
      }
      setItems((prev) => prev.map((it) => (it.id === id ? data.background : it)))
    } catch {
      setError('Bağlantı hatası')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id: string, slug: string) => {
    if (!window.confirm(`"${slug}" temasını silmek istediğine emin misin? Satın alanlar bu temayı kaybeder.`)) {
      return
    }
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/admin/backgrounds/${id}`, { method: 'DELETE' })
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
      <h1 className="font-display text-xl font-black text-[var(--text)]">🎬 Video Arka Planlar</h1>
      <p className="mt-1 text-sm text-[var(--text-sub)]">
        Mağazaya coin karşılığı video temalar ekle. CSS temalar kodda statiktir; buradan
        eklenenler dinamik kataloğa düşer.
      </p>

      {/* Telif uyarısı — kalıcı */}
      <div className="mt-3 rounded-xl border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-4 py-3 text-sm text-[var(--urgency)]">
        ⚠️ <strong>Telif sorumluluğu yükleyene aittir.</strong> Yalnızca lisanslı, CC0 veya
        kendi ürettiğin (AI dahil) videoları yükle. Üçüncü şahıs eseri MP4&apos;leri coin
        karşılığı satmak telif ihlalidir.
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-3 py-2 text-sm text-[var(--urgency)]">
          {error}
        </p>
      )}

      {/* Yeni tema formu */}
      <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
        <h2 className="font-display text-base font-black text-[var(--text)]">Yeni Tema</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--text-sub)]">
            Slug (id)
            <input
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="orman-yagmuru"
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
              placeholder="Orman Yağmuru"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-normal text-[var(--text)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--text-sub)] sm:col-span-2">
            Açıklama
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Yağmur damlalı sakin orman ambiyansı"
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

        {/* Dosya yüklemeleri */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {UPLOAD_KINDS.map((kind) => {
            const done = kind === 'poster' ? Boolean(form.posterUrl) : Boolean(form.variants[kind as VideoResolution])
            return (
              <div key={kind} className="flex flex-col gap-1">
                <input
                  ref={(el) => {
                    fileInputs.current[kind] = el
                  }}
                  type="file"
                  accept={kind === 'poster' ? 'image/png,image/jpeg,image/webp' : 'video/mp4,video/webm'}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleUpload(kind, f)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputs.current[kind]?.click()}
                  disabled={uploading !== null || !slugValid}
                  className={`rounded-lg border px-2 py-3 text-xs font-bold transition-colors disabled:opacity-50 ${
                    done
                      ? 'border-[var(--growth)] bg-[var(--growth-bg)] text-[var(--growth)]'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-sub)] hover:border-[var(--focus)]'
                  }`}
                >
                  {uploading === kind ? '⏳…' : done ? `✓ ${KIND_LABEL[kind]}` : `📤 ${KIND_LABEL[kind]}`}
                </button>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-sub)]">
          Video maks 8MB (MP4/WebM) · Poster maks 2MB (PNG/JPEG/WebP). En az bir video varyantı gerekli.
        </p>

        <button
          onClick={create}
          disabled={creating || !slugValid || !form.name.trim()}
          className="mt-3 rounded-lg bg-[var(--focus)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {creating ? 'Oluşturuluyor…' : 'Taslak Oluştur'}
        </button>
      </section>

      {/* Mevcut temalar */}
      <section className="mt-6">
        <h2 className="font-display text-base font-black text-[var(--text)]">Mevcut Temalar</h2>
        {loading ? (
          <p className="mt-3 text-sm text-[var(--text-sub)]">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-6 text-center text-sm text-[var(--text-sub)]">
            Henüz video tema yok.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {items.map((it) => {
              const variantKeys = RESOLUTION_ORDER.filter((r) => it.variants?.[r])
              return (
                <div
                  key={it.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3"
                >
                  {it.poster_url ? (
                    <img src={it.poster_url} alt="" className="h-12 w-20 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-12 w-20 items-center justify-center rounded-lg bg-[var(--surface)] text-lg">🎬</div>
                  )}
                  <div className="min-w-[120px] flex-1">
                    <p className="text-sm font-bold text-[var(--text)]">
                      {it.name}{' '}
                      <span className="text-[11px] font-normal text-[var(--text-sub)]">/{it.slug}</span>
                    </p>
                    <p className="text-[11px] text-[var(--text-sub)]">
                      🪙 {it.coin_cost} · {variantKeys.map((r) => RESOLUTION_LABELS[r]).join('/') || 'varyant yok'}
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
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
