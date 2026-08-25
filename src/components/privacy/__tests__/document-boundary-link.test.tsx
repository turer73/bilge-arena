import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ pathname: '/arena' }))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} data-next-link="true" {...props}>{children}</a>
  ),
}))

import { DocumentBoundaryLink, requiresDocumentNavigation } from '../document-boundary-link'

describe('DocumentBoundaryLink', () => {
  afterEach(() => {
    cleanup()
    mocks.pathname = '/arena'
  })

  it('uses native navigation before a public document can prefetch sensitive RSC data', () => {
    render(<DocumentBoundaryLink href="/arena/sinif">Sınıflarım</DocumentBoundaryLink>)
    expect(screen.getByRole('link', { name: 'Sınıflarım' })).not.toHaveAttribute('data-next-link')
  })

  it('keeps same-boundary application links on the App Router', () => {
    render(<DocumentBoundaryLink href="/arena/matematik">Matematik</DocumentBoundaryLink>)
    expect(screen.getByRole('link', { name: 'Matematik' })).toHaveAttribute('data-next-link', 'true')
  })

  it('uses native navigation from a sensitive document back to a public page', () => {
    mocks.pathname = '/admin/sorular'
    render(<DocumentBoundaryLink href="/arena">Arena</DocumentBoundaryLink>)
    expect(screen.getByRole('link', { name: 'Arena' })).not.toHaveAttribute('data-next-link')
  })

  it('does not send external or protocol-relative URLs through the App Router', () => {
    expect(requiresDocumentNavigation('/arena', 'https://example.com/admin')).toBe(true)
    expect(requiresDocumentNavigation('/arena', '//example.com/admin')).toBe(true)
  })
})
