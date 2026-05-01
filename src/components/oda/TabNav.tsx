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
  return (
    <nav
      aria-label="Oda sekmeleri"
      className="mb-6 flex gap-1 border-b border-[var(--border)]"
    >
      <Link
        href="/oda"
        className={
          activeTab === 'mine'
            ? 'border-b-2 border-[var(--focus)] px-4 py-2 text-sm font-bold'
            : 'px-4 py-2 text-sm text-[var(--text-sub)] transition-colors hover:text-[var(--text)]'
        }
        aria-current={activeTab === 'mine' ? 'page' : undefined}
      >
        Odalarım
      </Link>
      <Link
        href="/oda?tab=public"
        className={
          activeTab === 'public'
            ? 'border-b-2 border-[var(--focus)] px-4 py-2 text-sm font-bold'
            : 'px-4 py-2 text-sm text-[var(--text-sub)] transition-colors hover:text-[var(--text)]'
        }
        aria-current={activeTab === 'public' ? 'page' : undefined}
      >
        Aktif Odalar
      </Link>
    </nav>
  )
}
