import type { Metadata } from 'next'
import PremiumClient from './premium-client'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

/* ─── SEO Metadata ─── */
export const metadata: Metadata = {
  title: 'Premium Yakında — Bilge Arena',
  description:
    'Bilge Arena Premium henüz satışta değil. Planları inceleyin ve lansman duyurusu için bildirim listesine katılın.',
  keywords: [
    'Bilge Arena Premium', 'YKS premium', 'LGS premium', 'sınırsız soru çöz',
    'reklamsız öğrenme', 'YKS hazırlık abonelik', 'AYT hazırlık',
  ],
  alternates: {
    canonical: `${siteUrl}/arena/premium`,
  },
  openGraph: {
    ...OG_DEFAULTS,
    title: 'Bilge Arena Premium Yakında',
    description: 'Premium henüz satışta değil. Lansman duyurusu için bildirim listesine katılın.',
    url: `${siteUrl}/arena/premium`,
    images: [{ url: `${siteUrl}/og-image.png`, width: 1200, height: 630, alt: 'Bilge Arena Premium' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bilge Arena Premium Yakında',
    description: 'Premium henüz satışta değil. Lansman duyurusu için bildirim listesine katılın.',
    images: [`${siteUrl}/og-image.png`],
  },
}

export default function PremiumPage() {
  return <PremiumClient />
}
