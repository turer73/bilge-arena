import type { Metadata } from 'next'
import ArenaClient from './arena-client'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Arena — 5 Oyun Konsolu ile YKS Hazırlık',
  description: 'Matematik, Türkçe, Fen, Sosyal ve İngilizce — 5 oyun konsolundan birini seç ve YKS sorularını çözerek XP kazan!',
  alternates: {
    canonical: `${siteUrl}/arena`,
  },
  openGraph: {
    title: 'Arena | Bilge Arena',
    description: '5 farklı oyun konsoluy YKS\'ye hazırlan. Soruları çöz, XP kazan, sıralamada yüksel!',
    url: `${siteUrl}/arena`,
  },
}

export default function ArenaPage() {
  return <ArenaClient />
}
