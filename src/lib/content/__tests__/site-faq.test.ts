import { describe, expect, it } from 'vitest'
import { FEATURES, FREE_DAILY_LIMIT } from '@/lib/constants/premium'
import { faqPageJsonLd, HOME_FAQ, SITE_FAQ } from '../site-faq'

describe('site FAQ', () => {
  it('has unique questions and puts pricing and trust first on the homepage', () => {
    expect(new Set(SITE_FAQ.map((item) => item.q)).size).toBe(SITE_FAQ.length)
    expect(HOME_FAQ.map((item) => item.q).slice(0, 3)).toEqual([
      'Bilge Arena nedir?',
      'Bilge Arena ücretsiz mi?',
      'Bilge Arena güvenilir mi, verilerim güvende mi?',
    ])
    for (const item of HOME_FAQ) expect(SITE_FAQ).toContain(item)
  })

  it('derives the pricing answer from the live premium flags', () => {
    const pricing = SITE_FAQ.find((item) => item.q === 'Bilge Arena ücretsiz mi?')?.a ?? ''
    if (FEATURES.QUIZ_LIMIT) expect(pricing).toContain(`günde ${FREE_DAILY_LIMIT} quiz`)
    else expect(pricing).toContain('günlük soru limiti yoktur')
    expect(pricing.includes('reklam')).toBe(FEATURES.ADS)
    expect(pricing).toContain('Premium planlar henüz satışta değil')
  })

  it('does not promise a self-service data download the UI does not offer', () => {
    // /api/account/export var ama arayüzde ona giden bir düğme yok (2026-10-18).
    const trust = SITE_FAQ.find((item) => item.q.startsWith('Bilge Arena güvenilir mi'))?.a ?? ''
    expect(trust).not.toMatch(/indir|dışa aktar/i)
    expect(trust).toContain('Google hesabınla')
    expect(trust).toContain('Hesap ve veri yönetimi')
  })

  it('builds a FAQPage node whose answers match the visible text', () => {
    const node = faqPageJsonLd(HOME_FAQ, 'https://bilgearena.com/#faq')
    expect(node['@type']).toBe('FAQPage')
    expect(node.mainEntity.map((entity) => [entity.name, entity.acceptedAnswer.text]))
      .toEqual(HOME_FAQ.map((item) => [item.q, item.a]))
  })
})
