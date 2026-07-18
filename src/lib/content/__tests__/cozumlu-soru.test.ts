import { describe, it, expect } from 'vitest'
import { COZUMLU_SORU_LIST, COZUMLU_SORU_SLUGS, getCozumluSoru } from '../cozumlu-soru'

describe('cozumlu soru kontrati', () => {
  it('en az 1 soru var ve slug benzersiz', () => {
    expect(COZUMLU_SORU_LIST.length).toBeGreaterThan(0)
    expect(new Set(COZUMLU_SORU_SLUGS).size, 'slug benzersiz olmali').toBe(COZUMLU_SORU_SLUGS.length)
  })

  it('her sorunun zorunlu alanlari gecerli', () => {
    for (const s of COZUMLU_SORU_LIST) {
      expect(s.slug, s.title).toMatch(/^[a-z0-9-]+$/)
      expect(s.ders.length).toBeGreaterThan(0)
      expect(s.title.length).toBeGreaterThan(5)
      expect(s.description.length).toBeGreaterThan(20)
      expect(s.readingMinutes).toBeGreaterThan(0)
      expect(s.question.length).toBeGreaterThan(10)
      expect(s.options.length, `${s.slug} secenek sayisi`).toBeGreaterThanOrEqual(2)
      expect(s.options, `${s.slug} dogru cevap secenekler icinde olmali`).toContain(s.correctAnswer)
      expect(s.steps.length, `${s.slug} adim adim cozum bos`).toBeGreaterThan(0)
      expect(s.commonMistake.length).toBeGreaterThan(10)
      expect(s.tip.length).toBeGreaterThan(10)
      expect(s.updated, `${s.slug} updated ISO`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('getCozumluSoru bilinen slug dondurur, bilinmeyen icin undefined', () => {
    expect(getCozumluSoru(COZUMLU_SORU_SLUGS[0])?.slug).toBe(COZUMLU_SORU_SLUGS[0])
    expect(getCozumluSoru('boyle-bir-soru-yok')).toBeUndefined()
  })
})
