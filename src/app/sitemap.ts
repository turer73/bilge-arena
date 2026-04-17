import type { MetadataRoute } from 'next'

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://bilgearena.com').trim()

const GAMES = ['matematik', 'turkce', 'fen', 'sosyal', 'wordquest']

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/arena`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/arena/siralama`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${BASE}/hakkinda`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/nasil-calisir`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/giris`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE}/arena/premium`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    // Yasal sayfalar
    { url: `${BASE}/gizlilik-politikasi`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/kullanim-kosullari`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/kvkk`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/cerez-politikasi`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ]

  const gamePages: MetadataRoute.Sitemap = GAMES.map((game) => ({
    url: `${BASE}/arena/${game}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  return [...staticPages, ...gamePages]
}
