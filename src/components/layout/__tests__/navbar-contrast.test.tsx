import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mockUsePathname = vi.hoisted(() => vi.fn<() => string>())
vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))
vi.mock('@/lib/hooks/use-auth', () => ({ useAuth: () => ({ user: null, profile: null, signOut: vi.fn() }) }))
vi.mock('@/lib/hooks/use-wide-study', () => ({ useWideStudy: () => true }))
vi.mock('../logo', () => ({ Logo: () => <span>Bilge Arena</span> }))
vi.mock('../theme-toggle', () => ({ ThemeToggle: () => <button>Tema seç</button> }))
vi.mock('../notification-bell', () => ({ NotificationBell: () => null }))

import { Navbar } from '../navbar'
import { AcademyLogo } from '@/components/academy/academy-logo'

describe('Navbar etkin bağlantı rengi', () => {
  it('metin için --focus-text kullanır; --focus koyu temada 3,76 kontrastta kalıyordu', () => {
    mockUsePathname.mockReturnValue('/arena/siralama')
    render(<Navbar />)
    const active = screen.getAllByRole('link', { name: 'Sıralama' }).find(link => link.getAttribute('aria-current') === 'page')!
    expect(active.className).toContain('text-[var(--focus-text)]')
    expect(active.className).not.toMatch(/(^|\s)text-\[var\(--focus\)\]/)
  })
})

describe('AcademyLogo erişilebilir adı', () => {
  it('her genişlikte "Bilge Arena ana sayfa"; dekoratif yazı ekran okuyucudan gizli', () => {
    render(<AcademyLogo />)
    const link = screen.getByRole('link', { name: 'Bilge Arena ana sayfa' })
    expect(link).not.toHaveAttribute('aria-label')
    const wordmark = link.querySelector('[aria-hidden="true"]')!
    expect(wordmark).toHaveTextContent('BİLGE ARENA')
    // Dar ekran gizlemesi yalnız yazıyı hedefler; adı taşıyan sr-only metni değil.
    const css = readFileSync(join(process.cwd(), 'src/components/academy/academy.module.css'), 'utf8')
    expect(css).not.toMatch(/\.logo>span\{display:none\}/)
    expect(css).toMatch(/\.logo>\.wordmark\{display:none\}/)
  })
})

describe('Ders metni tema payı', () => {
  it('varsayılan tema bloğunda 65%, gün ışığında 40% tanımlıdır', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    const block = (selector: string) => {
      const blocks = [...css.matchAll(new RegExp(`(^|\\n)${selector.replace(/[[\]"=]/g, m => `\\${m}`)} \\{([^}]*)\\}`, 'g'))]
      return blocks.map(m => m[2]).join('\n')
    }
    expect(block('[data-theme]')).toMatch(/--app-subject-text-share: 65%;/)
    expect(block('[data-theme="light"]')).toMatch(/--app-subject-text-share: 40%;/)
  })
})
