import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

vi.mock('../store-tabs', () => ({
  StoreTabs: () => <div data-testid="store-tabs" />,
}))

import StorePage from '../page'

describe('StorePage', () => {
  test('rota geçişinde sabit navbar mağaza başlığını örtmez', () => {
    render(<StorePage />)

    const pageRoot = screen.getByRole('heading', { name: '🛍️ Mağaza' }).parentElement

    expect(pageRoot).toHaveClass('scroll-mt-[var(--navbar-h)]')
    expect(screen.getByTestId('store-tabs')).toBeInTheDocument()
  })
})
