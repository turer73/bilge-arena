import type { Metadata } from 'next'
import { GAMES, type GameSlug, GAME_SLUGS } from '@/lib/constants/games'
import { notFound } from 'next/navigation'
import GameClient from './game-client'

interface GamePageProps {
  params: Promise<{ game: string }>
}

const GAME_META: Record<GameSlug, { title: string; description: string }> = {
  matematik: {
    title: 'Matematik Sorulari',
    description: 'Sayilar, problemler, geometri, denklemler ve fonksiyonlar. TYT-AYT matematik sorularini coz, XP kazan.',
  },
  turkce: {
    title: 'Turkce Sorulari',
    description: 'Paragraf, dil bilgisi, sozcuk ve anlam bilgisi. TYT Turkce sorulariyla pratik yap.',
  },
  fen: {
    title: 'Fen Bilimleri Sorulari',
    description: 'Fizik, kimya ve biyoloji sorulari. TYT Fen Bilimleri konularina hakim ol.',
  },
  sosyal: {
    title: 'Sosyal Bilimler Sorulari',
    description: 'Tarih, cografya ve felsefe sorulari. TYT Sosyal Bilimler konulariyla antreman yap.',
  },
  wordquest: {
    title: 'Ingilizce Sorulari',
    description: 'Vocabulary, grammar ve reading. YDT Ingilizce sorulariyla kelime dagarcigini genislet.',
  },
}

export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  const { game } = await params

  if (!GAME_SLUGS.includes(game as GameSlug)) {
    return { title: 'Oyun Bulunamadi' }
  }

  const meta = GAME_META[game as GameSlug]
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com'
  const ogImage = `${siteUrl}/og?title=${encodeURIComponent(meta.title)}&subtitle=${encodeURIComponent(meta.description.slice(0, 80))}`

  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      title: `${meta.title} | Bilge Arena`,
      description: meta.description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
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

export default async function GameConsolePage({ params }: GamePageProps) {
  const { game } = await params

  if (!GAME_SLUGS.includes(game as GameSlug)) {
    notFound()
  }

  return <GameClient />
}
