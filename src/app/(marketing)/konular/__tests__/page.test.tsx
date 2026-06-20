import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import KonularPage from '../page'
import KonuPage, { generateMetadata, generateStaticParams } from '../[slug]/page'

describe('/konular index', () => {
  it('h1 + ders basliklarini render eder', () => {
    render(<KonularPage />)
    expect(screen.getByRole('heading', { name: 'Konular', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Matematik' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'İngilizce' })).toBeInTheDocument()
  })
})

describe('/konular/[slug]', () => {
  it('generateStaticParams 5 dersi dondurur', () => {
    expect(generateStaticParams().length).toBe(5)
  })

  it('gecerli ders sayfasi konu + ornek soru render eder', async () => {
    const ui = await KonuPage({ params: Promise.resolve({ slug: 'matematik' }) })
    render(ui)
    expect(screen.getByRole('heading', { name: 'Konu Başlıkları' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Örnek Sorular' })).toBeInTheDocument()
    // en az bir "Doğru" rozeti (cevap anahtari render ediliyor)
    expect(screen.getAllByText('Doğru').length).toBeGreaterThan(0)
  })

  it('generateMetadata canonical + keywords uretir', async () => {
    const m = await generateMetadata({ params: Promise.resolve({ slug: 'turkce' }) })
    expect(m.alternates?.canonical).toContain('/konular/turkce')
    expect((m.keywords as string[]).length).toBeGreaterThan(0)
  })
})
