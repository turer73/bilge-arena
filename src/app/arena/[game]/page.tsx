import type { Metadata } from 'next'
import { type GameSlug, GAME_SLUGS } from '@/lib/constants/games'
import { notFound } from 'next/navigation'
import GameClient from './game-client'
import { OG_DEFAULTS } from '@/lib/seo/og-defaults'

interface GamePageProps {
  params: Promise<{ game: string }>
}

const GAME_META: Record<GameSlug, { title: string; description: string; keywords: string[] }> = {
  matematik: {
    title: 'Matematik Soruları — TYT · AYT-SAY · LGS Matematik',
    description: 'Sayılar, problemler, geometri, türev, integral. TYT\'den AYT Sayısal\'a ve LGS\'ye matematik sorularını çöz, XP kazan!',
    keywords: ['TYT matematik', 'AYT matematik', 'LGS matematik', 'matematik soru çöz', 'geometri soruları', 'YKS matematik'],
  },
  turkce: {
    title: 'Türkçe Soruları — TYT · AYT-EA · LGS Türkçe',
    description: 'Paragraf, dil bilgisi, edebiyat, sözcük ve anlam bilgisi. TYT, AYT Eşit Ağırlık ve LGS Türkçe sorularıyla pratik yap!',
    keywords: ['TYT Türkçe', 'AYT EA Türkçe', 'LGS Türkçe', 'edebiyat soruları', 'paragraf soruları', 'dil bilgisi soruları'],
  },
  fen: {
    title: 'Fen Bilimleri Soruları — TYT · AYT-SAY · LGS Fen',
    description: 'Fizik, kimya ve biyoloji soruları. TYT temelinden AYT Sayısal düzeyine kadar Fen Bilimleri konularına hâkim ol!',
    keywords: ['TYT Fen', 'AYT Sayısal fen', 'LGS fen', 'fizik soruları', 'kimya soruları', 'biyoloji soruları'],
  },
  sosyal: {
    title: 'Sosyal Bilimler Soruları — TYT · LGS Sosyal',
    description: 'Tarih, coğrafya, felsefe ve sosyoloji soruları. TYT ve LGS Sosyal Bilimler konularıyla antrenman yap!',
    keywords: ['TYT Sosyal', 'LGS sosyal bilimler', 'tarih soruları', 'coğrafya soruları', 'felsefe soruları'],
  },
  wordquest: {
    title: 'İngilizce Soruları — YDT İngilizce',
    description: 'Vocabulary, grammar ve reading soruları. YDT İngilizce sorularıyla kelime dağarcığını genişlet, sıralamada yüksel!',
    keywords: ['YDT İngilizce', 'İngilizce soru çöz', 'vocabulary', 'grammar soruları', 'YKS İngilizce'],
  },
}

export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  const { game } = await params

  // notFound() burada (streaming oncesi) cagrilmali: page icindeki guard
  // loading.tsx shell'i 200 ile stream edildikten sonra calisir ve status'u
  // degistiremez (soft-404). Metadata asamasinda cagrilinca gercek 404 doner.
  if (!GAME_SLUGS.includes(game as GameSlug)) {
    notFound()
  }

  const meta = GAME_META[game as GameSlug]
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()
  const ogImage = `${siteUrl}/og?title=${encodeURIComponent(meta.title)}&subtitle=${encodeURIComponent(meta.description.slice(0, 80))}`

  return {
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    alternates: {
      canonical: `${siteUrl}/arena/${game}`,
    },
    openGraph: {
      ...OG_DEFAULTS,
      title: `${meta.title} | Bilge Arena`,
      description: meta.description,
      url: `${siteUrl}/arena/${game}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: meta.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${meta.title} | Bilge Arena`,
      description: meta.description,
      images: [ogImage],
    },
  }
}

export function generateStaticParams() {
  return GAME_SLUGS.map((game) => ({ game }))
}

// Soft-404 fix: loading.tsx boundary'si shell'i 200 ile stream ettigi icin
// page/generateMetadata icindeki notFound() status'u degistiremiyor.
// Slug listesi sabit — bilinmeyen param router seviyesinde gercek 404 alsin.
export const dynamicParams = false

export default async function GameConsolePage({ params }: GamePageProps) {
  const { game } = await params

  if (!GAME_SLUGS.includes(game as GameSlug)) {
    notFound()
  }

  return <GameClient />
}
