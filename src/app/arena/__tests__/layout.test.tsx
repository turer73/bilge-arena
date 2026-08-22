import { describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/components/layout/navbar', () => ({ Navbar: () => <div data-testid="navbar" /> }))
vi.mock('@/components/layout/bottom-nav', () => ({ BottomNav: () => <div data-testid="bottom-nav" /> }))
vi.mock('@/components/layout/arena-auxiliaries', () => ({ ArenaAuxiliaries: () => null }))

import ArenaLayout from '../layout'

describe('ArenaLayout', () => {
  test('mobil içeriği alt menü yüksekliği ve safe-area kadar yukarıda tutar', () => {
    const { container } = render(
      <ArenaLayout>
        <div>İçerik</div>
      </ArenaLayout>,
    )
    const main = container.querySelector('main')

    expect(main?.className).toContain('pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))]')
    expect(main?.className).toContain('scroll-pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))]')
    expect(main?.className).toContain('overflow-x-clip')
    expect(main?.className).toContain('min-w-0')
  })
})
