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

  it('generateMetadata baslik + canonical uretir', async () => {
    const slug = COZUMLU_SORU_SLUGS[0]
    const m = await generateMetadata({ params: Promise.resolve({ slug }) })
    expect(m.title).toBeTruthy()
    expect(m.alternates?.canonical).toContain(`/cozumlu-soru/${slug}`)
  })
})
