import type { Metadata } from 'next'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'
import { StoreTabs } from './store-tabs'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Mağaza — Profil Kozmetikleri',
  description: 'Kazandığın coinlerle profiline özel arka planlar ve isim panelleri al: kozmik, cyberpunk, manzara, lo-fi ve pixel temalar.',
  robots: { index: false }, // coin-ekonomisi araç sayfası
  openGraph: {
    ...OG_DEFAULTS,
    title: 'Mağaza | Bilge Arena',
    description: 'Coinlerinle profiline özel arka planlar ve isim panelleri al.',
  },
}

export default function StorePage() {
  return (
    <div data-store-screen className="mx-auto min-h-dvh w-full max-w-[1180px] scroll-mt-[var(--navbar-h)] overflow-x-clip bg-[var(--app-bg)] px-3 pb-28 pt-4 sm:px-4 md:px-5 md:pt-5 lg:px-6 lg:pb-10 lg:pt-8">
      <style>{`
        @media (max-width: 1023px) {
          [data-app-navbar] { display: none !important; }
          [data-arena-main] { background: var(--app-bg) !important; padding: 0 !important; }
        }
      `}</style>
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border-2 border-[var(--app-warn-border)] bg-[var(--app-card)] p-4 shadow-[0_5px_0_var(--app-warn-border)] md:p-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-warn-ink)]">Kozmetik koleksiyonu</p>
          <h1 className="font-display text-2xl font-black text-[var(--app-text)]">🛍️ Mağaza</h1>
          <p className="mt-1 text-sm font-semibold text-[var(--app-text-sub)]">
            Quiz&apos;lerden kazandığın coinlerle profiline özel kozmetikler seç.
          </p>
        </div>
        <Link
          href="/arena/kisisellestir"
          className="flex min-h-11 items-center rounded-xl border-2 border-[var(--app-accent-border)] bg-[var(--app-accent-tint)] px-4 py-2 text-xs font-black text-[var(--app-accent-text)] shadow-[0_3px_0_var(--app-shadow-accent)]"
        >
          🎨 Stüdyoya Git
        </Link>
      </header>
      <StoreTabs />
    </div>
  )
}
