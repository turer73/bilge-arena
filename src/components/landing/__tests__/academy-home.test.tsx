import { fireEvent, render, screen } from '@testing-library/react'
import Link from 'next/link'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  wide: false,
  setCharacter: vi.fn(),
  character: 'female' as 'female' | 'male',
  auth: { user: null as unknown, loading: false },
}))

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, priority: _priority, loading: _loading, sizes: _sizes, ...rest } = props
    return <img {...rest} />
  },
}))
vi.mock('@/components/privacy/document-boundary-link', () => ({
  DocumentBoundaryLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/lib/hooks/use-wide-study', () => ({ useWideStudy: () => mocks.wide }))
vi.mock('@/lib/bilge/use-bilge-character', () => ({
  useBilgeCharacter: () => ({ character: mocks.character, setCharacter: mocks.setCharacter, persisted: true }),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => mocks.auth,
}))
vi.mock('../section-wrapper', () => ({
  SectionWrapper: ({ section, children }: { section: string; children: React.ReactNode }) => (
    <div data-testid={'section-wrapper-' + section}>{children}</div>
  ),
}))

import { AcademyHome } from '../academy-home'
import { HomeSurface } from '../home-surface'

const baseProps = { sections: {}, elements: [], gameCounts: {} }
beforeEach(() => {
  mocks.wide = false
  mocks.character = 'female'
  mocks.auth = { user: null, loading: false }
  mocks.setCharacter.mockReset()
})

describe('AcademyHome', () => {
  it('tek H1 ve ana hedef rotalarını gösterir', () => {
    render(<AcademyHome {...baseProps} />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('link', { name: /oyunlara git/i })).toHaveAttribute('href', '/arena')
    expect(screen.getByRole('link', { name: /çalışma alanına git/i })).toHaveAttribute('href', '/arena/calisma')
    expect(screen.getByRole('link', { name: /oda moduna git/i })).toHaveAttribute('href', '/oda')
    expect(screen.getByRole('link', { name: /kişiselleştir/i })).toHaveAttribute('href', '/arena/kisisellestir')
  })

  it('Bilge karakter seçimlerini callback ile değiştirir', () => {
    render(<AcademyHome {...baseProps} />)
    expect(screen.getByRole('button', { name: 'Kadın Bilge' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Erkek Bilge' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Erkek Bilge' }))
    expect(mocks.setCharacter).toHaveBeenCalledWith('male')
  })

  it('misafir için korumalı oyun modlarını girişe yönlendirir', () => {
    render(<AcademyHome {...baseProps} />)
    expect(screen.getByRole('link', { name: /kule modu/i })).toHaveAttribute('href', '/giris?next=%2Farena%2Fkule')
    expect(screen.getByRole('link', { name: /bil ve fethet/i })).toHaveAttribute('href', '/giris?next=%2Farena%2Ffethet')
    expect(screen.getByRole('link', { name: /wordquest/i })).toHaveAttribute('href', '/arena/wordquest')
  })

  it('CMS logo ve mini_stats değerlerini gösterir', () => {
    render(<AcademyHome {...baseProps} sections={{
      hero: {
        logo_url: '/academy/custom-logo.svg',
        mini_stats: ['12 soru', '3 oyun', 'Sonsuz tekrar'],
      },
    }} />)
    expect(document.querySelector('img[src="/academy/custom-logo.svg"]')).toBeInTheDocument()
    expect(screen.getByText('12 soru')).toBeInTheDocument()
    expect(screen.getByText('3 oyun')).toBeInTheDocument()
    expect(screen.getByText('Sonsuz tekrar')).toBeInTheDocument()
  })

  it('sahte kullanıcı veya sayaç iddiası üretmez', () => {
    render(<AcademyHome {...baseProps} />)
    expect(screen.queryByText(/aktif kullanıcı/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/soru sayısı/i)).not.toBeInTheDocument()
  })

  it('CMS hero configini ve SectionWrapper bölümlerini korur', () => {
    render(<AcademyHome {...baseProps} sections={{
      hero: {
        badge: 'CMS rozet',
        heading: ['Birinci', 'İkinci', 'Üçüncü'],
        cta_primary: { text: 'CMS oyun CTA', href: '/arena' },
        cta_secondary: { text: 'CMS ders CTA', href: '/arena/calisma' },
      },
    }} />)
    expect(screen.getByText('CMS rozet')).toBeInTheDocument()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Birinci')
    expect(heading).toHaveTextContent('İkinci')
    expect(heading).toHaveTextContent('Üçüncü')
    expect(screen.getByRole('link', { name: 'CMS oyun CTA' })).toHaveAttribute('href', '/arena')
    expect(screen.getByRole('link', { name: 'CMS ders CTA' })).toHaveAttribute('href', '/arena/calisma')
    for (const section of ['hero', 'stats', 'games', 'how_it_works', 'leaderboard', 'cta']) {
      expect(screen.getByTestId('section-wrapper-' + section)).toBeInTheDocument()
    }
  })
})

describe('HomeSurface', () => {
  it('mobilde eski children ağacını korur', () => {
    mocks.wide = false
    render(<HomeSurface {...baseProps}><div data-testid="legacy-home">mobil eski ağaç</div></HomeSurface>)
    expect(screen.getByTestId('legacy-home')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('wide ekranda AcademyHome ağacını mount eder', () => {
    mocks.wide = true
    render(<HomeSurface {...baseProps}><div data-testid="legacy-home">mobil eski ağaç</div></HomeSurface>)
    expect(screen.queryByTestId('legacy-home')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('wide ekranda yeni anasayfayı gösterir', () => {
    mocks.wide = true
    render(<HomeSurface {...baseProps}><div data-testid="legacy-home">deney eski ağaç</div></HomeSurface>)
    expect(screen.queryByTestId('legacy-home')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('wide ekranda sunucu kaynaklarını görünür tutar', () => {
    mocks.wide = true
    render(<HomeSurface {...baseProps} featuredResources={<Link href="/rehber">Rehbere git</Link>}><div>mobil içerik</div></HomeSurface>)
    expect(screen.getByRole('link', { name: 'Rehbere git' })).toHaveAttribute('href', '/rehber')
  })
})
