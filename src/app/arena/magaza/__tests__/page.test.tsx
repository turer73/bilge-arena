import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

vi.mock('../store-tabs', () => ({
  StoreTabs: () => <div data-testid="store-tabs" />,
}))

import StorePage from '../page'

describe('StorePage', () => {
  test('rota geçişinde sabit navbar mağaza başlığını örtmez', () => {
    render(<StorePage />)

    const pageRoot = screen.getByRole('heading', { name: '🛍️ Mağaza' }).closest('[data-store-screen]')

    expect(pageRoot).toHaveClass('scroll-mt-[var(--navbar-h)]')
    expect(pageRoot).toHaveClass('max-w-[1180px]', 'md:px-5', 'lg:px-6')
    expect(screen.getByRole('link', { name: '🎨 Stüdyoya Git' })).toHaveAttribute('href', '/arena/kisisellestir')
    expect(screen.getByTestId('store-tabs')).toBeInTheDocument()
  })
})
