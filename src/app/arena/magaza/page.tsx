import type { Metadata } from 'next'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'
import { Navbar } from '@/components/layout/navbar'
import { StoreClient } from './store-client'

export const metadata: Metadata = {
  title: 'Mağaza — Profil Arka Planları',
  description: 'Kazandığın coinlerle profiline özel arka planlar al: kozmik, cyberpunk, manzara, lo-fi ve pixel temalar.',
  robots: { index: false }, // coin-ekonomisi araç sayfası
  openGraph: {
    ...OG_DEFAULTS,
    title: 'Mağaza | Bilge Arena',
    description: 'Coinlerinle profiline özel arka planlar al.',
  },
}

export default function StorePage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-[860px] p-4 md:p-6">
        <h1 className="font-display text-2xl font-black text-[var(--text)]">🛍️ Arka Plan Mağazası</h1>
        <p className="mt-1 text-sm text-[var(--text-sub)]">
          Quiz&apos;lerden kazandığın coinlerle profiline özel temalar seç.
        </p>
        <StoreClient />
      </main>
    </>
  )
}
