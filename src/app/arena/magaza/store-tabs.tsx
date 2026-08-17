'use client'

import { useState } from 'react'
import { StoreClient } from './store-client'
import { NameplateStoreClient } from './nameplate-store-client'
import { BadgeStoreClient } from './badge-store-client'
import { AvatarDecorationStoreClient } from './avatar-decoration-store-client'
import { FrameStoreClient } from './frame-store-client'
import { StoreBudgetStrip } from './store-budget-strip'

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
      {/* Butce seridi: "su an ne alabilirim" sorusunu kategoriden bagimsiz
          cevaplar; sekmeleri tek tek gezme zorunlulugunu kaldirir. */}
      <StoreBudgetStrip onJump={setTab} />

      <div className="mt-4 flex gap-1 border-b border-[var(--border)]">
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
