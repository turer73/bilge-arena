import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mockUsePathname = vi.hoisted(() => vi.fn<() => string>())
vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))
vi.mock('@/lib/hooks/use-auth', () => ({ useAuth: () => ({ user: null, profile: null, signOut: vi.fn() }) }))
vi.mock('../logo', () => ({ Logo: () => <span data-legacy-logo>Bilge Arena</span> }))
vi.mock('../theme-toggle', () => ({ ThemeToggle: () => <button>Tema seç</button> }))
vi.mock('../notification-bell', () => ({ NotificationBell: () => null }))

import { Navbar } from '../navbar'

function innerRow(container: HTMLElement) {
  return container.querySelector('[data-app-navbar] > div')!.className.split(/\s+/)
}

describe('Navbar yatay hizası', () => {
  it('ana sayfada içerikle aynı dolgu ölçeğini yalnız keyfi kesme noktalarıyla kurar', () => {
    mockUsePathname.mockReturnValue('/')
    const { container } = render(<Navbar variant="home" />)
    const classes = innerRow(container)
    // academy-home.module.css .root: 16px, ≥768 20px, ≥851 24px, ≥1101 40px
    expect(classes).toEqual(expect.arrayContaining(['px-4', 'min-[768px]:px-5', 'min-[851px]:px-6', 'min-[1101px]:px-10']))
    // Tailwind v4 adlı kesme noktalarını keyfi min-[…] kurallarından sonra yazar;
    // ikisi karışırsa adlı olan kazanır ve 40px hiç uygulanmaz.
    expect(classes.filter(name => /^(sm|md|lg|xl|2xl):p[xlr]-/.test(name))).toEqual([])
  })

  it('diğer rotalarda mevcut dolguyu korur', () => {
    mockUsePathname.mockReturnValue('/arena/profil')
    const { container } = render(<Navbar />)
    const classes = innerRow(container)
    expect(classes).toEqual(expect.arrayContaining(['px-6', 'lg:px-8']))
    expect(classes).not.toContain('min-[1101px]:px-10')
  })
})
