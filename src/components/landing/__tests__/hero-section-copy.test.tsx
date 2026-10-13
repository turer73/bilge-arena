import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}))
vi.mock('next/image', () => ({
  default: ({ priority: _priority, fill: _fill, alt, ...props }: React.ComponentProps<'img'> & { priority?: boolean; fill?: boolean }) => <img alt={alt ?? ''} {...props} />,
}))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('../arena-background', () => ({ ArenaBackground: () => null }))
vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => ({ theme: 'night' }),
  DARK_THEMES: new Set(['night']),
}))
vi.mock('@/lib/utils/plausible', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/experiments/activation', () => ({
  ACTIVATION_EXPERIMENT: 'test',
  getActivationVariant: () => 'control',
  markActivationExposure: vi.fn(),
}))

import { HeroSection } from '../hero-section'

describe('mobile home hero', () => {
  it('matches the desktop promise and game/study routes by default', () => {
    render(<HeroSection />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Bilginle yeni dünyalar aç.')
    expect(heading.closest('.landing-hero-copy')).toBeInTheDocument()
    expect(screen.getByText(/Bir oyunla kendine meydan oku/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Oyunları keşfet/ })).toHaveAttribute('href', '/arena')
    expect(screen.getByRole('link', { name: /Ders çalış/ })).toHaveAttribute('href', '/arena/calisma')
    expect(screen.getByRole('img', { name: 'Bilge Arena' })).toHaveAttribute('sizes', expect.stringContaining('130px'))
  })

  it('preserves published CMS copy and CTA destinations', () => {
    render(<HeroSection config={{
      heading: ['Özel', 'CMS', 'Başlık'],
      subheading: 'Sınava hazırlık artık',
      cta_primary: { text: 'Özel oyun', href: '/arena' },
      cta_secondary: { text: 'Detaylar', href: '/nasil-calisir' },
    }} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Özel CMS Başlık')
    expect(screen.getByText(/Sınava hazırlık artık/)).toHaveTextContent('oyun kadar eğlenceli')
    expect(screen.getByRole('link', { name: /Detaylar/ })).toHaveAttribute('href', '/nasil-calisir')
  })

  it('renders the micro goal preview before its interactive code loads', () => {
    render(<HeroSection />)
    expect(screen.getByRole('heading', { level: 2, name: 'Hedefin hangisi?' })).toBeInTheDocument()
    expect(screen.getByText(/Tek seçim, ardından 3 kısa Türkçe sorusu/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'LGS' })).not.toBeInTheDocument()
  })
})
