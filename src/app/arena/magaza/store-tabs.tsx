'use client'

import { useState } from 'react'
import { StoreClient } from './store-client'
import { NameplateStoreClient } from './nameplate-store-client'

type Tab = 'bg' | 'np'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'bg', label: 'Arka Plan', icon: '🖼️' },
  { id: 'np', label: 'İsim Paneli', icon: '🏷️' },
]

/** Mağaza kategori sekmeleri: Arka Plan (CSS+video) · İsim Paneli (nameplate). */
export function StoreTabs() {
  const [tab, setTab] = useState<Tab>('bg')
  return (
    <div className="mt-4">
      <div className="flex gap-1 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-bold transition-colors ${
              tab === t.id
                ? 'border-[var(--focus)] text-[var(--focus)]'
                : 'border-transparent text-[var(--text-sub)] hover:text-[var(--text)]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'bg' ? <StoreClient /> : <NameplateStoreClient />}
    </div>
  )
}
