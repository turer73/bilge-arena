/**
 * Bilge Arena Oda: <TabNav> /oda 2-sekmeli navigasyon
 * Sprint 2A Task 3
 *
 * "Odalarım" / "Aktif Odalar" tab'lari arasinda gecis. SSR-safe (Next.js
 * Link, querystring update). Selected tab vurgulanir.
 */

import Link from 'next/link'

interface TabNavProps {
  activeTab: 'mine' | 'public'
}

export function TabNav({ activeTab }: TabNavProps) {
  const linkClass = (tab: TabNavProps['activeTab']) =>
    tab === activeTab
      ? 'flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[var(--card)] px-4 text-sm font-extrabold text-[var(--focus-text)] shadow-sm'
      : 'flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 text-sm font-bold text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]'

  return (
    <nav
      aria-label="Oda sekmeleri"
      className="mb-5 grid grid-cols-2 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1"
    >
      <Link
        href="/oda"
        className={linkClass('mine')}
        aria-current={activeTab === 'mine' ? 'page' : undefined}
      >
        Odalarım
      </Link>
      <Link
        href="/oda?tab=public"
        className={linkClass('public')}
        aria-current={activeTab === 'public' ? 'page' : undefined}
      >
        Açık Odalar
      </Link>
    </nav>
  )
}
