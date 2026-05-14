import type { Metadata } from 'next'
import ArenaClient from './arena-client'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

export const metadata: Metadata = {
  title: 'Arena — 5 Oyun Konsolu ile YKS · LGS · AYT Hazırlık',
  description: 'Matematik, Türkçe, Fen, Sosyal ve İngilizce — 5 oyun konsolundan birini seç ve YKS, LGS, TYT, AYT sorularını çözerek XP kazan!',
  alternates: {
    canonical: `${siteUrl}/arena`,
  },
  openGraph: {
    title: 'Arena | Bilge Arena',
    description: '5 farklı oyun konsoluy YKS, LGS ve AYT\'ye hazırlan. Soruları çöz, XP kazan, sıralamada yüksel!',
    url: `${siteUrl}/arena`,
  },
}

export default function ArenaPage() {
  return <ArenaClient />
}
