import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FeaturedLearningResources } from '../featured-learning-resources'

describe('FeaturedLearningResources', () => {
  it('gerçek rehber ve çözümlü soru sayfalarına bağlantı verir', () => {
    render(<FeaturedLearningResources />)

    expect(screen.getByRole('heading', { name: 'Okuyarak da ilerle' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tüm rehberler' })).toHaveAttribute('href', '/rehber')
    expect(screen.getByRole('link', { name: 'Tüm çözümler' })).toHaveAttribute('href', '/cozumlu-soru')
    expect(document.querySelectorAll('article a[href^="/rehber/"]')).toHaveLength(2)
    expect(document.querySelectorAll('article a[href^="/cozumlu-soru/"]')).toHaveLength(2)
  })
})
