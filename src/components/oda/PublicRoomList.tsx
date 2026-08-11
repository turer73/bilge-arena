'use client'

/**
 * Bilge Arena Oda: <PublicRoomList> "Aktif Odalar" tab listesi
 * Sprint 2A Task 3 + Codex review fix (PR #61 follow-up)
 *
 * RLS policy rooms_select_public_lobby (TO anon, authenticated) ile fetch.
 * Anonim user da görebilir (PostgREST PGRST_DB_ANON_ROLE=anon).
 *
 * Kategori filter URL state ile sync — refresh sonrasi korunur, deeplinkable.
 *
 * Codex P3 #1 fix: r.category raw slug yerine slugToLabel ile insan-okunabilir
 * ('genel-kultur' → 'Genel Kültür').
 * Codex P3 #2 fix: CATEGORIES tek kaynak src/lib/rooms/categories.ts
 * (PublicRoomList + QuickPlayPanel + CreateRoomForm refactor hedefi).
 */

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PublicRoomCard } from '@/lib/rooms/server-fetch'
import { ROOM_CATEGORIES, slugToLabel } from '@/lib/rooms/categories'
import { ArrowRight, Search, Users } from 'lucide-react'

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
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <label className="mb-2 flex items-center gap-2 text-xs font-bold text-[var(--text-sub)] sm:mb-0" htmlFor="public-category">
          <Search aria-hidden="true" className="h-4 w-4" />
          Kategoriye göre filtrele
        </label>
        <select
          id="public-category"
          name="category"
          value={selectedCategory}
          onChange={handleCategoryChange}
          className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus:border-[var(--focus)] focus:outline-none sm:w-auto"
        >
          <option value="">Tüm Kategoriler</option>
          {ROOM_CATEGORIES.map((slug) => (
            <option key={slug} value={slug}>
              {slugToLabel(slug)}
            </option>
          ))}
        </select>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-7 text-center">
          <h3 className="text-sm font-extrabold">Şu anda katılabileceğin açık oda yok</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">
            İlk odayı sen kurabilir ve kodunu arkadaşlarınla paylaşabilirsin.
          </p>
          <Link
            href="/oda/yeni"
            className="btn-primary mt-4 min-h-11 px-4 text-sm"
          >
            Oda Kur
          </Link>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Aktif açık odalar listesi">
          {rooms.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl"
            >
              <Link
                href={`/oda/${r.code}`}
                className="group block min-h-24 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:border-[var(--focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
                aria-label={`${r.title} odasına katıl`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold">
                      {r.title}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--text-sub)]">
                      {/* Codex P3 #1 fix: slugToLabel('genel-kultur')='Genel Kültür' */}
                      {slugToLabel(r.category)} · Zorluk {r.difficulty}/5 ·{' '}
                      {r.question_count} soru
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--growth-bg)] px-3 py-1 text-xs font-bold text-[var(--growth-text)]">
                    <Users aria-hidden="true" className="h-3.5 w-3.5" />
                    {r.member_count}/{r.max_players}
                  </span>
                </div>
                <span className="mt-3 flex items-center justify-end gap-1 text-xs font-extrabold text-[var(--focus-text)]">
                  Odaya katıl
                  <ArrowRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
