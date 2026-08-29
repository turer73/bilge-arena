import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'kurum@example.com' },
  profile: { username: 'kurum-yoneticisi', role: 'user', coin_balance: 0, avatar_url: 'https://example.com/avatar.png' },
  signOut: vi.fn(),
}))
const mockUsePathname = vi.hoisted(() => vi.fn<() => string>())
vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} data-next-link="true" {...props}>{children}</a>
  ),
}))
vi.mock('@/lib/hooks/use-auth', () => ({ useAuth: () => auth }))
vi.mock('../logo', () => ({ Logo: () => <span>Bilge Arena</span> }))
vi.mock('../theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('../notification-bell', () => ({ NotificationBell: () => null }))

import { Navbar } from '../navbar'

const workspace = {
  institution: {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Bilge Pilot Kursu',
    status: 'pilot',
    studentLimit: 200,
    studentCount: 0,
    staffLimit: 6,
    staffCount: 2,
    createdAt: '2026-08-20T12:00:00.000Z',
  },
  membership: {
    memberRef: 'a'.repeat(32),
    role: 'manager',
    joinedAt: '2026-08-20T12:00:00.000Z',
  },
}

beforeEach(() => {
  mockUsePathname.mockReturnValue('/arena')
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('Navbar institution panel entry', () => {
  it('uses a settings icon instead of repeating the profile avatar on the Arena home', () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 403 }))
    render(<Navbar />)

    const accountMenu = screen.getByRole('button', { name: 'Kullanıcı menüsü' })
    expect(accountMenu.querySelector('[data-arena-account-settings-icon]')).toBeInTheDocument()
    expect(accountMenu.querySelector('img')).not.toBeInTheDocument()
  })

  it('uses native anchors for public links while a sensitive document is active', async () => {
    mockUsePathname.mockReturnValue('/arena/sinif')
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 403 }))
    render(<Navbar />)

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    for (const link of screen.getAllByRole('link', { name: 'Ana Sayfa' })) {
      expect(link).not.toHaveAttribute('data-next-link')
    }
    for (const link of screen.getAllByRole('link', { name: 'Oyunlar' })) {
      expect(link).not.toHaveAttribute('data-next-link')
    }
  })

  it('keeps a persistent institution-panel return link for scoped users', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(workspace))
    const user = userEvent.setup()
    render(<Navbar />)

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/institution/workspace',
      expect.objectContaining({ cache: 'no-store' }),
    ))
    await user.click(screen.getByRole('button', { name: 'Kullanıcı menüsü' }))
    expect(await screen.findByRole('link', { name: 'Kurum Paneli' })).toHaveAttribute('href', '/arena/kurum')
    expect(screen.queryByRole('link', { name: 'Admin Panel' })).not.toBeInTheDocument()
  })

  it('does not advertise institution access when the workspace denies it', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 403 }))
    const user = userEvent.setup()
    render(<Navbar />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Kullanıcı menüsü' }))
    expect(screen.queryByRole('link', { name: 'Kurum Paneli' })).not.toBeInTheDocument()
  })

  it('fails closed when a successful response does not match the workspace contract', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ institution: { name: 'Eksik' } }))
    const user = userEvent.setup()
    render(<Navbar />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Kullanıcı menüsü' }))
    expect(screen.queryByRole('link', { name: 'Kurum Paneli' })).not.toBeInTheDocument()
  })
})
