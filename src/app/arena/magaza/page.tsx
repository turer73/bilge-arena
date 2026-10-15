import type { Metadata } from 'next'
import Image from 'next/image'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'
import { StoreTabs } from './store-tabs'
import Link from 'next/link'
import { Coins, Palette, ShoppingBag, Sparkles } from 'lucide-react'

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
    <div data-store-screen className="mx-auto min-h-dvh w-full max-w-[1180px] scroll-mt-[var(--navbar-h)] overflow-x-clip bg-[var(--app-bg)] px-3 pb-28 pt-3 text-[var(--app-text)] sm:px-4 md:px-5 md:pt-5 lg:bg-transparent lg:px-6 lg:pb-10 lg:pt-8">
      <style>{`
        @media (max-width: 1023px) {
          [data-app-navbar] { display: none !important; }
          [data-arena-main] { background: var(--app-bg) !important; padding: 0 !important; }
        }
      `}</style>
      <header data-store-hero className="relative min-h-[220px] overflow-hidden rounded-[26px] border-2 border-[var(--app-warn-border)] bg-[var(--app-card)] p-5 shadow-[0_6px_0_var(--app-warn-border)] md:min-h-[240px] md:p-7">
        <Image src="/academy/academy-landscape.png" alt="" fill priority sizes="(min-width: 1024px) 1120px, 100vw" className="pointer-events-none object-cover object-center opacity-30" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--app-card)] via-[var(--app-card)]/95 to-[var(--app-card)]/40" />
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border-[44px] border-[var(--app-warn)]/10" />
        <div className="relative z-10 max-w-2xl">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--app-warn-ink)]"><Sparkles size={14} /> Kozmetik koleksiyonu</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-3xl font-black text-[var(--app-text)] md:text-4xl"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--app-warn-tint)] text-[var(--app-warn-ink)]"><ShoppingBag size={25} strokeWidth={2.6} /></span>Mağaza</h1>
          <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-[var(--app-text-sub)] md:text-base">Oyunlardan kazandığın altınlarla profilini yansıtan çerçeve, arka plan, isim paneli, süs ve rozetleri keşfet.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black">
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--app-warn-border)] bg-[var(--app-warn-tint)] px-3 text-[var(--app-warn-ink)]"><Coins size={14} /> Oynayarak kazan</span>
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--app-accent-border)] bg-[var(--app-accent-tint)] px-3 text-[var(--app-accent-text)]"><Palette size={14} /> Stüdyoda uygula</span>
          </div>
        </div>
        <Link href="/arena/kisisellestir" className="relative z-10 mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--app-accent)] px-4 text-xs font-black text-white shadow-[0_4px_0_var(--app-accent-strong)] md:absolute md:bottom-7 md:right-7 md:mt-0">
          <Palette size={16} /> Stüdyoya Git
        </Link>
      </header>
      <StoreTabs />
    </div>
  )
}
