import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TrackedCtaLink } from '../tracked-cta-link'
import { trackEvent } from '@/lib/utils/plausible'

vi.mock('@/lib/utils/plausible', () => ({ trackEvent: vi.fn() }))

describe('TrackedCtaLink', () => {
  beforeEach(() => {
    vi.mocked(trackEvent).mockClear()
    window.gtag = vi.fn()
  })

  it('Plausible ve GA4 icin anonim CTA olayi gonderir', () => {
    render(
      <TrackedCtaLink href="/arena" page="nasil-calisir" placement="hero_try">
        Ücretsiz dene
      </TrackedCtaLink>,
    )

    const link = screen.getByRole('link', { name: 'Ücretsiz dene' })
    link.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(link)

    const props = {
      page: 'nasil-calisir',
      placement: 'hero_try',
      target: '/arena',
    }
    expect(trackEvent).toHaveBeenCalledWith('MarketingCtaClicked', { props })
    expect(window.gtag).toHaveBeenCalledWith('event', 'marketing_cta_click', props)
  })
})
