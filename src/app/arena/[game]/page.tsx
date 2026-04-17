import type { Metadata } from 'next'
import { GAMES, type GameSlug, GAME_SLUGS } from '@/lib/constants/games'
import { notFound } from 'next/navigation'
import GameClient from './game-client'

interface GamePageProps {
  params: Promise<{ game: string }>
}

const GAME_META: Record<GameSlug, { title: string; description: string; keywords: string[] }> = {
  matematik: {
    title: 'Matematik Soruları — TYT & AYT Matematik',
    description: 'Sayılar, problemler, geometri, denklemler ve fonksiyonlar. TYT-AYT matematik sorularını çöz, XP kazan, sıralamada yüksel!',
    keywords: ['TYT matematik', 'AYT matematik', 'matematik soru çöz', 'geometri soruları', 'YKS matematik'],
  },
  turkce: {
    title: 'Türkçe Soruları — TYT Türkçe',
    description: 'Paragraf, dil bilgisi, sözcük ve anlam bilgisi. TYT Türkçe sorularıyla pratik yap, dil hakimiyetini geliştir!',
    keywords: ['TYT Türkçe', 'Türkçe soru çöz', 'paragraf soruları', 'dil bilgisi soruları', 'YKS Türkçe'],
  },
  fen: {
    title: 'Fen Bilimleri Soruları — TYT Fen',
    description: 'Fizik, kimya ve biyoloji soruları. TYT Fen Bilimleri konularına hâkim ol, bilgini test et!',
    keywords: ['TYT Fen', 'fizik soruları', 'kimya soruları', 'biyoloji soruları', 'YKS Fen Bilimleri'],
  },
  sosyal: {
    title: 'Sosyal Bilimler Soruları — TYT Sosyal',
    description: 'Tarih, coğrafya ve felsefe soruları. TYT Sosyal Bilimler konularıyla antrenman yap, bilgini pekiştir!',
    keywords: ['TYT Sosyal', 'tarih soruları', 'coğrafya soruları', 'felsefe soruları', 'YKS Sosyal Bilimler'],
  },
  wordquest: {
    title: 'İngilizce Soruları — YDT İngilizce',
    description: 'Vocabulary, grammar ve reading soruları. YDT İngilizce sorularıyla kelime dağarcığını genişlet!',
    keywords: ['YDT İngilizce', 'İngilizce soru çöz', 'vocabulary', 'grammar soruları', 'YKS İngilizce'],
  },
}

export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  const { game } = await params

  if (!GAME_SLUGS.includes(game as GameSlug)) {
    return { title: 'Oyun Bulunamadi' }
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

export default async function GameConsolePage({ params }: GamePageProps) {
  const { game } = await params

  if (!GAME_SLUGS.includes(game as GameSlug)) {
    notFound()
  }

  return <GameClient />
}
