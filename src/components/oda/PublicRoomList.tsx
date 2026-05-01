'use client'

/**
 * Bilge Arena Oda: <PublicRoomList> "Aktif Odalar" tab listesi
 * Sprint 2A Task 3
 *
 * RLS policy rooms_select_public_lobby (TO anon, authenticated) ile fetch.
 * Anonim user da görebilir (PostgREST PGRST_DB_ANON_ROLE=anon).
 *
 * Kategori filter URL state ile sync — refresh sonrasi korunur, deeplinkable.
 */

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PublicRoomCard } from '@/lib/rooms/server-fetch'

const CATEGORIES = [
  { value: '', label: 'Tüm Kategoriler' },
  { value: 'genel-kultur', label: 'Genel Kültür' },
  { value: 'tarih', label: 'Tarih' },
  { value: 'cografya', label: 'Coğrafya' },
  { value: 'edebiyat', label: 'Edebiyat' },
  { value: 'matematik', label: 'Matematik' },
  { value: 'fen', label: 'Fen Bilimleri' },
  { value: 'ingilizce', label: 'İngilizce' },
  { value: 'vatandaslik', label: 'Vatandaşlık' },
  { value: 'futbol', label: 'Futbol' },
  { value: 'sinema', label: 'Sinema' },
]

interface PublicRoomListProps {
  rooms: PublicRoomCard[]
  selectedCategory?: string
}

export function PublicRoomList({
  rooms,
  selectedCategory = '',
}: PublicRoomListProps) {
  const router = useRouter()

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cat = e.target.value
    const params = new URLSearchParams()
    params.set('tab', 'public')
    if (cat) params.set('cat', cat)
    router.push(`/oda?${params.toString()}`)
  }

  return (
    <div className="space-y-4" data-testid="public-room-list">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold" htmlFor="public-category">
          Kategori:
        </label>
        <select
          id="public-category"
          name="category"
          value={selectedCategory}
          onChange={handleCategoryChange}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--focus)] focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <p className="text-sm text-[var(--text-sub)]">
            Şu anda aktif açık oda yok. Yeni bir tane sen oluşturabilirsin!
          </p>
          <Link
            href="/oda/yeni"
            className="btn-primary mt-4 inline-block px-4 py-2 text-sm"
          >
            + Yeni Oda
          </Link>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Aktif açık odalar listesi">
          {rooms.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--card)] transition-colors hover:border-[var(--focus)]"
            >
              <Link
                href={`/oda/${r.code}`}
                className="block p-4"
                aria-label={`${r.title} odasına katıl`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold">
                      {r.title}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--text-sub)]">
                      {r.category} · Zorluk {r.difficulty}/5 ·{' '}
                      {r.question_count} soru
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    {r.room_members[0]?.count ?? 0}/{r.max_players}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
