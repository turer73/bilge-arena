import type { MetadataRoute } from 'next'
import { REHBER_SLUGS } from '@/lib/content/rehber'

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

const GAMES = ['matematik', 'turkce', 'fen', 'sosyal', 'wordquest']

export default function sitemap(): MetadataRoute.Sitemap {
  // lastModified bilerek YOK: request-aninda new Date() tum URL listesine ayni
  // anlamsiz lastmod basiyordu — yanlis sinyal verecegine hic verme.

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/arena`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/arena/siralama`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/hakkinda`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/nasil-calisir`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/konular`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/rehber`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE}/giris`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE}/arena/premium`, changeFrequency: 'monthly', priority: 0.6 },
    // Yasal sayfalar
    { url: `${BASE}/gizlilik-politikasi`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/kullanim-kosullari`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/kvkk`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/cerez-politikasi`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  const gamePages: MetadataRoute.Sitemap = GAMES.map((game) => ({
    url: `${BASE}/arena/${game}`,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // Public konu sayfalari — indekslenebilir ozgun icerik (AdSense low-value fix)
  const konuPages: MetadataRoute.Sitemap = GAMES.map((game) => ({
    url: `${BASE}/konular/${game}`,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  const rehberPages: MetadataRoute.Sitemap = REHBER_SLUGS.map((slug) => ({
    url: `${BASE}/rehber/${slug}`,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }))

  return [...staticPages, ...gamePages, ...konuPages, ...rehberPages]
}
