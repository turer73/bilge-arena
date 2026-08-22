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
})
