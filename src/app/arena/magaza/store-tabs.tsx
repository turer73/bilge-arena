'use client'

import { useState } from 'react'
import { StoreClient } from './store-client'
import { NameplateStoreClient } from './nameplate-store-client'
import { BadgeStoreClient } from './badge-store-client'
import { AvatarDecorationStoreClient } from './avatar-decoration-store-client'
import { FrameStoreClient } from './frame-store-client'

type Tab = 'cerceve' | 'bg' | 'np' | 'sus' | 'badge'

// Çerçeve ilk sırada: mağazanın en ucuz ürünleri (30–300) orada ve yeni
// gelen kullanıcının ilk alım yapabileceği tek kademe o.
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'cerceve', label: 'Çerçeve', icon: '⭕' },
  { id: 'bg', label: 'Arka Plan', icon: '🖼️' },
  { id: 'np', label: 'İsim Paneli', icon: '🏷️' },
  { id: 'sus', label: 'Avatar Süsü', icon: '🪽' },
  { id: 'badge', label: 'Rozet', icon: '🏅' },
]

/** Mağaza kategori sekmeleri: Çerçeve · Arka Plan (CSS+video) · İsim Paneli · Avatar Süsü · Rozet. */
export function StoreTabs() {
  const [tab, setTab] = useState<Tab>('cerceve')
  return (
    <div className="mt-4">
      <div className="scrollbar-none flex snap-x gap-1 overflow-x-auto border-b border-[var(--border)] pb-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px min-h-12 shrink-0 snap-start whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-bold transition-colors sm:px-4 ${
              tab === t.id
                ? 'border-[var(--focus)] text-[var(--focus)]'
                : 'border-transparent text-[var(--text-sub)] hover:text-[var(--text)]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'cerceve' ? (
        <FrameStoreClient />
      ) : tab === 'bg' ? (
        <StoreClient />
      ) : tab === 'np' ? (
        <NameplateStoreClient />
      ) : tab === 'sus' ? (
        <AvatarDecorationStoreClient />
      ) : (
        <BadgeStoreClient />
      )}
    </div>
  )
}
