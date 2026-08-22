import { describe, it, expect } from 'vitest'
import { REHBER_ARTICLES, REHBER_SLUGS, getArticle } from '../rehber'

describe('rehber yazilari kontrati', () => {
  it('en az 1 yazi var ve slug benzersiz', () => {
    expect(REHBER_ARTICLES.length).toBeGreaterThan(0)
    expect(new Set(REHBER_SLUGS).size, 'slug benzersiz olmali').toBe(REHBER_SLUGS.length)
  })

  it('her yazinin zorunlu alanlari gecerli', () => {
    for (const a of REHBER_ARTICLES) {
      expect(a.slug, a.title).toMatch(/^[a-z0-9-]+$/)
      expect(a.title.length).toBeGreaterThan(5)
      expect(a.description.length).toBeGreaterThan(20)
      expect(a.category.length).toBeGreaterThan(0)
      expect(a.readingMinutes).toBeGreaterThan(0)
      expect(a.body.length, `${a.slug} body bos`).toBeGreaterThan(0)
      expect(a.updated, `${a.slug} updated ISO`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('getArticle bilinen slug dondurur, bilinmeyen icin undefined', () => {
    expect(getArticle(REHBER_SLUGS[0])?.slug).toBe(REHBER_SLUGS[0])
    expect(getArticle('boyle-bir-yazi-yok')).toBeUndefined()
  })

  it('AdSense orneklenen TYT-AYT rehberi doyurucu ve birincil kaynakli kalir', () => {
    const article = getArticle('tyt-ayt-farki')
    const wordCount = article?.body.join(' ').split(/\s+/u).length ?? 0

    expect(wordCount).toBeGreaterThan(900)
    expect(article?.sources?.length).toBeGreaterThanOrEqual(2)
    expect(article?.sources?.every((source) => source.url.startsWith('https://www.osym.gov.tr/'))).toBe(true)
  })
})
