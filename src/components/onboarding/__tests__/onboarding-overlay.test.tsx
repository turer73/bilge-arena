/**
 * Bilge Arena: OnboardingOverlay — modal erişilebilirlik davranışı.
 *
 * Bu dosya PR#308 review'ünde açılan boşluğu kapatır: focus trap, body scroll
 * lock, focus restore ve Escape ile çıkış eklendi ama hiçbiri test edilmiyordu
 * (codecov patch %0). Burada test edilen şey görsel değil, SÖZLEŞME:
 * aria-modal="true" diyen bir diyalog klavye kullanıcısını hapsetmemeli.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const auth = vi.hoisted(() => ({
  value: { profile: null as Record<string, unknown> | null },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => auth.value }))

const refreshMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/hooks/use-auth', () => ({ refreshProfile: refreshMock }))

const routerMock = vi.hoisted(() => ({ push: vi.fn() }))
const pathnameMock = vi.hoisted(() => vi.fn<() => string>())
vi.mock('next/navigation', () => ({
  usePathname: pathnameMock,
  useRouter: () => routerMock,
}))

vi.mock('@/components/ui/bilge-chan', () => ({
  BilgeChan: () => <div data-testid="bilge-chan" />,
}))

import { OnboardingOverlay } from '../onboarding-overlay'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  vi.clearAllMocks()
  pathnameMock.mockReturnValue('/arena')
  document.body.style.overflow = ''
  auth.value.profile = { onboarding_completed: false }
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) })
})

describe('OnboardingOverlay', () => {
  test('hassas dokumandan public arenaya tam dokuman navigasyonu yapar', async () => {
    pathnameMock.mockReturnValue('/arena/sinif')
    const navigateDocument = vi.fn()
    render(<OnboardingOverlay navigateDocument={navigateDocument} />)

    fireEvent.click(screen.getByRole('button', { name: 'Atla' }))

    await waitFor(() => expect(navigateDocument).toHaveBeenCalledWith('/arena'))
    expect(routerMock.push).not.toHaveBeenCalled()
  })

  test('public dokuman icinde App Router navigasyonunu korur', async () => {
    const navigateDocument = vi.fn()
    render(<OnboardingOverlay navigateDocument={navigateDocument} />)

    fireEvent.click(screen.getByRole('button', { name: 'Atla' }))

    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/arena'))
    expect(navigateDocument).not.toHaveBeenCalled()
  })

  test('hassas dokumanda ag hatasi sonrasi da tam dokuman navigasyonu yapar', async () => {
    pathnameMock.mockReturnValue('/arena/kurum')
    fetchMock.mockRejectedValueOnce(new Error('network'))
    const navigateDocument = vi.fn()
    render(<OnboardingOverlay navigateDocument={navigateDocument} />)

    fireEvent.click(screen.getByRole('button', { name: 'Atla' }))

    await waitFor(() => expect(navigateDocument).toHaveBeenCalledWith('/arena'))
    expect(routerMock.push).not.toHaveBeenCalled()
  })

  test('onboarding tamamlanmissa hicbir sey render etmez', () => {
    auth.value.profile = { onboarding_completed: true }
    const { container } = render(<OnboardingOverlay />)
    expect(container).toBeEmptyDOMElement()
    // Kapaliyken sayfa kaydirmasina dokunmamali
    expect(document.body.style.overflow).toBe('')
  })

  test('acikken modal sozlesmesini kurar: rol, baslik bagi, scroll lock', () => {
    render(<OnboardingOverlay />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.body.style.overflow).toBe('hidden')

    // aria-labelledby AKTIF adimin basligini gostermeli (adim 0)
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(document.getElementById(labelledBy as string)).toHaveTextContent(/Ho.* Geldin/)
  })

  test('adim degisince baslik bagi yeni adima kayar (duplicate id regresyonu)', () => {
    render(<OnboardingOverlay />)
    const dialog = screen.getByRole('dialog')
    const firstId = dialog.getAttribute('aria-labelledby')

    fireEvent.click(screen.getByRole('button', { name: /Ba.*layal.*m/ }))

    const secondId = dialog.getAttribute('aria-labelledby')
    expect(secondId).not.toBe(firstId)
    expect(document.getElementById(secondId as string)).toHaveTextContent(/S.*n.*fs.*n/)
    // Ayni id iki kez DOM'da olmamali
    expect(document.querySelectorAll(`#${CSS.escape(secondId as string)}`)).toHaveLength(1)
  })

  test('Escape modali kapatir (Atla ile ayni yol)', async () => {
    render(<OnboardingOverlay />)

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method: 'PATCH',
    })))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
    expect(body.onboarding_completed).toBe(true)
  })

  test('Tab odagi diyalog icinde tutar (focus trap)', () => {
    render(<OnboardingOverlay />)
    const dialog = screen.getByRole('dialog')

    const focusable = dialog.querySelectorAll<HTMLElement>('button:not([disabled])')
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    expect(first).not.toBe(last)

    last.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    first.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  test('grade string degil number olarak gonderilir (PATCH 400 regresyonu)', async () => {
    render(<OnboardingOverlay />)

    // Adim 0 -> 1
    fireEvent.click(screen.getByRole('button', { name: /Ba.*layal.*m/ }))
    // Adim 1: sinif sec
    fireEvent.click(screen.getByRole('button', { name: '9. Sınıf' }))
    fireEvent.click(screen.getByRole('button', { name: /Devam/ }))
    // Adim 2: ders sec + oyna
    fireEvent.click(screen.getByRole('button', { name: /Matematik/ }))
    fireEvent.click(screen.getByRole('button', { name: /Hemen Oyna/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method: 'PATCH',
    })))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
    expect(body.onboarding_completed).toBe(true)
    // Grade number olmali — string gonderilirse Zod (z.number().int()) 400 doner,
    // onboarding_completed DB'de false kalir ve overlay arena'da tekrar acilir.
    expect(body.grade).toBe(9)
    expect(typeof body.grade).toBe('number')
  })

  test('PATCH basarisiz olursa oyuna gecmez (navigate yok)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({ error: 'x' }) })
    render(<OnboardingOverlay />)

    fireEvent.click(screen.getByRole('button', { name: /Ba.*layal.*m/ }))
    fireEvent.click(screen.getByRole('button', { name: /Devam/ }))
    fireEvent.click(screen.getByRole('button', { name: /Hemen Oyna/ }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method: 'PATCH',
    })))
    expect(routerMock.push).not.toHaveBeenCalled()
  })

  test('kapaninca sayfa kaydirmasini geri verir', () => {
    const { unmount } = render(<OnboardingOverlay />)
    expect(document.body.style.overflow).toBe('hidden')

    unmount()

    expect(document.body.style.overflow).toBe('')
  })
})
