import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CozumluSoruPage from '../page'
import CozumluSoruDetailPage, { generateMetadata, generateStaticParams } from '../[slug]/page'
import { COZUMLU_SORU_SLUGS, COZUMLU_SORU_LIST } from '@/lib/content/cozumlu-soru'

describe('/cozumlu-soru index', () => {
  it('h1 + soru basliklarini listeler', () => {
    render(<CozumluSoruPage />)
    expect(screen.getByRole('heading', { name: 'Çözümlü Sorular', level: 1 })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: COZUMLU_SORU_LIST[0].title })
    ).toBeInTheDocument()
  })
})

describe('/cozumlu-soru/[slug]', () => {
  it('generateStaticParams tum soru slug-larini dondurur', () => {
    expect(generateStaticParams().length).toBe(COZUMLU_SORU_SLUGS.length)
  })

  it('gecerli soru sayfasini render eder (soru + cozum + dogru cevap)', async () => {
    const slug = COZUMLU_SORU_SLUGS[0]
    const s = COZUMLU_SORU_LIST[0]
    const ui = await CozumluSoruDetailPage({ params: Promise.resolve({ slug }) })
    render(ui)
    expect(screen.getByRole('heading', { name: s.title, level: 1 })).toBeInTheDocument()
    expect(screen.getByText(s.question)).toBeInTheDocument()
    // correctAnswer hem seçenekler listesinde hem "Doğru Cevap" kutusunda görünür (kasıtlı) — çoklu-eşleşme beklenir.
    expect(screen.getAllByText(s.correctAnswer).length).toBeGreaterThanOrEqual(2)
  })

  it('basliga markayi bir kez koyar: kok layout sablonu "%s | Bilge Arena" iki kez eklemesin', async () => {
    for (const slug of COZUMLU_SORU_SLUGS) {
      const m = await generateMetadata({ params: Promise.resolve({ slug }) })
      expect(m.title, slug).toEqual({ absolute: expect.any(String) })
      const absolute = (m.title as { absolute: string }).absolute
      expect(absolute.match(/Bilge Arena/g)?.length ?? 0, slug).toBeLessThanOrEqual(1)
    }
  })

  it('hiz problemi sayfasi formul ozetini, yetisme ornegini ve kisa arama basligini tasir', async () => {
    const slug = 'tyt-matematik-hiz-problemi-karsilasma'
    const m = await generateMetadata({ params: Promise.resolve({ slug }) })
    expect(m.title).toEqual({ absolute: 'Hız Problemi Karşılaşma Formülü: Çözümlü Soru ve Örnekler' })
    render(await CozumluSoruDetailPage({ params: Promise.resolve({ slug }) }))
    expect(screen.getByRole('heading', { name: 'Formül Özeti', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('t = x / (V₁ + V₂)')).toBeInTheDocument()
    expect(screen.getByText('t = x / (V₁ − V₂)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Örnek: Aynı yöne giden araçlar/, level: 2 })).toBeInTheDocument()
    expect(screen.getByText(/kaç saat sonra karşılaşır\?/)).toBeInTheDocument()
  })

  it('generateMetadata baslik + canonical uretir', async () => {
    const slug = COZUMLU_SORU_SLUGS[0]
    const m = await generateMetadata({ params: Promise.resolve({ slug }) })
    expect(m.title).toBeTruthy()
    expect(m.alternates?.canonical).toContain(`/cozumlu-soru/${slug}`)
  })
})
