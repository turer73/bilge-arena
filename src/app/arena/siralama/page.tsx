import type { Metadata } from 'next'
import SiralamaClient from './siralama-client'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'
import { Suspense } from 'react'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Sıralama — Haftalık ve Genel Liderboard',
  description: 'Bilge Arena haftalık ve tüm zamanlar sıralaması. En çok XP kazanan öğrencileri gör ve sıralamada yüksel!',
  alternates: {
    canonical: `${siteUrl}/arena/siralama`,
  },
  openGraph: {
    ...OG_DEFAULTS,
    title: 'Sıralama | Bilge Arena',
    description: 'Haftalık ve genel sıralama — en başarılı arenacıları gör.',
    url: `${siteUrl}/arena/siralama`,
  },
}

export default function SiralamaPage() {
  return <Suspense fallback={null}><SiralamaClient /></Suspense>
}
