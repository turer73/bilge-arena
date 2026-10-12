import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../premium-client', () => ({
  default: () => <div>Premium bildirim listesi</div>,
}))

import PremiumPage, { metadata } from '../page'

describe('PremiumPage', () => {
  it('describes the waitlist instead of promising an active trial or checkout', () => {
    expect(metadata.title).toContain('Yakında')
    expect(metadata.description).toContain('henüz satışta değil')
    expect(metadata.openGraph?.description).toContain('henüz satışta değil')
    expect(metadata.twitter?.description).toContain('henüz satışta değil')
    expect(JSON.stringify(metadata)).not.toMatch(/7 gün ücretsiz|tek tıkla iptal|kredi kartı/i)
  })

  it('does not emit stale FAQ structured data', () => {
    const { container } = render(<PremiumPage />)

    expect(screen.getByText('Premium bildirim listesi')).toBeInTheDocument()
    expect(container.querySelector('script[type="application/ld+json"]')).toBeNull()
  })
})
