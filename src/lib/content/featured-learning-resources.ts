import { REHBER_ARTICLES } from './rehber'
import { COZUMLU_SORU_LIST } from './cozumlu-soru'

const featured = [
  { kind: 'Rehber', slug: 'verimli-calisma-yontemleri', prefix: '/rehber', items: REHBER_ARTICLES },
  { kind: 'Rehber', slug: 'deneme-sinavi-analizi', prefix: '/rehber', items: REHBER_ARTICLES },
  { kind: 'Çözümlü soru', slug: 'tyt-matematik-iki-basamakli-sayi-rakamlari', prefix: '/cozumlu-soru', items: COZUMLU_SORU_LIST },
  { kind: 'Çözümlü soru', slug: 'tyt-turkce-paragraf-ana-dusunce', prefix: '/cozumlu-soru', items: COZUMLU_SORU_LIST },
] as const

export const FEATURED_LEARNING_RESOURCES = featured.flatMap(({ kind, slug, prefix, items }) => {
  const item = items.find((entry) => entry.slug === slug)
  return item ? [{ kind, href: `${prefix}/${slug}`, title: item.title, description: item.description }] : []
})
