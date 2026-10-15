import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/privacy/document-boundary-link', () => ({
  DocumentBoundaryLink: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a>,
}))
vi.mock('next/image', () => ({
  default: ({ priority: _priority, alt, ...props }: React.ComponentProps<'img'> & { priority?: boolean }) => <img alt={alt ?? ''} {...props} />,
}))
vi.mock('@/stores/ui-store', () => ({
  useUIStore: (select: (state: { theme: string }) => unknown) => select({ theme: 'night' }),
  DARK_THEMES: new Set(['night']),
}))

import { Logo } from '../logo'

describe('Logo accessible name', () => {
  it('uses visible brand and exam text when it is shown', () => {
    render(<Logo />)
    const link = screen.getByRole('link', { name: /Bilge Arena YKS.*LGS.*AYT/ })
    expect(link).not.toHaveAttribute('aria-label')
  })

  it('keeps an explicit name for an icon-only logo', () => {
    render(<Logo showText={false} />)
    expect(screen.getByRole('link', { name: 'Bilge Arena ana sayfa' })).toBeInTheDocument()
  })
})
