'use client'

import { useState } from 'react'
import { Award, Frame, ImageIcon, Sparkles, Tag, type LucideIcon } from 'lucide-react'
import { StoreClient } from './store-client'
import { NameplateStoreClient } from './nameplate-store-client'
import { BadgeStoreClient } from './badge-store-client'
import { AvatarDecorationStoreClient } from './avatar-decoration-store-client'
import { FrameStoreClient } from './frame-store-client'
import { StoreBudgetStrip } from './store-budget-strip'

type Tab = 'cerceve' | 'bg' | 'np' | 'sus' | 'badge'

// Çerçeve ilk sırada: mağazanın en ucuz ürünleri (30–300) orada ve yeni
// gelen kullanıcının ilk alım yapabileceği tek kademe o.
const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: 'cerceve', label: 'Çerçeve', Icon: Frame },
  { id: 'bg', label: 'Arka Plan', Icon: ImageIcon },
  { id: 'np', label: 'İsim Paneli', Icon: Tag },
  { id: 'sus', label: 'Avatar Süsü', Icon: Sparkles },
  { id: 'badge', label: 'Rozet', Icon: Award },
]

/** Mağaza kategori sekmeleri: Çerçeve · Arka Plan (CSS+video) · İsim Paneli · Avatar Süsü · Rozet. */
export function StoreTabs() {
  const [tab, setTab] = useState<Tab>('cerceve')
  return (
    <div data-store-catalog className="mt-5">
      {/* Butce seridi: "su an ne alabilirim" sorusunu kategoriden bagimsiz
          cevaplar; sekmeleri tek tek gezme zorunlulugunu kaldirir. */}
      <StoreBudgetStrip onJump={setTab} />

      {/* Sekme cubugu mobilde yatay kaydirilir (#391) — bes sekme dar ekrana
          sigmiyordu. Butce seridi eklenince araya mt-4 kondu. */}
      <div className="scrollbar-none mt-4 flex snap-x gap-2 overflow-x-auto rounded-[22px] border-2 border-[var(--app-border)] bg-[var(--app-card)] p-2 shadow-[0_5px_0_var(--app-border)]">
        {TABS.map((tabDefinition) => {
          const TabIcon = tabDefinition.Icon
          return (
          <button
            key={tabDefinition.id}
            type="button"
            aria-pressed={tab === tabDefinition.id}
            onClick={() => setTab(tabDefinition.id)}
            className={`flex min-h-12 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-2xl border-2 px-3 py-2 text-xs font-black transition-colors sm:flex-1 sm:justify-center sm:px-4 ${
              tab === tabDefinition.id
                ? 'border-[var(--app-accent)] bg-[var(--app-accent-tint)] text-[var(--app-accent-text)] shadow-[0_3px_0_var(--app-shadow-accent)]'
                : 'border-transparent text-[var(--app-text-sub)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text)]'
            }`}
          >
            <TabIcon size={17} strokeWidth={2.5} /> {tabDefinition.label}
          </button>
          )
        })}
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
