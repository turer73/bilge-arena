import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ISR yeniden üretimi kök sayfayı `/index` yoluyla çizer (canlı RSC yükünde
// `"c":["","index"]`); tarayıcıdaki router ise `/` döner. Bu test sunucu HTML'ini
// `/index`, hydration'ı `/` ile kurup gerçek React hydration denetimini koşar.
const mockUsePathname = vi.hoisted(() => vi.fn<() => string>())
vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))
vi.mock('@/lib/hooks/use-auth', () => ({ useAuth: () => ({ user: null, profile: null, signOut: vi.fn() }) }))
vi.mock('../logo', () => ({ Logo: () => <span data-legacy-logo>Bilge Arena</span> }))
vi.mock('../theme-toggle', () => ({ ThemeToggle: () => <button>Tema seç</button> }))
vi.mock('../notification-bell', () => ({ NotificationBell: () => null }))

import { Navbar } from '../navbar'

const ISR_ROOT_PATH = '/index'

function stubViewport(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

async function hydrateHome(element: React.ReactElement) {
  mockUsePathname.mockReturnValue(ISR_ROOT_PATH)
  const container = document.createElement('div')
  container.innerHTML = renderToString(element)
  document.body.appendChild(container)
  const serverHtml = container.innerHTML

  mockUsePathname.mockReturnValue('/')
  const recoverableErrors: unknown[] = []
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  let root: ReturnType<typeof hydrateRoot> | undefined
  await act(async () => {
    root = hydrateRoot(container, element, {
      onRecoverableError: (error) => recoverableErrors.push(error),
    })
  })
  const hydrationLogs = consoleError.mock.calls.filter((args) => /hydrat/i.test(args.map(String).join(' ')))
  consoleError.mockRestore()
  return { container, serverHtml, recoverableErrors, hydrationLogs, unmount: () => act(() => root?.unmount()) }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('Navbar home hydration under ISR root path', () => {
  it.each([
    ['mobile', false],
    ['desktop', true],
  ])('hydrates the home variant without a mismatch on %s', async (_label, wide) => {
    stubViewport(wide)
    const { container, serverHtml, recoverableErrors, hydrationLogs, unmount } = await hydrateHome(<Navbar variant="home" />)

    expect(recoverableErrors).toEqual([])
    expect(hydrationLogs).toEqual([])
    // Sunucu HTML'i istemcinin beklediği ana sayfa navbar'ıdır.
    expect(serverHtml).toContain('/academy/brand-crest-orbit.png')
    expect(serverHtml).not.toContain('data-legacy-logo')
    expect(container.querySelector('a[aria-current="page"]')).toHaveAttribute('href', '/')
    expect(container.querySelector('[data-navbar-theme]')).toHaveClass('hidden')
    await unmount()
  })

  it('reproduces React #418 when the home navbar is derived from the router path', async () => {
    stubViewport(false)
    const { serverHtml, recoverableErrors, unmount } = await hydrateHome(<Navbar />)

    // Düzeltme öncesi davranış: sunucu eski logoyu, istemci Academy logosunu çizer.
    expect(serverHtml).toContain('data-legacy-logo')
    expect(recoverableErrors.length).toBeGreaterThan(0)
    expect(String(recoverableErrors[0])).toMatch(/hydrat|server rendered HTML/i)
    await unmount()
  })
})
