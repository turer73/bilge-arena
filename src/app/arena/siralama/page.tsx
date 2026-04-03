import type { Metadata } from 'next'
import SiralamaClient from './siralama-client'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Sıralama — Haftalık ve Genel Liderboard',
  description: 'Bilge Arena haftalık ve tüm zamanlar sıralaması. En çok XP kazanan öğrencileri gör ve sıralamada yüksel!',
  alternates: {
    canonical: `${siteUrl}/arena/siralama`,
  },
  openGraph: {
    title: 'Sıralama | Bilge Arena',
    description: 'Haftalık ve genel sıralama — en başarılı arenacıları gör.',
    url: `${siteUrl}/arena/siralama`,
  },
}

export default function SiralamaPage() {
  return <SiralamaClient />
}
