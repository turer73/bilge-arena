import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HomeFaq } from '../home-faq'
import { HOME_FAQ } from '@/lib/content/site-faq'

describe('HomeFaq', () => {
  it('shows every homepage question with its answer and a link to the full list', () => {
    const { container } = render(<HomeFaq />)
    expect(screen.getByRole('heading', { name: 'Sık sorulan sorular', level: 2 })).toBeInTheDocument()
    for (const item of HOME_FAQ) {
      expect(screen.getByText(item.q)).toBeInTheDocument()
      expect(screen.getByText(item.a)).toBeInTheDocument()
    }
    expect(container.querySelectorAll('details')).toHaveLength(HOME_FAQ.length)
    expect(screen.getByRole('link', { name: 'Tüm sorular' })).toHaveAttribute('href', '/nasil-calisir#sss-baslik')
  })

  it('publishes a FAQPage that matches the visible questions', () => {
    const { container } = render(<HomeFaq />)
    const script = container.querySelector('script[type="application/ld+json"]')
    const data = JSON.parse(script?.textContent ?? '{}')
    expect(data['@type']).toBe('FAQPage')
    expect(data.mainEntity.map((entity: { name: string }) => entity.name)).toEqual(HOME_FAQ.map((item) => item.q))
  })
})
