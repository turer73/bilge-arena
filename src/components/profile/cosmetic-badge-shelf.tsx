'use client'

import { useEffect, useState } from 'react'
import {
  rowToBadgeItem,
  PUBLISHED_BADGES_ENDPOINT,
  type StoreBadgeItem,
  type CosmeticBadgeRow,
} from '@/lib/constants/cosmetic-badges'

/**
 * Profilde satın-alınan kozmetik rozetlerin rafı. Yayındaki rozet kataloğunu
 * çeker, kullanıcının sahip olduklarını (slug) gösterir. Kazanılan achievement
 * rozetlerinden (BadgeShowcase) ayrı bir bölüm.
 */
export function CosmeticBadgeShelf({
  ownedSlugs,
  allOwned = false,
}: {
  ownedSlugs: string[]
  allOwned?: boolean
}) {
  const [all, setAll] = useState<StoreBadgeItem[]>([])

  useEffect(() => {
    let active = true
    fetch(PUBLISHED_BADGES_ENDPOINT)
      .then((r) => (r.ok ? r.json() : { badges: [] }))
      .then((d: { badges: CosmeticBadgeRow[] }) => {
        if (active) setAll((d.badges ?? []).map(rowToBadgeItem))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const ownedSet = new Set(ownedSlugs)
  const owned = allOwned ? all : all.filter((b) => ownedSet.has(b.id))
  if (owned.length === 0) return null

  return (
    <section className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
      <h3 className="font-display text-sm font-black text-[var(--text)]">🏅 Rozetlerim</h3>
      <div className="mt-3 flex flex-wrap gap-3">
        {owned.map((b) => (
          <div key={b.id} className="flex flex-col items-center gap-1" title={b.description || b.name}>
            {b.iconUrl ? (
               
              <img src={b.iconUrl} alt={b.name} className="h-12 w-12 object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center text-2xl">🏅</div>
            )}
            <span className="max-w-[64px] truncate text-[10px] text-[var(--text-sub)]">{b.name}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
