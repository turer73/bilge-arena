import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/consent', () => ({ getCookieConsent: () => null, setCookieConsent: vi.fn() }))
vi.mock('@/components/privacy/document-boundary-link', () => ({
  DocumentBoundaryLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}))

import { CookieBanner } from '../cookie-banner'

afterEach(() => vi.useRealTimers())

describe('CookieBanner yer işareti', () => {
  it('bant metni adlı bir bölge içinde açılır (axe region)', () => {
    vi.useFakeTimers()
    render(<CookieBanner />)
    act(() => { vi.advanceTimersByTime(1600) })
    const region = screen.getByRole('region', { name: 'Çerez tercihleri' })
    expect(region).toHaveAttribute('data-cookie-banner')
    expect(region).toHaveTextContent('Zorunlu çerezler dışında')
  })
})
