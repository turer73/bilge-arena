import { describe, it, expect } from 'vitest'
import sitemap from '../sitemap'
import { GAME_SLUGS } from '@/lib/constants/games'
import { REHBER_SLUGS } from '@/lib/content/rehber'
import { COZUMLU_SORU_SLUGS } from '@/lib/content/cozumlu-soru'

describe('sitemap', () => {
  const urls = sitemap().map((e) => e.url)

  it('konular index + her ders konu sayfasi var', () => {
    expect(urls.some((u) => u.endsWith('/konular'))).toBe(true)
    for (const slug of GAME_SLUGS) {
      expect(urls.some((u) => u.endsWith(`/konular/${slug}`)), `konular/${slug} eksik`).toBe(true)
    }
  })

  it('rehber index + her yazi var', () => {
    expect(urls.some((u) => u.endsWith('/rehber'))).toBe(true)
    for (const slug of REHBER_SLUGS) {
      expect(urls.some((u) => u.endsWith(`/rehber/${slug}`)), `rehber/${slug} eksik`).toBe(true)
    }
  })

  it('cozumlu-soru index + her soru var', () => {
    expect(urls.some((u) => u.endsWith('/cozumlu-soru'))).toBe(true)
    for (const slug of COZUMLU_SORU_SLUGS) {
      expect(urls.some((u) => u.endsWith(`/cozumlu-soru/${slug}`)), `cozumlu-soru/${slug} eksik`).toBe(true)
    }
  })

  it('mevcut temel sayfalar korunur (regresyon)', () => {
    expect(urls.some((u) => u.endsWith('/arena'))).toBe(true)
    expect(urls.some((u) => /\/$|bilgearena\.com$/.test(u))).toBe(true)
  })
})
