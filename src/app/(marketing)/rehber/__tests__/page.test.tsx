import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RehberPage from '../page'
import RehberArticlePage, { generateMetadata, generateStaticParams } from '../[slug]/page'
import { REHBER_SLUGS, REHBER_ARTICLES } from '@/lib/content/rehber'

describe('/rehber index', () => {
  it('h1 + yazi basliklarini listeler', () => {
    render(<RehberPage />)
    expect(screen.getByRole('heading', { name: 'Sınav Rehberi', level: 1 })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: REHBER_ARTICLES[0].title })
    ).toBeInTheDocument()
  })
})

describe('/rehber/[slug]', () => {
  it('generateStaticParams tum yazi slug-larini dondurur', () => {
    expect(generateStaticParams().length).toBe(REHBER_SLUGS.length)
  })

  it('gecerli yazi makale govdesini render eder', async () => {
    const slug = REHBER_SLUGS[0]
    const ui = await RehberArticlePage({ params: Promise.resolve({ slug }) })
    render(ui)
    expect(
      screen.getByRole('heading', { name: REHBER_ARTICLES[0].title, level: 1 })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kaynaklar ve güncellik' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /ÖSYM/u })).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Bilge Arena İçerik Ekibi' })).toHaveAttribute(
      'href',
      '/hakkinda#icerik-sorumlulugu'
    )
  })

  it('generateMetadata baslik + canonical uretir', async () => {
    const slug = REHBER_SLUGS[0]
    const m = await generateMetadata({ params: Promise.resolve({ slug }) })
    expect(m.title).toEqual({
      absolute: `${REHBER_ARTICLES[0].title} | Bilge Arena Rehber`,
    })
    expect(m.alternates?.canonical).toContain(`/rehber/${slug}`)
  })

  it('ogrenme sistemi makalesi bilimsel sinirlari ve kaynaklariyla render edilir', async () => {
    const slug = 'bilge-arena-ogrenme-sistemi'
    const article = REHBER_ARTICLES.find((item) => item.slug === slug)
    expect(article).toBeDefined()
    expect(article?.body.some((paragraph) => paragraph.includes('tam ölçekli Item Response Theory'))).toBe(true)
    expect(article?.sources).toHaveLength(10)

    const ui = await RehberArticlePage({ params: Promise.resolve({ slug }) })
    render(ui)

    expect(screen.getByRole('heading', { name: article?.title, level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kaynaklar ve yöntem notu' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Aralıklı çalışmanın 317 deneylik/u })).toHaveAttribute(
      'href',
      'https://pubmed.ncbi.nlm.nih.gov/16719566/'
    )
    expect(screen.getByText(/başarı garantisi verdiği anlamına gelmez/u)).toBeInTheDocument()

    const metadata = await generateMetadata({ params: Promise.resolve({ slug }) })
    expect(metadata.title).toEqual({ absolute: 'Adaptif Öğrenme ve Soru Kalitesi | Bilge Arena' })
  })
})
