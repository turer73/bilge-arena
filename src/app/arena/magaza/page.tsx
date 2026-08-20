import type { Metadata } from 'next'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'
import { StoreTabs } from './store-tabs'

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
    <div className="mx-auto w-full max-w-[860px] overflow-x-clip px-3 py-4 sm:px-4 md:p-6">
      <h1 className="font-display text-2xl font-black text-[var(--text)]">🛍️ Mağaza</h1>
      <p className="mt-1 text-sm text-[var(--text-sub)]">
        Quiz&apos;lerden kazandığın coinlerle profiline özel kozmetikler seç.
      </p>
      <StoreTabs />
    </div>
  )
}
